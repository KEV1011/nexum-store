"""Indicadores CAUSALES: valores[i] solo depende de datos[0..i].

Es la propiedad que sostiene todo el paquete y la que mas facil se rompe sin
darse cuenta (basta con centrar una media movil o normalizar por el maximo de
toda la serie). `tests/test_indicadores.py` la comprueba a la fuerza bruta
sobre cada indicador: calcula sobre la serie entera y sobre cada prefijo, y
exige que coincidan.

Todos devuelven una lista de la MISMA longitud que la entrada, con None en las
posiciones donde el indicador todavia no esta formado. None y no cero: un cero
es un numero con el que una estrategia puede operar por accidente.
"""

from __future__ import annotations

from typing import Sequence

Opcional = list[float | None]


def _exigir_periodo(periodo: int) -> None:
    if periodo < 1:
        raise ValueError("el periodo debe ser >= 1")


def sma(datos: Sequence[float], periodo: int) -> Opcional:
    """Media movil simple. Suma deslizante: O(n), no O(n*periodo)."""
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    suma = 0.0
    for i, x in enumerate(datos):
        suma += x
        if i >= periodo:
            suma -= datos[i - periodo]
        if i >= periodo - 1:
            salida[i] = suma / periodo
    return salida


def ema(datos: Sequence[float], periodo: int) -> Opcional:
    """Media movil exponencial, sembrada con la SMA de los primeros `periodo`.

    Sembrar con el primer dato (lo que hace mucha libreria) mete un sesgo que
    tarda cientos de barras en diluirse y cambia las senales del inicio.
    """
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    if len(datos) < periodo:
        return salida
    k = 2.0 / (periodo + 1.0)
    actual = sum(datos[:periodo]) / periodo
    salida[periodo - 1] = actual
    for i in range(periodo, len(datos)):
        actual = datos[i] * k + actual * (1.0 - k)
        salida[i] = actual
    return salida


def rma(datos: Sequence[float], periodo: int) -> Opcional:
    """Media de Wilder (la que usan RSI y ATR de verdad).

    Wilder suaviza con 1/periodo, no con 2/(periodo+1). Usar EMA en su lugar da
    un RSI parecido pero distinto, y las senales de sobrecompra no caen donde
    el grafico de TradingView dice que caen.
    """
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    if len(datos) < periodo:
        return salida
    actual = sum(datos[:periodo]) / periodo
    salida[periodo - 1] = actual
    for i in range(periodo, len(datos)):
        actual = (actual * (periodo - 1) + datos[i]) / periodo
        salida[i] = actual
    return salida


def rsi(cierres: Sequence[float], periodo: int = 14) -> Opcional:
    """RSI de Wilder. Rango [0, 100]."""
    _exigir_periodo(periodo)
    n = len(cierres)
    salida: Opcional = [None] * n
    if n < periodo + 1:
        return salida
    ganancias = [0.0] * n
    perdidas = [0.0] * n
    for i in range(1, n):
        cambio = cierres[i] - cierres[i - 1]
        ganancias[i] = max(cambio, 0.0)
        perdidas[i] = max(-cambio, 0.0)
    # El primer cambio real esta en el indice 1: se suaviza desde ahi.
    g = rma(ganancias[1:], periodo)
    p = rma(perdidas[1:], periodo)
    for i in range(len(g)):
        gi, pi = g[i], p[i]
        if gi is None or pi is None:
            continue
        if pi == 0:
            salida[i + 1] = 100.0
        else:
            rs = gi / pi
            salida[i + 1] = 100.0 - (100.0 / (1.0 + rs))
    return salida


def rango_verdadero(
    maximos: Sequence[float], minimos: Sequence[float], cierres: Sequence[float]
) -> list[float]:
    """True Range. La primera barra no tiene cierre previo: se usa su rango."""
    n = len(cierres)
    tr = [0.0] * n
    for i in range(n):
        if i == 0:
            tr[i] = maximos[i] - minimos[i]
        else:
            tr[i] = max(
                maximos[i] - minimos[i],
                abs(maximos[i] - cierres[i - 1]),
                abs(minimos[i] - cierres[i - 1]),
            )
    return tr


def atr(
    maximos: Sequence[float],
    minimos: Sequence[float],
    cierres: Sequence[float],
    periodo: int = 14,
) -> Opcional:
    """Average True Range. Es la medida de volatilidad con la que se dimensiona
    la posicion y se coloca el stop; sin el, un stop en porcentaje fijo es igual
    de ancho en un activo tranquilo que en uno que se mueve 15% al dia."""
    return rma(rango_verdadero(maximos, minimos, cierres), periodo)


def desviacion(datos: Sequence[float], periodo: int) -> Opcional:
    """Desviacion tipica poblacional en ventana deslizante."""
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    for i in range(periodo - 1, len(datos)):
        ventana = datos[i - periodo + 1 : i + 1]
        media = sum(ventana) / periodo
        var = sum((x - media) ** 2 for x in ventana) / periodo
        salida[i] = var**0.5
    return salida


def bollinger(
    cierres: Sequence[float], periodo: int = 20, desvios: float = 2.0
) -> tuple[Opcional, Opcional, Opcional]:
    """Devuelve (banda_baja, media, banda_alta)."""
    media = sma(cierres, periodo)
    sd = desviacion(cierres, periodo)
    baja: Opcional = [None] * len(cierres)
    alta: Opcional = [None] * len(cierres)
    for i in range(len(cierres)):
        if media[i] is not None and sd[i] is not None:
            baja[i] = media[i] - desvios * sd[i]
            alta[i] = media[i] + desvios * sd[i]
    return baja, media, alta


def macd(
    cierres: Sequence[float], rapida: int = 12, lenta: int = 26, senal: int = 9
) -> tuple[Opcional, Opcional, Opcional]:
    """Devuelve (linea_macd, linea_senal, histograma)."""
    er, el = ema(cierres, rapida), ema(cierres, lenta)
    linea: Opcional = [
        (er[i] - el[i]) if (er[i] is not None and el[i] is not None) else None
        for i in range(len(cierres))
    ]
    # La senal es una EMA de la linea, que empieza tarde: se suaviza solo el
    # tramo ya formado y despues se devuelve a su sitio.
    inicio = next((i for i, v in enumerate(linea) if v is not None), None)
    sen: Opcional = [None] * len(cierres)
    if inicio is not None:
        tramo = [v for v in linea[inicio:] if v is not None]
        suavizado = ema(tramo, senal)
        for j, v in enumerate(suavizado):
            sen[inicio + j] = v
    hist: Opcional = [
        (linea[i] - sen[i]) if (linea[i] is not None and sen[i] is not None) else None
        for i in range(len(cierres))
    ]
    return linea, sen, hist


def maximo_movil(datos: Sequence[float], periodo: int) -> Opcional:
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    for i in range(periodo - 1, len(datos)):
        salida[i] = max(datos[i - periodo + 1 : i + 1])
    return salida


def minimo_movil(datos: Sequence[float], periodo: int) -> Opcional:
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    for i in range(periodo - 1, len(datos)):
        salida[i] = min(datos[i - periodo + 1 : i + 1])
    return salida


def donchian(
    maximos: Sequence[float], minimos: Sequence[float], periodo: int = 20
) -> tuple[Opcional, Opcional]:
    """Canal de Donchian (techo, suelo) de las ULTIMAS `periodo` barras
    INCLUIDA la actual. Para detectar una ruptura hay que comparar contra el
    canal de la barra ANTERIOR, o el maximo de hoy siempre 'rompe' su propio
    canal: ver `senales.ruptura_donchian`."""
    return maximo_movil(maximos, periodo), minimo_movil(minimos, periodo)


def volumen_relativo(volumenes: Sequence[float], periodo: int = 20) -> Opcional:
    """Volumen de la barra dividido por su media. 2.0 = el doble de lo normal."""
    media = sma(volumenes, periodo)
    salida: Opcional = [None] * len(volumenes)
    for i in range(len(volumenes)):
        if media[i]:
            salida[i] = volumenes[i] / media[i]
    return salida


def pendiente_pct(datos: Opcional, periodo: int) -> Opcional:
    """Variacion porcentual del indicador frente a `periodo` barras atras.

    Sirve para exigir que una media este SUBIENDO, no solo que el precio este
    por encima: filtra buena parte de las rupturas laterales.
    """
    _exigir_periodo(periodo)
    salida: Opcional = [None] * len(datos)
    for i in range(periodo, len(datos)):
        actual, previo = datos[i], datos[i - periodo]
        if actual is not None and previo:
            salida[i] = (actual / previo - 1.0) * 100.0
    return salida
