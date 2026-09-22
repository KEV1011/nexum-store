"""Estrategia declarativa: se describe con condiciones, no con codigo de motor.

El stop se calcula a partir del ATR y NO de un porcentaje fijo: un stop del 2%
es holgado en un activo tranquilo y absurdamente estrecho en uno que se mueve
15% al dia. Con ATR el stop se adapta solo a lo que ese mercado esta haciendo.
"""

from __future__ import annotations

from typing import Sequence

from . import indicadores as ind
from .motor import LARGO, Contexto, Estrategia, Intencion, Lado
from .senales import Condicion, cuales_se_cumplen, indicadores_de, todas_se_cumplen
from .velas import Serie


class EstrategiaDeCondiciones(Estrategia):
    """Entra cuando se cumplen TODAS las condiciones. Sale por lo que ocurra
    primero: stop, objetivo, condicion de salida o limite de barras.

    salida_por_arrastre: si es > 0, el stop persigue al precio a esa distancia
        en ATR y nunca retrocede. Es lo que separa una estrategia de tendencia
        que gana de una que devuelve todo lo ganado en la vuelta.
    """

    def __init__(
        self,
        entrada: Sequence[Condicion],
        nombre: str = "estrategia",
        lado: Lado = LARGO,
        riesgo_pct: float = 1.0,
        atr_periodo: int = 14,
        stop_en_atr: float = 2.0,
        objetivo_en_r: float | None = 3.0,
        salida: Sequence[Condicion] = (),
        max_barras: int | None = None,
        salida_por_arrastre: float = 0.0,
    ):
        if not entrada:
            raise ValueError("una estrategia sin condiciones de entrada compraria siempre")
        if stop_en_atr <= 0:
            raise ValueError("el stop debe estar a una distancia positiva")
        if riesgo_pct <= 0 or riesgo_pct > 100:
            raise ValueError("riesgo_pct fuera de rango")
        if riesgo_pct > 5:
            # No se bloquea -- es su dinero -- pero que quede dicho.
            import warnings

            warnings.warn(
                f"riesgo del {riesgo_pct}% por operacion: 10 perdidas seguidas "
                "(que ocurren) se llevarian casi la mitad de la cuenta",
                stacklevel=2,
            )
        self.entrada = list(entrada)
        self.salida = list(salida)
        self.nombre = nombre
        self.lado = lado
        self.riesgo_pct = riesgo_pct
        self.atr_periodo = atr_periodo
        self.stop_en_atr = stop_en_atr
        self.objetivo_en_r = objetivo_en_r
        self.max_barras = max_barras
        self.arrastre = salida_por_arrastre

    @property
    def clave_atr(self) -> str:
        return f"atr_{self.atr_periodo}"

    def preparar(self, serie: Serie) -> dict[str, list]:
        todos = indicadores_de(self.entrada + self.salida, serie)
        todos.setdefault(
            self.clave_atr,
            ind.atr(serie.maximos(), serie.minimos(), serie.cierres(), self.atr_periodo),
        )
        return todos

    def evaluar(self, ctx: Contexto) -> Intencion | None:
        atr = ctx.ind(self.clave_atr)

        if ctx.hay_posicion():
            p = ctx.posicion
            if self.arrastre > 0 and atr is not None:
                # El stop persigue al precio y NUNCA afloja.
                if p.lado == LARGO:
                    nuevo = ctx.cierre() - atr * self.arrastre
                    if p.stop is None or nuevo > p.stop:
                        p.stop = nuevo
                else:
                    nuevo = ctx.cierre() + atr * self.arrastre
                    if p.stop is None or nuevo < p.stop:
                        p.stop = nuevo
            if self.max_barras is not None and (ctx.i - p.indice_entrada) >= self.max_barras:
                return Intencion("cerrar", razon="max_barras")
            if self.salida and todas_se_cumplen(self.salida, ctx):
                return Intencion("cerrar", razon="senal_salida")
            return None

        if atr is None or atr <= 0:
            return None
        if not todas_se_cumplen(self.entrada, ctx):
            return None

        # El stop se fija desde el ultimo cierre CONOCIDO. La entrada real sera
        # la apertura de la barra siguiente, que todavia no existe: es la misma
        # informacion que tendria alguien operando en vivo.
        referencia = ctx.cierre()
        distancia = atr * self.stop_en_atr
        if self.lado == LARGO:
            stop = referencia - distancia
            objetivo = referencia + distancia * self.objetivo_en_r if self.objetivo_en_r else None
        else:
            stop = referencia + distancia
            objetivo = referencia - distancia * self.objetivo_en_r if self.objetivo_en_r else None

        return Intencion(
            accion="abrir",
            lado=self.lado,
            riesgo_pct=self.riesgo_pct,
            stop=stop,
            objetivo=objetivo,
            razon=" + ".join(cuales_se_cumplen(self.entrada, ctx)),
        )


class ComprarYMantener(Estrategia):
    """La referencia contra la que TODA estrategia tiene que competir.

    Si una estrategia con 400 operaciones, sus comisiones y su riesgo no bate a
    comprar y esperar, no existe. Es la comparacion que casi ningun informe de
    backtest incluye, justamente porque suele perderla.
    """

    nombre = "comprar y mantener"

    def evaluar(self, ctx: Contexto) -> Intencion | None:
        if ctx.i == 0 and not ctx.hay_posicion():
            # Stop tecnico muy lejano: no se quiere salir nunca, pero el motor
            # exige un stop para poder dimensionar la posicion.
            return Intencion("abrir", LARGO, 100.0, ctx.cierre() * 0.01, None, "compra inicial")
        return None
