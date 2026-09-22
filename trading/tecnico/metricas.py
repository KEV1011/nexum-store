"""Metricas de un backtest, con las advertencias que impiden creerselas.

Un informe que dice "82% de aciertos, +340%" sin decir que fueron 11
operaciones y que una sola aporto el 60% del beneficio no esta informando,
esta vendiendo. Aqui las metricas vienen SIEMPRE con su letra pequena:

- Menos de MUESTRA_MINIMA operaciones: los ratios se calculan pero se marcan
  como no concluyentes. Igual que no se publica un porcentaje de retencion
  sobre dos personas.
- Una sola operacion que aporta mas de la mitad del beneficio: no hay
  estrategia, hubo suerte.
- Sin operaciones perdedoras no existe el profit factor: es infinito, y un
  infinito en un informe es una muestra demasiado corta, no un hallazgo.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

from .motor import Operacion, Resultado
from .velas import MARCOS_MS

MS_ANIO = 365.25 * 24 * 3_600_000
MUESTRA_MINIMA = 30
"""Por debajo de esto, ningun ratio de este modulo es concluyente."""


@dataclass
class Metricas:
    operaciones: int = 0
    ganadoras: int = 0
    perdedoras: int = 0
    acierto_pct: float | None = None
    beneficio_neto: float = 0.0
    rentabilidad_pct: float = 0.0
    cagr_pct: float | None = None
    max_drawdown_pct: float = 0.0
    duracion_max_drawdown_barras: int = 0
    sharpe: float | None = None
    sortino: float | None = None
    profit_factor: float | None = None
    expectativa: float | None = None
    media_ganadora: float | None = None
    media_perdedora: float | None = None
    mayor_perdida: float = 0.0
    racha_perdedora: int = 0
    costos_totales: float = 0.0
    costos_sobre_beneficio_bruto_pct: float | None = None
    barras_en_mercado_pct: float = 0.0
    concluyente: bool = False
    advertencias: list[str] = field(default_factory=list)

    def resumen(self) -> str:
        """Texto para consola. Los valores que no se pueden calcular se
        imprimen como '-', nunca como cero."""

        def n(v, suf="", dec=2):
            return "-" if v is None else f"{v:,.{dec}f}{suf}"

        lineas = [
            f"  operaciones          {self.operaciones}  "
            f"({self.ganadoras} ganadoras / {self.perdedoras} perdedoras)",
            f"  acierto              {n(self.acierto_pct, '%')}",
            f"  beneficio neto       {n(self.beneficio_neto)}  ({n(self.rentabilidad_pct, '%')})",
            f"  CAGR                 {n(self.cagr_pct, '%')}",
            f"  max drawdown         {n(self.max_drawdown_pct, '%')}  "
            f"({self.duracion_max_drawdown_barras} barras para recuperarse)",
            f"  Sharpe / Sortino     {n(self.sharpe)} / {n(self.sortino)}",
            f"  profit factor        {n(self.profit_factor)}",
            f"  expectativa/op       {n(self.expectativa)}",
            f"  mayor perdida        {n(self.mayor_perdida)}",
            f"  racha perdedora      {self.racha_perdedora}",
            f"  costos totales       {n(self.costos_totales)}  "
            f"({n(self.costos_sobre_beneficio_bruto_pct, '%')} del bruto)",
            f"  tiempo en mercado    {n(self.barras_en_mercado_pct, '%')}",
        ]
        if not self.concluyente:
            lineas.append(
                f"  >> NO CONCLUYENTE: {self.operaciones} operaciones, "
                f"hacen falta al menos {MUESTRA_MINIMA}"
            )
        for a in self.advertencias:
            lineas.append(f"  >> {a}")
        return "\n".join(lineas)


def _drawdown(equity: Sequence[float]) -> tuple[float, int]:
    """Caida maxima desde un pico, en %, y cuantas barras tardo en recuperarse."""
    if not equity:
        return 0.0, 0
    pico = equity[0]
    indice_pico = 0
    peor = 0.0
    duracion = 0
    for i, v in enumerate(equity):
        if v > pico:
            pico = v
            indice_pico = i
        elif pico > 0:
            caida = (pico - v) / pico * 100.0
            if caida > peor:
                peor = caida
                duracion = i - indice_pico
    return peor, duracion


def _sharpe(retornos: Sequence[float], barras_por_anio: float) -> float | None:
    """Sharpe anualizado con tasa libre de riesgo cero.

    Cero y no la tasa real a proposito: en cripto no hay un "libre de riesgo"
    comparable, y meter uno inventado hace el numero menos legible, no mas.
    """
    if len(retornos) < 2:
        return None
    media = sum(retornos) / len(retornos)
    var = sum((r - media) ** 2 for r in retornos) / (len(retornos) - 1)
    sd = var**0.5
    if sd == 0:
        return None
    return (media / sd) * math.sqrt(barras_por_anio)


def _sortino(retornos: Sequence[float], barras_por_anio: float) -> float | None:
    """Como el Sharpe pero castigando solo la volatilidad a la BAJA.

    Es la mas justa de las dos: al que opera no le molesta que su curva suba
    de golpe, y el Sharpe penaliza eso igual que una caida.
    """
    if len(retornos) < 2:
        return None
    media = sum(retornos) / len(retornos)
    malos = [r for r in retornos if r < 0]
    if not malos:
        return None
    dd = (sum(r * r for r in malos) / len(retornos)) ** 0.5
    if dd == 0:
        return None
    return (media / dd) * math.sqrt(barras_por_anio)


def _racha_perdedora(ops: Sequence[Operacion]) -> int:
    peor = actual = 0
    for op in ops:
        if op.neto <= 0:
            actual += 1
            peor = max(peor, actual)
        else:
            actual = 0
    return peor


def calcular(res: Resultado) -> Metricas:
    m = Metricas(advertencias=list(res.advertencias))
    ops = res.operaciones
    m.operaciones = len(ops)
    m.beneficio_neto = res.capital_final - res.capital_inicial
    if res.capital_inicial > 0:
        m.rentabilidad_pct = m.beneficio_neto / res.capital_inicial * 100.0

    m.max_drawdown_pct, m.duracion_max_drawdown_barras = _drawdown(res.equity)

    if not ops:
        m.advertencias.append("la estrategia no abrio ni una operacion; no hay nada que evaluar")
        return m

    ganadoras = [o for o in ops if o.ganadora]
    perdedoras = [o for o in ops if not o.ganadora]
    m.ganadoras, m.perdedoras = len(ganadoras), len(perdedoras)
    m.acierto_pct = len(ganadoras) / len(ops) * 100.0
    m.expectativa = sum(o.neto for o in ops) / len(ops)
    m.media_ganadora = (sum(o.neto for o in ganadoras) / len(ganadoras)) if ganadoras else None
    m.media_perdedora = (sum(o.neto for o in perdedoras) / len(perdedoras)) if perdedoras else None
    m.mayor_perdida = min((o.neto for o in ops), default=0.0)
    m.racha_perdedora = _racha_perdedora(ops)

    bruto_ganado = sum(o.neto for o in ganadoras)
    bruto_perdido = -sum(o.neto for o in perdedoras)
    if bruto_perdido > 0:
        m.profit_factor = bruto_ganado / bruto_perdido
    else:
        m.advertencias.append(
            "ninguna operacion perdio: el profit factor seria infinito, "
            "lo que significa muestra insuficiente y no una estrategia perfecta"
        )

    m.costos_totales = sum(o.comisiones + o.financiacion for o in ops)
    bruto_total = sum(o.bruto for o in ops)
    if bruto_total > 0:
        m.costos_sobre_beneficio_bruto_pct = m.costos_totales / bruto_total * 100.0

    barras_dentro = sum(o.barras for o in ops)
    if res.barras_evaluadas:
        m.barras_en_mercado_pct = barras_dentro / res.barras_evaluadas * 100.0

    # Rendimientos barra a barra sobre la curva de equity.
    retornos = []
    for i in range(1, len(res.equity)):
        previo = res.equity[i - 1]
        if previo > 0:
            retornos.append(res.equity[i] / previo - 1.0)
    barras_por_anio = MS_ANIO / MARCOS_MS[res.marco]
    m.sharpe = _sharpe(retornos, barras_por_anio)
    m.sortino = _sortino(retornos, barras_por_anio)

    # CAGR: solo si el periodo y el capital lo permiten.
    if len(res.marcas) >= 2 and res.capital_inicial > 0 and res.capital_final > 0:
        anios = (res.marcas[-1] - res.marcas[0]) / MS_ANIO
        if anios > 0:
            m.cagr_pct = ((res.capital_final / res.capital_inicial) ** (1 / anios) - 1) * 100.0
            if anios < 0.5:
                m.advertencias.append(
                    f"el CAGR extrapola solo {anios * 12:.1f} meses de datos a un ano entero"
                )

    # --- la letra pequena --------------------------------------------------
    m.concluyente = len(ops) >= MUESTRA_MINIMA
    if ganadoras and bruto_ganado > 0:
        mejor = max(o.neto for o in ganadoras)
        if mejor / bruto_ganado > 0.5:
            m.advertencias.append(
                f"una sola operacion aporta el {mejor / bruto_ganado * 100:.0f}% de lo ganado: "
                "es suerte, no una estrategia"
            )
    if m.max_drawdown_pct > 50:
        m.advertencias.append(
            f"caida maxima del {m.max_drawdown_pct:.0f}%: casi nadie aguanta eso sin apagar el bot"
        )
    if m.barras_en_mercado_pct < 1 and len(ops) < MUESTRA_MINIMA:
        m.advertencias.append("la estrategia casi no esta en mercado; revisa que las senales entren")
    return m
