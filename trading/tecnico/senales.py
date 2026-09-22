"""Condiciones tecnicas reutilizables.

LA IDEA CENTRAL DEL PAQUETE: una condicion es un objeto, no codigo suelto
dentro de una estrategia. El mismo objeto lo evalua el backtest sobre toda la
historia y el escaner sobre la ultima vela cerrada.

Eso significa que lo que el escaner te muestra hoy es EXACTAMENTE lo que
validaste ayer. Un escaner escrito aparte del backtest acaba siempre con
condiciones que divergen -- un `>` contra un `>=`, un periodo distinto -- y
entonces enseña oportunidades que nadie ha medido nunca.
"""

from __future__ import annotations

from typing import Sequence

from . import indicadores as ind
from .motor import Contexto
from .velas import Serie


class Condicion:
    """Contrato: declara que indicadores necesita y si se cumple en la barra i.

    `indicadores` se llama una vez por serie; las claves se comparten entre
    condiciones, asi que dos que pidan `ema_20` lo calculan una sola vez.
    """

    nombre = "condicion"

    def indicadores(self, serie: Serie) -> dict[str, list]:
        return {}

    def cumple(self, ctx: Contexto) -> bool:
        raise NotImplementedError

    def __str__(self) -> str:
        return self.nombre


def indicadores_de(condiciones: Sequence[Condicion], serie: Serie) -> dict[str, list]:
    """Union de los indicadores que piden todas las condiciones, sin repetir."""
    todos: dict[str, list] = {}
    for c in condiciones:
        for clave, valores in c.indicadores(serie).items():
            if clave not in todos:
                todos[clave] = valores
    return todos


def todas_se_cumplen(condiciones: Sequence[Condicion], ctx: Contexto) -> bool:
    return all(c.cumple(ctx) for c in condiciones)


def cuales_se_cumplen(condiciones: Sequence[Condicion], ctx: Contexto) -> list[str]:
    return [c.nombre for c in condiciones if c.cumple(ctx)]


# --------------------------------------------------------------------------
# Tendencia
# --------------------------------------------------------------------------
class CruceAlcista(Condicion):
    """La EMA rapida cruza POR ENCIMA de la lenta en ESTA barra.

    Exige que en la barra anterior estuviera por debajo: sin eso no es un
    cruce, es "esta por encima", y eso se cumple durante cientos de barras
    seguidas -- la diferencia entre una senal y un estado.
    """

    def __init__(self, rapida: int = 20, lenta: int = 50):
        if rapida >= lenta:
            raise ValueError("la media rapida debe tener periodo menor que la lenta")
        self.rapida, self.lenta = rapida, lenta
        self.nombre = f"cruce alcista EMA{rapida}/{lenta}"

    def indicadores(self, serie):
        c = serie.cierres()
        return {f"ema_{self.rapida}": ind.ema(c, self.rapida), f"ema_{self.lenta}": ind.ema(c, self.lenta)}

    def cumple(self, ctx):
        if ctx.i < 1:
            return False
        r0, l0 = ctx.ind(f"ema_{self.rapida}"), ctx.ind(f"ema_{self.lenta}")
        r1, l1 = ctx.ind(f"ema_{self.rapida}", 1), ctx.ind(f"ema_{self.lenta}", 1)
        if None in (r0, l0, r1, l1):
            return False
        return r1 <= l1 and r0 > l0


class TendenciaAlcista(Condicion):
    """El precio esta por encima de la EMA y la EMA SUBE.

    Exigir las dos cosas filtra los laterales, donde el precio cruza su media
    constantemente sin que haya tendencia ninguna.
    """

    def __init__(self, periodo: int = 200, pendiente_minima_pct: float = 0.0, barras: int = 10):
        self.periodo, self.pendiente, self.barras = periodo, pendiente_minima_pct, barras
        self.nombre = f"tendencia alcista EMA{periodo}"

    def indicadores(self, serie):
        e = ind.ema(serie.cierres(), self.periodo)
        return {f"ema_{self.periodo}": e, f"pend_{self.periodo}_{self.barras}": ind.pendiente_pct(e, self.barras)}

    def cumple(self, ctx):
        e = ctx.ind(f"ema_{self.periodo}")
        p = ctx.ind(f"pend_{self.periodo}_{self.barras}")
        if e is None or p is None:
            return False
        return ctx.cierre() > e and p >= self.pendiente


class RupturaDonchian(Condicion):
    """El maximo de hoy supera el techo de las N barras ANTERIORES.

    El `atras=1` no es un detalle: comparar contra el canal que YA INCLUYE la
    barra actual hace que el maximo de hoy rompa siempre su propio canal, y la
    condicion se cumple en cada nuevo maximo trivialmente.
    """

    def __init__(self, periodo: int = 20):
        self.periodo = periodo
        self.nombre = f"ruptura Donchian {periodo}"

    def indicadores(self, serie):
        techo, suelo = ind.donchian(serie.maximos(), serie.minimos(), self.periodo)
        return {f"donchian_alto_{self.periodo}": techo, f"donchian_bajo_{self.periodo}": suelo}

    def cumple(self, ctx):
        if ctx.i < 1:
            return False
        techo_previo = ctx.ind(f"donchian_alto_{self.periodo}", 1)
        if techo_previo is None:
            return False
        return ctx.cierre() > techo_previo


# --------------------------------------------------------------------------
# Momento
# --------------------------------------------------------------------------
class RsiEntre(Condicion):
    """RSI dentro de una banda. Usar (55, 75) para momento sano: por encima de
    75 se compra un extendido y por debajo de 55 no hay impulso."""

    def __init__(self, minimo: float = 55.0, maximo: float = 75.0, periodo: int = 14):
        if minimo >= maximo:
            raise ValueError("el minimo del RSI debe ser menor que el maximo")
        self.minimo, self.maximo, self.periodo = minimo, maximo, periodo
        self.nombre = f"RSI{periodo} entre {minimo:g} y {maximo:g}"

    def indicadores(self, serie):
        return {f"rsi_{self.periodo}": ind.rsi(serie.cierres(), self.periodo)}

    def cumple(self, ctx):
        v = ctx.ind(f"rsi_{self.periodo}")
        return v is not None and self.minimo <= v <= self.maximo


class MacdPorEncimaDeSenal(Condicion):
    def __init__(self, rapida: int = 12, lenta: int = 26, senal: int = 9):
        self.p = (rapida, lenta, senal)
        self.nombre = f"MACD {rapida}/{lenta}/{senal} sobre su senal"

    def indicadores(self, serie):
        linea, sen, hist = ind.macd(serie.cierres(), *self.p)
        return {f"macd_{self.p}": linea, f"macd_senal_{self.p}": sen}

    def cumple(self, ctx):
        m, s = ctx.ind(f"macd_{self.p}"), ctx.ind(f"macd_senal_{self.p}")
        return m is not None and s is not None and m > s


# --------------------------------------------------------------------------
# Participacion y volatilidad
# --------------------------------------------------------------------------
class VolumenSuperiorA(Condicion):
    """Volumen de la barra por encima de `factor` veces su media.

    Una ruptura sin volumen es la forma mas comun de trampa: el precio sale del
    rango, no entra nadie detras, y vuelve.
    """

    def __init__(self, factor: float = 1.5, periodo: int = 20):
        self.factor, self.periodo = factor, periodo
        self.nombre = f"volumen > {factor:g}x media{periodo}"

    def indicadores(self, serie):
        return {f"volrel_{self.periodo}": ind.volumen_relativo(serie.volumenes(), self.periodo)}

    def cumple(self, ctx):
        v = ctx.ind(f"volrel_{self.periodo}")
        return v is not None and v >= self.factor


class VolatilidadSuficiente(Condicion):
    """El ATR es al menos X% del precio.

    Sin un minimo de movimiento, los costos se comen cualquier ganancia: en un
    activo que se mueve 0,1% al dia, pagar 0,09% de ida y vuelta lo es todo.
    """

    def __init__(self, atr_minimo_pct: float = 0.5, periodo: int = 14):
        self.minimo, self.periodo = atr_minimo_pct, periodo
        self.nombre = f"ATR{periodo} >= {atr_minimo_pct:g}% del precio"

    def indicadores(self, serie):
        return {
            f"atr_{self.periodo}": ind.atr(
                serie.maximos(), serie.minimos(), serie.cierres(), self.periodo
            )
        }

    def cumple(self, ctx):
        a = ctx.ind(f"atr_{self.periodo}")
        precio = ctx.cierre()
        return a is not None and precio > 0 and (a / precio * 100.0) >= self.minimo


class LiquidezMinima(Condicion):
    """Volumen en moneda de cotizacion por encima de un umbral.

    Filtro anti-ruina: una senal perfecta en un par que mueve 20.000 USDT al dia
    no se puede ejecutar. El backtest la llena al precio de pantalla; el mercado
    real, no.
    """

    def __init__(self, nocional_minimo: float = 500_000.0, periodo: int = 20):
        self.minimo, self.periodo = nocional_minimo, periodo
        self.nombre = f"liquidez >= {nocional_minimo:,.0f} por barra"

    def indicadores(self, serie):
        nocional = [v.volumen * v.cierre for v in serie]
        return {f"nocional_{self.periodo}": ind.sma(nocional, self.periodo)}

    def cumple(self, ctx):
        v = ctx.ind(f"nocional_{self.periodo}")
        return v is not None and v >= self.minimo
