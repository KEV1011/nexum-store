"""Descarga de velas de Binance con biblioteca estandar (sin dependencias).

DOS COSAS QUE HAY QUE SABER DE /klines Y QUE ROMPEN TODO SI SE IGNORAN:

1. EL ULTIMO ELEMENTO ES LA VELA EN FORMACION, no una vela cerrada. Sus
   maximo, minimo y cierre todavia van a cambiar. Usarla es el equivalente en
   vivo del lookahead: la senal aparece, se opera, y al cerrar la vela la senal
   ya no estaba. Aqui se descarta SIEMPRE, salvo que se pida lo contrario de
   forma explicita.

2. `limit` maximo 1000 por peticion. Para mas historia hay que paginar con
   startTime, y hay limite de peso por minuto: por eso hay una pausa entre
   peticiones. Sin ella, Binance responde 429 y despues banea la IP un rato.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Iterable

from ..velas import MARCOS_MS, Serie, Vela

SPOT = "https://api.binance.com/api/v3"
FUTUROS = "https://fapi.binance.com/fapi/v1"
MAX_POR_PETICION = 1000
PAUSA_S = 0.35  # ~170 peticiones/minuto, holgado frente al limite de peso


class ErrorDeDatos(RuntimeError):
    """La descarga fallo. Se lanza en vez de devolver una lista vacia: 'no hay
    datos' y 'no pude preguntar' son dos cosas distintas y solo una es un
    mercado sin actividad."""


def _pedir(url: str, intentos: int = 3, espera: float = 1.0) -> list | dict:
    ultimo: Exception | None = None
    for intento in range(intentos):
        try:
            peticion = urllib.request.Request(url, headers={"User-Agent": "tecnico/1.0"})
            with urllib.request.urlopen(peticion, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode("utf-8", "ignore")[:200]
            if e.code == 429 or e.code == 418:
                # Limite alcanzado: esperar de verdad, no reintentar de golpe.
                time.sleep(espera * (intento + 1) * 5)
                ultimo = ErrorDeDatos(f"Binance limito las peticiones ({e.code}): {cuerpo}")
                continue
            raise ErrorDeDatos(f"HTTP {e.code} en {url}: {cuerpo}") from e
        except Exception as e:  # red caida, DNS, timeout
            ultimo = e
            time.sleep(espera * (intento + 1))
    raise ErrorDeDatos(f"no se pudo consultar {url}: {ultimo}")


def _a_vela(k: list) -> Vela:
    return Vela(
        apertura_ms=int(k[0]),
        apertura=float(k[1]),
        maximo=float(k[2]),
        minimo=float(k[3]),
        cierre=float(k[4]),
        volumen=float(k[5]),
    )


def descargar(
    simbolo: str,
    marco: str = "1h",
    velas: int = 1000,
    futuros: bool = False,
    incluir_vela_viva: bool = False,
) -> Serie:
    """Descarga las ultimas `velas` velas CERRADAS de un simbolo.

    simbolo: formato Binance sin barra, p.ej. 'BTCUSDT'.
    futuros: True para perpetuos (donde aplica la financiacion de costos.py).
    """
    if marco not in MARCOS_MS:
        raise ValueError(f"marco no soportado: {marco!r}. Validos: {sorted(MARCOS_MS)}")
    base = FUTUROS if futuros else SPOT
    paso = MARCOS_MS[marco]

    # Se pide una de mas porque la ultima se va a descartar.
    objetivo = velas + (0 if incluir_vela_viva else 1)
    fin_ms = int(time.time() * 1000)
    acumuladas: list[Vela] = []

    while len(acumuladas) < objetivo:
        faltan = min(MAX_POR_PETICION, objetivo - len(acumuladas))
        url = f"{base}/klines?symbol={simbolo}&interval={marco}&limit={faltan}&endTime={fin_ms}"
        datos = _pedir(url)
        if not isinstance(datos, list) or not datos:
            break
        lote = [_a_vela(k) for k in datos]
        acumuladas = lote + acumuladas
        fin_ms = lote[0].apertura_ms - 1
        if len(lote) < faltan:
            break  # no hay mas historia
        time.sleep(PAUSA_S)

    # Deduplicar y ordenar por si el paginado solapa.
    por_tiempo = {v.apertura_ms: v for v in acumuladas}
    ordenadas = [por_tiempo[t] for t in sorted(por_tiempo)]

    if not incluir_vela_viva and ordenadas:
        ahora = int(time.time() * 1000)
        while ordenadas and ordenadas[-1].apertura_ms + paso > ahora:
            ordenadas.pop()

    if not ordenadas:
        raise ErrorDeDatos(f"{simbolo}: Binance no devolvio ni una vela cerrada")
    return Serie(simbolo, marco, ordenadas[-velas:])


def descargar_con_cache(
    simbolo: str,
    marco: str = "1h",
    velas: int = 1000,
    directorio: str = "datos",
    horas_validez: float = 1.0,
    futuros: bool = False,
) -> Serie:
    """Igual que `descargar` pero guarda en CSV y reutiliza si es reciente.

    Para un escaner de 200 simbolos son 200 peticiones cada vez que se prueba
    algo; con cache, la segunda pasada es instantanea y no gasta cuota.
    """
    os.makedirs(directorio, exist_ok=True)
    ruta = os.path.join(directorio, f"{simbolo}_{marco}.csv")
    if os.path.exists(ruta):
        edad_h = (time.time() - os.path.getmtime(ruta)) / 3600.0
        if edad_h < horas_validez:
            serie = Serie.cargar_csv(ruta, simbolo, marco)
            if len(serie) >= velas:
                return serie.recorte(len(serie) - velas, len(serie))
    serie = descargar(simbolo, marco, velas, futuros=futuros)
    serie.guardar_csv(ruta)
    return serie


def simbolos_usdt(minimo_nocional_24h: float = 5_000_000.0, futuros: bool = False) -> list[str]:
    """Pares contra USDT que de verdad mueven dinero.

    El filtro de liquidez no es un lujo: en Binance hay cientos de pares donde
    una orden mediana mueve el precio varios puntos. Una senal perfecta ahi no
    se puede ejecutar, y el backtest jamas lo va a notar.
    """
    base = FUTUROS if futuros else SPOT
    datos = _pedir(f"{base}/ticker/24hr")
    if not isinstance(datos, list):
        raise ErrorDeDatos("respuesta inesperada de ticker/24hr")
    salida = []
    for t in datos:
        simbolo = t.get("symbol", "")
        if not simbolo.endswith("USDT"):
            continue
        # Se excluyen apalancados: UP/DOWN/BULL/BEAR no siguen al subyacente,
        # se erosionan solos y el analisis tecnico sobre ellos no significa nada.
        if any(x in simbolo for x in ("UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT")):
            continue
        try:
            if float(t.get("quoteVolume", 0)) >= minimo_nocional_24h:
                salida.append(simbolo)
        except (TypeError, ValueError):
            continue
    return sorted(salida)


def descargar_muchos(
    simbolos: Iterable[str],
    marco: str = "1h",
    velas: int = 500,
    directorio: str = "datos",
    horas_validez: float = 1.0,
    futuros: bool = False,
    al_avanzar=None,
) -> tuple[dict[str, Serie], dict[str, str]]:
    """Descarga varios simbolos. Devuelve (series, fallos).

    Un simbolo que falla NO tumba la corrida entera ni desaparece en silencio:
    queda en `fallos` con su motivo, para que quien mira el escaner sepa que
    estaba mirando 180 pares y no 200.
    """
    series: dict[str, Serie] = {}
    fallos: dict[str, str] = {}
    lista = list(simbolos)
    for n, simbolo in enumerate(lista, 1):
        try:
            series[simbolo] = descargar_con_cache(
                simbolo, marco, velas, directorio, horas_validez, futuros
            )
        except Exception as e:
            fallos[simbolo] = str(e)
        if al_avanzar:
            al_avanzar(n, len(lista), simbolo)
    return series, fallos
