"""Por que no salen senales.

Escribir cinco condiciones razonables y obtener cero operaciones es lo normal,
no la excepcion: el producto de cinco filtros del 40% deja el 1%. Sin esta
tabla, el siguiente paso es aflojar parametros al azar hasta que "salga algo",
que es como se construye una estrategia sobreajustada sin darse cuenta.

El embudo es la parte util: enseña cuanto queda vivo DESPUES de cada condicion,
en el orden en que se declararon. La que hunde el embudo es la culpable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .motor import Contexto
from .senales import Condicion, indicadores_de
from .velas import Serie


@dataclass
class FilaDiagnostico:
    nombre: str
    cumple_sola: int
    cumple_acumulado: int
    barras: int

    @property
    def pct_sola(self) -> float:
        return self.cumple_sola / self.barras * 100.0 if self.barras else 0.0

    @property
    def pct_acumulado(self) -> float:
        return self.cumple_acumulado / self.barras * 100.0 if self.barras else 0.0


@dataclass
class Diagnostico:
    simbolo: str
    marco: str
    barras: int
    filas: list[FilaDiagnostico]
    todas: int

    @property
    def culpable(self) -> FilaDiagnostico | None:
        """La condicion que mas recorta el embudo respecto al paso anterior."""
        peor, caida_peor = None, -1.0
        previo = self.barras
        for f in self.filas:
            caida = previo - f.cumple_acumulado
            if caida > caida_peor:
                peor, caida_peor = f, caida
            previo = f.cumple_acumulado
        return peor

    def resumen(self) -> str:
        lineas = [
            f"  {self.simbolo} {self.marco} — {self.barras} barras",
            f"  {'CONDICION':<40} {'SOLA':>10} {'EMBUDO':>12}",
        ]
        for f in self.filas:
            lineas.append(
                f"  {f.nombre:<40} {f.pct_sola:>9.1f}% "
                f"{f.cumple_acumulado:>6} ({f.pct_acumulado:.2f}%)"
            )
        lineas.append(f"  {'TODAS A LA VEZ':<40} {'':>10} {self.todas:>6}")
        if self.todas == 0:
            c = self.culpable
            lineas.append("")
            lineas.append("  >> CERO senales. La condicion que mas recorta es:")
            lineas.append(f"     {c.nombre} (deja el {c.pct_acumulado:.2f}% de las barras)")
            lineas.append(
                "     Antes de aflojarla: comprueba que sea alcanzable con estos datos. "
                "Un filtro imposible de cumplir no es un filtro exigente, es un error."
            )
        elif self.todas < 30:
            lineas.append("")
            lineas.append(
                f"  >> solo {self.todas} barras cumplen todo: cualquier backtest sobre esto "
                "tendra muy pocas operaciones y no sera concluyente"
            )
        return "\n".join(lineas)


def diagnosticar(serie: Serie, condiciones: Sequence[Condicion]) -> Diagnostico:
    if not condiciones:
        raise ValueError("no hay condiciones que diagnosticar")
    indicadores = indicadores_de(condiciones, serie)
    n = len(serie)

    solas = [0] * len(condiciones)
    acumulados = [0] * len(condiciones)
    todas = 0

    for i in range(n):
        ctx = Contexto(serie, i, None, 0.0, indicadores)
        vivo = True
        for j, c in enumerate(condiciones):
            ok = c.cumple(ctx)
            if ok:
                solas[j] += 1
            vivo = vivo and ok
            if vivo:
                acumulados[j] += 1
        if vivo:
            todas += 1

    filas = [
        FilaDiagnostico(c.nombre, solas[j], acumulados[j], n) for j, c in enumerate(condiciones)
    ]
    return Diagnostico(serie.simbolo, serie.marco, n, filas, todas)
