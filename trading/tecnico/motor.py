"""Motor de backtest por eventos.

Las tres reglas que lo separan de un backtest que miente:

1. UNA SENAL VISTA EN EL CIERRE DE LA BARRA i SE EJECUTA EN LA APERTURA DE i+1.
   Nunca dentro de la barra que la genero. Es el error numero uno y el mas
   rentable sobre el papel: decidir con el cierre de una vela y comprar a un
   precio de esa misma vela es comprar sabiendo el futuro.

2. SI EL STOP Y EL OBJETIVO CAEN EN LA MISMA BARRA, SE ASUME EL STOP.
   Con datos de vela no se sabe cual toco primero. Asumir el objetivo infla
   sistematicamente el resultado de cualquier estrategia con ambos niveles.

3. UN HUECO POR DEBAJO DEL STOP SE LLENA EN LA APERTURA, NO EN EL STOP.
   El stop no es un precio garantizado, es una orden que se dispara. En una
   vela de liquidacion se sale mucho peor que el nivel escrito.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal

from .costos import Costos, periodos_de_financiacion
from .velas import Serie, Vela

Lado = Literal[1, -1]
LARGO: Lado = 1
CORTO: Lado = -1


@dataclass(frozen=True, slots=True)
class Intencion:
    """Lo que una estrategia pide. Se ejecuta en la apertura de la barra siguiente.

    riesgo_pct: porcentaje del capital que se pierde SI salta el stop. Es la
        forma correcta de dimensionar: fija la perdida, no el tamano. Con un
        stop lejano compra menos unidades, con uno cercano compra mas, y en
        ambos casos se arriesga lo mismo.
    """

    accion: Literal["abrir", "cerrar"]
    lado: Lado = LARGO
    riesgo_pct: float = 1.0
    stop: float | None = None
    objetivo: float | None = None
    razon: str = ""


@dataclass(slots=True)
class Posicion:
    lado: Lado
    unidades: float
    precio_entrada: float
    ms_entrada: int
    indice_entrada: int
    stop: float | None
    objetivo: float | None
    razon: str
    comision_entrada: float

    def nocional(self, precio: float) -> float:
        return self.unidades * precio

    def valor_no_realizado(self, precio: float) -> float:
        return (precio - self.precio_entrada) * self.unidades * self.lado


@dataclass(frozen=True, slots=True)
class Operacion:
    """Una operacion ya cerrada, con TODOS sus costos imputados."""

    lado: Lado
    ms_entrada: int
    ms_salida: int
    indice_entrada: int
    indice_salida: int
    precio_entrada: float
    precio_salida: float
    unidades: float
    bruto: float
    comisiones: float
    financiacion: float
    razon_entrada: str
    razon_salida: str

    @property
    def neto(self) -> float:
        return self.bruto - self.comisiones - self.financiacion

    @property
    def barras(self) -> int:
        return self.indice_salida - self.indice_entrada

    @property
    def ganadora(self) -> bool:
        return self.neto > 0


class Contexto:
    """Lo que la estrategia puede ver: datos hasta la barra i, ni uno mas.

    No expone la serie completa a proposito. Pedir `cierre(-1)` revienta en vez
    de devolver el futuro silenciosamente.
    """

    __slots__ = ("serie", "i", "posicion", "equity", "_ind")

    def __init__(self, serie: Serie, i: int, posicion: Posicion | None, equity: float, ind: dict):
        self.serie = serie
        self.i = i
        self.posicion = posicion
        self.equity = equity
        self._ind = ind

    @property
    def vela(self) -> Vela:
        return self.serie[self.i]

    def _indice(self, atras: int) -> int:
        if atras < 0:
            raise ValueError("mirar hacia adelante no esta permitido (atras < 0)")
        j = self.i - atras
        if j < 0:
            raise IndexError("no hay tantas barras de historia")
        return j

    def cierre(self, atras: int = 0) -> float:
        return self.serie[self._indice(atras)].cierre

    def maximo(self, atras: int = 0) -> float:
        return self.serie[self._indice(atras)].maximo

    def minimo(self, atras: int = 0) -> float:
        return self.serie[self._indice(atras)].minimo

    def ind(self, nombre: str, atras: int = 0) -> float | None:
        """Valor de un indicador precalculado. None si aun no esta formado."""
        serie_ind = self._ind.get(nombre)
        if serie_ind is None:
            raise KeyError(f"indicador no preparado: {nombre!r}")
        return serie_ind[self._indice(atras)]

    def hay_posicion(self) -> bool:
        return self.posicion is not None


class Estrategia:
    """Contrato minimo.

    `preparar` recibe la serie completa para precalcular indicadores de una
    sola vez. Eso es seguro UNICAMENTE porque los indicadores del paquete son
    causales y hay una prueba que lo exige (tests/test_indicadores.py). Si
    alguien precalcula aqui algo que mira al futuro -- una normalizacion por el
    maximo de toda la serie, por ejemplo -- el motor no puede detectarlo.
    """

    nombre = "sin nombre"

    def preparar(self, serie: Serie) -> dict[str, list]:
        return {}

    def evaluar(self, ctx: Contexto) -> Intencion | None:
        raise NotImplementedError


@dataclass
class Resultado:
    estrategia: str
    simbolo: str
    marco: str
    capital_inicial: float
    operaciones: list[Operacion] = field(default_factory=list)
    equity: list[float] = field(default_factory=list)
    marcas: list[int] = field(default_factory=list)
    advertencias: list[str] = field(default_factory=list)
    barras_evaluadas: int = 0

    @property
    def capital_final(self) -> float:
        return self.equity[-1] if self.equity else self.capital_inicial


def _tamano_por_riesgo(equity: float, riesgo_pct: float, entrada: float, stop: float) -> float:
    distancia = abs(entrada - stop)
    if distancia <= 0:
        return 0.0
    return (equity * riesgo_pct / 100.0) / distancia


def backtest(
    serie: Serie,
    estrategia: Estrategia,
    costos: Costos,
    capital_inicial: float = 10_000.0,
    maker_en_entrada: bool = False,
    exigir_serie_limpia: bool = True,
    al_cerrar: Callable[[Operacion], None] | None = None,
) -> Resultado:
    """Ejecuta la estrategia barra a barra sobre la serie."""
    res = Resultado(estrategia.nombre, serie.simbolo, serie.marco, capital_inicial)

    problemas = serie.validar()
    if problemas:
        clases = sorted({p.clase for p in problemas})
        aviso = f"la serie tiene {len(problemas)} problema(s): {', '.join(clases)}"
        if exigir_serie_limpia:
            raise ValueError(
                aviso + ". Corrige los datos o pasa exigir_serie_limpia=False "
                "asumiendo que el resultado no es fiable."
            )
        res.advertencias.append(aviso)

    indicadores = estrategia.preparar(serie)
    for nombre, valores in indicadores.items():
        if len(valores) != len(serie):
            raise ValueError(
                f"el indicador {nombre!r} tiene {len(valores)} valores y la serie {len(serie)}; "
                "un indicador desalineado desplaza las senales en el tiempo"
            )

    efectivo = capital_inicial
    posicion: Posicion | None = None
    pendiente: Intencion | None = None

    def abrir(intencion: Intencion, referencia: float, vela: Vela, i: int) -> None:
        nonlocal efectivo, posicion
        if intencion.stop is None:
            res.advertencias.append(f"barra {i}: intencion sin stop, descartada")
            return
        precio = (
            costos.precio_de_compra(referencia)
            if intencion.lado == LARGO
            else costos.precio_de_venta(referencia)
        )
        # Coherencia del stop: por debajo para un largo, por encima para un corto.
        if intencion.lado == LARGO and intencion.stop >= precio:
            res.advertencias.append(f"barra {i}: stop de largo por encima de la entrada")
            return
        if intencion.lado == CORTO and intencion.stop <= precio:
            res.advertencias.append(f"barra {i}: stop de corto por debajo de la entrada")
            return
        unidades = _tamano_por_riesgo(efectivo, intencion.riesgo_pct, precio, intencion.stop)
        if unidades <= 0:
            return
        comision = costos.comision(unidades * precio, maker=maker_en_entrada)
        efectivo -= comision
        posicion = Posicion(
            lado=intencion.lado,
            unidades=unidades,
            precio_entrada=precio,
            ms_entrada=vela.apertura_ms,
            indice_entrada=i,
            stop=intencion.stop,
            objetivo=intencion.objetivo,
            razon=intencion.razon,
            comision_entrada=comision,
        )

    def cerrar(referencia: float, vela: Vela, i: int, razon: str) -> None:
        nonlocal efectivo, posicion
        assert posicion is not None
        p = posicion
        precio = (
            costos.precio_de_venta(referencia)
            if p.lado == LARGO
            else costos.precio_de_compra(referencia)
        )
        bruto = (precio - p.precio_entrada) * p.unidades * p.lado
        comision_salida = costos.comision(p.unidades * precio)
        periodos = periodos_de_financiacion(p.ms_entrada, vela.apertura_ms)
        fin = costos.financiacion(p.unidades * p.precio_entrada, periodos, p.lado)
        efectivo += bruto - comision_salida - fin
        op = Operacion(
            lado=p.lado,
            ms_entrada=p.ms_entrada,
            ms_salida=vela.apertura_ms,
            indice_entrada=p.indice_entrada,
            indice_salida=i,
            precio_entrada=p.precio_entrada,
            precio_salida=precio,
            unidades=p.unidades,
            bruto=bruto,
            comisiones=p.comision_entrada + comision_salida,
            financiacion=fin,
            razon_entrada=p.razon,
            razon_salida=razon,
        )
        res.operaciones.append(op)
        posicion = None
        if al_cerrar:
            al_cerrar(op)

    for i, vela in enumerate(serie):
        # --- 1. se ejecuta lo que se decidio en la barra anterior, a la apertura
        if pendiente is not None:
            if pendiente.accion == "cerrar" and posicion is not None:
                cerrar(vela.apertura, vela, i, pendiente.razon or "senal")
            elif pendiente.accion == "abrir" and posicion is None:
                abrir(pendiente, vela.apertura, vela, i)
            pendiente = None

        # --- 2. stops y objetivos contra el RANGO de esta barra
        if posicion is not None:
            p = posicion
            if p.lado == LARGO:
                toca_stop = p.stop is not None and vela.minimo <= p.stop
                toca_obj = p.objetivo is not None and vela.maximo >= p.objetivo
            else:
                toca_stop = p.stop is not None and vela.maximo >= p.stop
                toca_obj = p.objetivo is not None and vela.minimo <= p.objetivo

            if toca_stop:
                # Regla 3: si la barra ABRIO ya pasada del stop, se sale a la
                # apertura, que es peor. El stop no garantiza precio.
                if p.lado == LARGO:
                    ejecucion = min(p.stop, vela.apertura)
                else:
                    ejecucion = max(p.stop, vela.apertura)
                cerrar(ejecucion, vela, i, "stop")
            elif toca_obj:
                # Regla 2: solo llega aqui si NO toco el stop en la misma barra.
                cerrar(p.objetivo, vela, i, "objetivo")

        # --- 3. marca a mercado al cierre
        valor = efectivo + (posicion.valor_no_realizado(vela.cierre) if posicion else 0.0)
        res.equity.append(valor)
        res.marcas.append(vela.apertura_ms)

        # --- 4. la estrategia decide para la barra SIGUIENTE
        if i < len(serie) - 1:
            ctx = Contexto(serie, i, posicion, valor, indicadores)
            pendiente = estrategia.evaluar(ctx)
        res.barras_evaluadas += 1

    # Posicion viva al acabar los datos: se cierra al ultimo cierre y se avisa.
    if posicion is not None:
        ultima = serie[-1]
        cerrar(ultima.cierre, ultima, len(serie) - 1, "fin_de_datos")
        res.equity[-1] = efectivo
        res.advertencias.append(
            "habia una posicion abierta al acabar los datos: se cerro a mercado; "
            "su resultado no es una operacion completa"
        )

    return res
