"""Escaner: las MISMAS condiciones del backtest, sobre la ultima vela cerrada.

No hay una sola condicion escrita aqui: el escaner recibe los objetos
`Condicion` que ya se validaron en el backtest. Por eso lo que aparece en el
listado es exactamente lo que se midio, no una reimplementacion parecida.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Mapping, Sequence

from . import indicadores as ind
from .motor import Contexto
from .senales import Condicion, indicadores_de
from .velas import MARCOS_MS, Serie


@dataclass
class Hallazgo:
    simbolo: str
    marco: str
    precio: float
    cierre_ms: int
    cumplidas: list[str] = field(default_factory=list)
    faltantes: list[str] = field(default_factory=list)
    atr_pct: float | None = None
    volumen_relativo: float | None = None
    nocional_medio: float | None = None
    problemas: list[str] = field(default_factory=list)

    @property
    def completo(self) -> bool:
        return not self.faltantes

    @property
    def puntuacion(self) -> float:
        total = len(self.cumplidas) + len(self.faltantes)
        return len(self.cumplidas) / total if total else 0.0


def _vela_en_formacion(serie: Serie, ahora_ms: int | None = None) -> bool:
    """La ultima vela, ¿ya cerro?

    Binance devuelve la vela VIVA como ultimo elemento de /klines. Escanear con
    ella es mirar un dato que todavia va a cambiar: la senal aparece, se opera,
    y cinco minutos despues la vela cierra en otro sitio y la senal ya no
    estaba. Este es el equivalente en vivo del lookahead del backtest.
    """
    if not len(serie):
        return False
    ahora = ahora_ms if ahora_ms is not None else int(time.time() * 1000)
    return serie[-1].apertura_ms + MARCOS_MS[serie.marco] > ahora


def escanear(
    series: Mapping[str, Serie],
    condiciones: Sequence[Condicion],
    solo_completos: bool = True,
    minimo_historia: int = 210,
    ahora_ms: int | None = None,
) -> list[Hallazgo]:
    """Evalua las condiciones sobre la ultima vela cerrada de cada simbolo.

    Devuelve la lista ordenada: primero los que cumplen todo, despues por
    proporcion de condiciones cumplidas y liquidez.
    """
    if not condiciones:
        raise ValueError("un escaner sin condiciones devolveria el mercado entero")

    hallazgos: list[Hallazgo] = []
    for simbolo, serie in series.items():
        problemas: list[str] = []
        if _vela_en_formacion(serie, ahora_ms):
            # Se descarta la vela viva en vez de avisar y usarla igualmente.
            serie = serie.recorte(0, len(serie) - 1)
            problemas.append("se descarto la vela en formacion")
        if len(serie) < minimo_historia:
            hallazgos.append(
                Hallazgo(
                    simbolo=simbolo,
                    marco=serie.marco,
                    precio=serie[-1].cierre if len(serie) else 0.0,
                    cierre_ms=serie[-1].apertura_ms if len(serie) else 0,
                    faltantes=[c.nombre for c in condiciones],
                    problemas=problemas
                    + [f"historia insuficiente: {len(serie)} de {minimo_historia} velas"],
                )
            )
            continue
        defectos = serie.validar()
        if defectos:
            clases = sorted({d.clase for d in defectos})
            problemas.append(f"datos con {len(defectos)} defecto(s): {', '.join(clases)}")

        indicadores = indicadores_de(condiciones, serie)
        i = len(serie) - 1
        ctx = Contexto(serie, i, None, 0.0, indicadores)

        cumplidas, faltantes = [], []
        for c in condiciones:
            (cumplidas if c.cumple(ctx) else faltantes).append(c.nombre)

        atr = ind.atr(serie.maximos(), serie.minimos(), serie.cierres(), 14)[i]
        volrel = ind.volumen_relativo(serie.volumenes(), 20)[i]
        nocional = ind.sma([v.volumen * v.cierre for v in serie], 20)[i]

        hallazgos.append(
            Hallazgo(
                simbolo=simbolo,
                marco=serie.marco,
                precio=serie[i].cierre,
                cierre_ms=serie[i].apertura_ms,
                cumplidas=cumplidas,
                faltantes=faltantes,
                atr_pct=(atr / serie[i].cierre * 100.0) if atr and serie[i].cierre else None,
                volumen_relativo=volrel,
                nocional_medio=nocional,
                problemas=problemas,
            )
        )

    if solo_completos:
        hallazgos = [h for h in hallazgos if h.completo]
    hallazgos.sort(key=lambda h: (h.puntuacion, h.nocional_medio or 0.0), reverse=True)
    return hallazgos


def tabla(hallazgos: Sequence[Hallazgo], ancho_simbolo: int = 14) -> str:
    """Listado para consola. Sin hallazgos dice que no hay, no devuelve vacio."""
    if not hallazgos:
        return "  (ningun simbolo cumple las condiciones ahora mismo)"
    lineas = [
        f"  {'SIMBOLO'.ljust(ancho_simbolo)} {'PRECIO':>12} {'ATR%':>7} {'VOL x':>6} "
        f"{'LIQUIDEZ':>14}  SENALES"
    ]
    for h in hallazgos:
        atr = f"{h.atr_pct:.2f}" if h.atr_pct is not None else "-"
        vol = f"{h.volumen_relativo:.2f}" if h.volumen_relativo is not None else "-"
        liq = f"{h.nocional_medio:,.0f}" if h.nocional_medio is not None else "-"
        detalle = ", ".join(h.cumplidas) if h.completo else (
            f"{len(h.cumplidas)}/{len(h.cumplidas) + len(h.faltantes)} — falta: "
            + ", ".join(h.faltantes)
        )
        lineas.append(
            f"  {h.simbolo.ljust(ancho_simbolo)} {h.precio:>12,.6g} {atr:>7} {vol:>6} "
            f"{liq:>14}  {detalle}"
        )
        for p in h.problemas:
            lineas.append(f"  {' ' * ancho_simbolo} >> {p}")
    return "\n".join(lineas)
