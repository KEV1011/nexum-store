"""Velas OHLCV y la serie que las contiene.

Por que hay validacion aqui y no mas arriba: una serie con huecos hace mentir
a TODO lo que venga despues. Una EMA de 20 sobre una serie a la que le faltan
30 velas no es una EMA de 20 periodos, es una EMA de un plazo que nadie sabe;
y un backtest sobre eso da un numero que parece cierto y no lo es.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from typing import Iterable, Iterator, Sequence

# Marcos temporales soportados, en milisegundos.
MARCOS_MS = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
}


@dataclass(frozen=True, slots=True)
class Vela:
    """Una vela ya CERRADA. El motor no opera nunca con velas en formacion."""

    apertura_ms: int
    apertura: float
    maximo: float
    minimo: float
    cierre: float
    volumen: float

    def rango(self) -> float:
        return self.maximo - self.minimo

    def cuerpo(self) -> float:
        return abs(self.cierre - self.apertura)

    def alcista(self) -> bool:
        return self.cierre >= self.apertura

    def valida(self) -> bool:
        """Coherencia interna: el maximo manda, el minimo obedece."""
        if not all(
            math.isfinite(v)
            for v in (self.apertura, self.maximo, self.minimo, self.cierre, self.volumen)
        ):
            return False
        if min(self.apertura, self.cierre) < self.minimo - 1e-9:
            return False
        if max(self.apertura, self.cierre) > self.maximo + 1e-9:
            return False
        if self.maximo < self.minimo:
            return False
        return self.volumen >= 0 and self.minimo > 0


@dataclass(frozen=True, slots=True)
class Problema:
    """Un defecto encontrado en la serie. indice es la vela donde se detecto."""

    clase: str
    indice: int
    detalle: str


class Serie:
    """Velas de UN simbolo y UN marco temporal, ordenadas y sin duplicados."""

    __slots__ = ("simbolo", "marco", "velas")

    def __init__(self, simbolo: str, marco: str, velas: Sequence[Vela]):
        if marco not in MARCOS_MS:
            raise ValueError(f"marco temporal desconocido: {marco!r}")
        self.simbolo = simbolo
        self.marco = marco
        self.velas: tuple[Vela, ...] = tuple(velas)

    # --- acceso -----------------------------------------------------------
    def __len__(self) -> int:
        return len(self.velas)

    def __iter__(self) -> Iterator[Vela]:
        return iter(self.velas)

    def __getitem__(self, i: int) -> Vela:
        return self.velas[i]

    @property
    def paso_ms(self) -> int:
        return MARCOS_MS[self.marco]

    def cierres(self) -> list[float]:
        return [v.cierre for v in self.velas]

    def maximos(self) -> list[float]:
        return [v.maximo for v in self.velas]

    def minimos(self) -> list[float]:
        return [v.minimo for v in self.velas]

    def volumenes(self) -> list[float]:
        return [v.volumen for v in self.velas]

    def recorte(self, desde: int, hasta: int) -> "Serie":
        return Serie(self.simbolo, self.marco, self.velas[desde:hasta])

    # --- validacion -------------------------------------------------------
    def validar(self) -> list[Problema]:
        """Devuelve TODOS los problemas, no solo el primero.

        Quien recibe la lista decide si opera con la serie o la descarta; esta
        funcion no decide por el, pero tampoco se calla nada.
        """
        problemas: list[Problema] = []
        paso = self.paso_ms
        anterior: Vela | None = None
        for i, v in enumerate(self.velas):
            if not v.valida():
                problemas.append(Problema("vela_incoherente", i, f"OHLCV imposible: {v}"))
            if anterior is not None:
                salto = v.apertura_ms - anterior.apertura_ms
                if salto == 0:
                    problemas.append(
                        Problema("duplicada", i, f"marca de tiempo repetida: {v.apertura_ms}")
                    )
                elif salto < 0:
                    problemas.append(Problema("desordenada", i, "la serie retrocede en el tiempo"))
                elif salto != paso:
                    faltan = salto // paso - 1
                    problemas.append(
                        Problema("hueco", i, f"faltan {faltan} vela(s) antes de esta")
                    )
            if v.apertura_ms % paso != 0:
                problemas.append(
                    Problema("desalineada", i, "la apertura no cae en el limite del marco")
                )
            anterior = v
        return problemas

    def sin_huecos(self) -> bool:
        return not any(p.clase in ("hueco", "duplicada", "desordenada") for p in self.validar())

    # --- persistencia -----------------------------------------------------
    def guardar_csv(self, ruta: str) -> None:
        with open(ruta, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["apertura_ms", "apertura", "maximo", "minimo", "cierre", "volumen"])
            for v in self.velas:
                w.writerow([v.apertura_ms, v.apertura, v.maximo, v.minimo, v.cierre, v.volumen])

    @staticmethod
    def cargar_csv(ruta: str, simbolo: str, marco: str) -> "Serie":
        velas: list[Vela] = []
        with open(ruta, newline="", encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                velas.append(
                    Vela(
                        apertura_ms=int(fila["apertura_ms"]),
                        apertura=float(fila["apertura"]),
                        maximo=float(fila["maximo"]),
                        minimo=float(fila["minimo"]),
                        cierre=float(fila["cierre"]),
                        volumen=float(fila["volumen"]),
                    )
                )
        return Serie(simbolo, marco, velas)


def serie_sintetica(
    simbolo: str = "TEST/USDT",
    marco: str = "1h",
    n: int = 500,
    precio_inicial: float = 100.0,
    semilla: int = 7,
    deriva: float = 0.0,
    volatilidad: float = 0.01,
) -> Serie:
    """Camino aleatorio reproducible, para pruebas y para ejercitar el motor.

    NO sirve para validar una estrategia: es ruido con una deriva puesta a
    mano. Existe para probar el codigo del motor, no las ideas de trading.
    """
    import random

    rnd = random.Random(semilla)
    velas: list[Vela] = []
    precio = precio_inicial
    paso = MARCOS_MS[marco]
    t0 = 1_600_000_000_000 - (1_600_000_000_000 % paso)
    for i in range(n):
        apertura = precio
        ret = deriva + rnd.gauss(0.0, volatilidad)
        cierre = max(0.01, apertura * (1.0 + ret))
        ruido_alto = abs(rnd.gauss(0.0, volatilidad / 2)) * apertura
        ruido_bajo = abs(rnd.gauss(0.0, volatilidad / 2)) * apertura
        maximo = max(apertura, cierre) + ruido_alto
        minimo = max(0.001, min(apertura, cierre) - ruido_bajo)
        # El volumen NO es uniforme: en cripto tiene cola pesada (picos de
        # varias veces la media) y sube con el rango de la vela, porque los
        # movimientos grandes son los que traen participantes. Con un volumen
        # uniforme, cualquier condicion del tipo "volumen > 1,5x su media" es
        # imposible de cumplir por construccion y el filtro parece roto.
        empuje = 1.0 + 3.0 * (maximo - minimo) / max(apertura, 1e-9)
        base = rnd.lognormvariate(0.0, 0.55) * empuje
        velas.append(Vela(t0 + i * paso, apertura, maximo, minimo, cierre, 1000.0 * base))
        precio = cierre
    return Serie(simbolo, marco, velas)
