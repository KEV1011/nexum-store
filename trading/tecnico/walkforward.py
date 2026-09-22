"""Validacion walk-forward: optimizar en el pasado, medir en lo que vino despues.

Probar 500 combinaciones de parametros sobre toda la historia y quedarse con
la mejor no encuentra una estrategia, encuentra el ruido que mejor encaja en
ESA historia concreta. Es el fallo que mas backtests brillantes produce.

Aqui los parametros se eligen mirando SOLO la ventana de entrenamiento, y el
resultado que se reporta es el de la ventana siguiente, que la optimizacion no
vio. Despues la ventana avanza y se repite.

Y se publica una segunda cosa que casi nadie mira: LA ESTABILIDAD DE LOS
PARAMETROS ELEGIDOS. Si cada tramo gana con parametros distintos, no hay nada
que aprender del pasado -- aunque el resultado fuera de muestra salga positivo
por casualidad.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable, Sequence

from .costos import Costos
from .metricas import Metricas, calcular
from .motor import Contexto, Estrategia, Intencion, Operacion, Resultado, backtest
from .velas import Serie

Constructor = Callable[[dict], Estrategia]


class _SoloDesde(Estrategia):
    """Envuelve una estrategia para que NO abra posiciones antes de `desde`.

    Las barras anteriores siguen alimentando los indicadores (calentamiento),
    pero no producen operaciones: sin esto, cada tramo empezaria con medias sin
    formar y las primeras senales serian basura.
    """

    def __init__(self, base: Estrategia, desde: int):
        self.base, self.desde = base, desde
        self.nombre = base.nombre

    def preparar(self, serie):
        return self.base.preparar(serie)

    def evaluar(self, ctx: Contexto) -> Intencion | None:
        intencion = self.base.evaluar(ctx)
        if intencion is not None and intencion.accion == "abrir" and ctx.i < self.desde:
            return None
        return intencion


@dataclass
class Tramo:
    indice: int
    parametros: dict
    metricas_entrenamiento: Metricas
    metricas_prueba: Metricas
    operaciones: list[Operacion] = field(default_factory=list)


@dataclass
class ResultadoWF:
    tramos: list[Tramo] = field(default_factory=list)
    advertencias: list[str] = field(default_factory=list)

    @property
    def operaciones_fuera_de_muestra(self) -> list[Operacion]:
        ops: list[Operacion] = []
        for t in self.tramos:
            ops.extend(t.operaciones)
        return ops

    def estabilidad(self) -> dict[str, float]:
        """Por cada parametro, que proporcion de tramos eligio el valor mas
        repetido. 1.0 = siempre el mismo (estable). 0.2 = cada tramo uno
        distinto (no hay nada que aprender)."""
        if not self.tramos:
            return {}
        salida: dict[str, float] = {}
        for clave in self.tramos[0].parametros:
            valores = [t.parametros.get(clave) for t in self.tramos]
            mas_comun = max(set(map(repr, valores)), key=lambda v: list(map(repr, valores)).count(v))
            salida[clave] = list(map(repr, valores)).count(mas_comun) / len(valores)
        return salida

    def resumen(self) -> str:
        if not self.tramos:
            lineas = ["  ningun tramo produjo un resultado evaluable"]
            lineas += [f"  >> {a}" for a in self.advertencias]
            if not self.advertencias:
                lineas.append("  >> sin motivo registrado: revisa el tamano de las ventanas")
            return "\n".join(lineas)
        lineas = [f"  tramos fuera de muestra: {len(self.tramos)}"]
        for t in self.tramos:
            params = ", ".join(f"{k}={v}" for k, v in t.parametros.items())
            e, p = t.metricas_entrenamiento, t.metricas_prueba
            lineas.append(
                f"   #{t.indice:>2}  {params:<36} "
                f"entreno {e.rentabilidad_pct:+7.2f}%  ->  prueba {p.rentabilidad_pct:+7.2f}%  "
                f"({p.operaciones} ops)"
            )
        est = self.estabilidad()
        if est:
            lineas.append("  estabilidad de parametros (1.00 = el mismo valor en todos los tramos):")
            for k, v in sorted(est.items()):
                marca = "" if v >= 0.6 else "   <-- inestable: es ruido, no una regla"
                lineas.append(f"    {k:<22} {v:.2f}{marca}")
        for a in self.advertencias:
            lineas.append(f"  >> {a}")
        return "\n".join(lineas)


def rejilla(opciones: dict[str, Sequence]) -> list[dict]:
    """Producto cartesiano de parametros: {'ema': [20,50]} -> [{'ema':20},{'ema':50}]."""
    combinaciones: list[dict] = [{}]
    for clave, valores in opciones.items():
        combinaciones = [dict(c, **{clave: v}) for c in combinaciones for v in valores]
    return combinaciones


def _puntuar(m: Metricas) -> float:
    """Criterio de seleccion dentro del entrenamiento.

    NO se usa la rentabilidad a secas: la combinacion mas rentable suele ser la
    que hizo cuatro operaciones afortunadas. Se exige un minimo de operaciones
    y se puntua por rentabilidad ajustada a la peor caida, que es lo que de
    verdad se puede sostener.
    """
    if m.operaciones < 10:
        return float("-inf")
    caida = max(m.max_drawdown_pct, 1.0)
    return m.rentabilidad_pct / caida


def walk_forward(
    serie: Serie,
    construir: Constructor,
    parametros: Iterable[dict],
    costos: Costos,
    barras_entrenamiento: int = 2000,
    barras_prueba: int = 500,
    calentamiento: int = 210,
    capital_inicial: float = 10_000.0,
) -> ResultadoWF:
    combinaciones = list(parametros)
    if not combinaciones:
        raise ValueError("no hay ni una combinacion de parametros que probar")

    res = ResultadoWF()
    necesarias = calentamiento + barras_entrenamiento + barras_prueba
    if len(serie) < necesarias:
        res.advertencias.append(
            f"la serie tiene {len(serie)} velas y hacen falta {necesarias} "
            f"para un solo tramo; no se puede validar nada"
        )
        return res

    inicio = calentamiento
    indice = 0
    while inicio + barras_entrenamiento + barras_prueba <= len(serie):
        fin_entrenamiento = inicio + barras_entrenamiento
        fin_prueba = fin_entrenamiento + barras_prueba

        # --- 1. elegir parametros viendo SOLO el entrenamiento
        tramo_entrenamiento = serie.recorte(inicio - calentamiento, fin_entrenamiento)
        mejor, mejor_punto, mejor_metricas = None, float("-inf"), None
        for combo in combinaciones:
            try:
                r = backtest(
                    tramo_entrenamiento,
                    _SoloDesde(construir(combo), calentamiento),
                    costos,
                    capital_inicial,
                    exigir_serie_limpia=False,
                )
            except ValueError:
                continue
            m = calcular(r)
            punto = _puntuar(m)
            if punto > mejor_punto:
                mejor, mejor_punto, mejor_metricas = combo, punto, m

        if mejor is None:
            res.advertencias.append(
                f"tramo #{indice}: ninguna combinacion llego a 10 operaciones en el entrenamiento"
            )
            inicio += barras_prueba
            indice += 1
            continue

        # --- 2. medir en la ventana siguiente, que la optimizacion no vio
        tramo_prueba = serie.recorte(fin_entrenamiento - calentamiento, fin_prueba)
        r_prueba = backtest(
            tramo_prueba,
            _SoloDesde(construir(mejor), calentamiento),
            costos,
            capital_inicial,
            exigir_serie_limpia=False,
        )
        m_prueba = calcular(r_prueba)
        res.tramos.append(
            Tramo(indice, dict(mejor), mejor_metricas, m_prueba, list(r_prueba.operaciones))
        )

        inicio += barras_prueba
        indice += 1

    if res.tramos:
        positivos = sum(1 for t in res.tramos if t.metricas_prueba.rentabilidad_pct > 0)
        res.advertencias.append(
            f"{positivos} de {len(res.tramos)} tramos fuera de muestra fueron rentables"
        )
        caida_entreno = sum(t.metricas_entrenamiento.rentabilidad_pct for t in res.tramos)
        caida_prueba = sum(t.metricas_prueba.rentabilidad_pct for t in res.tramos)
        if caida_entreno > 0 and caida_prueba < caida_entreno * 0.3:
            res.advertencias.append(
                "el resultado fuera de muestra es menos de un tercio del de entrenamiento: "
                "la optimizacion esta encontrando ruido"
            )
    return res
