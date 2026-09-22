"""Lo que cuesta operar de verdad.

Es la diferencia mas comun entre un backtest brillante y una cuenta en rojo.
Una estrategia de 40 operaciones diarias con 0,04% por lado necesita ganar
~3,2% cada dia solo para EMPATAR. Por eso los costos no son un parametro
opcional del motor: son obligatorios y su valor por defecto es el real de
Binance, no cero.
"""

from __future__ import annotations

from dataclasses import dataclass

# Una hora en ms y el periodo de financiacion estandar de los perpetuos (8 h).
HORA_MS = 3_600_000
FUNDING_CADA_MS = 8 * HORA_MS


@dataclass(frozen=True, slots=True)
class Costos:
    """Todo en puntos basicos (bps): 1 bps = 0,01%.

    comision_taker: orden a mercado que cruza el libro. Es la que paga una
        estrategia que entra por senal, asi que es la que se usa por defecto.
    comision_maker: orden limite que espera en el libro. Solo se aplica si la
        estrategia declara explicitamente que entra en pasivo Y acepta no ser
        ejecutada; el motor no la regala.
    deslizamiento: cuanto peor que el precio de referencia se llena la orden.
        En BTC/ETH con tamano pequeno es ~1-2 bps; en una moneda ilicuida con
        tamano serio puede ser 50+. Ponerlo en cero es la segunda mentira mas
        cara de un backtest.
    financiacion_bps_8h: perpetuos. Positiva = los largos pagan a los cortos,
        que es lo normal en mercado alcista. Una posicion larga abierta un mes
        paga ~90 cobros; ignorarlo regala varios puntos de rentabilidad.
    """

    comision_taker: float = 4.5  # 0,045% spot Binance sin descuentos
    comision_maker: float = 2.0  # 0,020%
    deslizamiento: float = 2.0  # 0,020%
    financiacion_bps_8h: float = 1.0  # 0,010%, media historica aproximada

    def __post_init__(self) -> None:
        for campo in ("comision_taker", "comision_maker", "deslizamiento"):
            if getattr(self, campo) < 0:
                raise ValueError(f"{campo} no puede ser negativo")

    # --- precios ----------------------------------------------------------
    def precio_de_compra(self, referencia: float) -> float:
        """Se compra SIEMPRE peor que la referencia."""
        return referencia * (1.0 + self.deslizamiento / 10_000.0)

    def precio_de_venta(self, referencia: float) -> float:
        """Se vende SIEMPRE peor que la referencia."""
        return referencia * (1.0 - self.deslizamiento / 10_000.0)

    # --- cargos -----------------------------------------------------------
    def comision(self, nocional: float, maker: bool = False) -> float:
        bps = self.comision_maker if maker else self.comision_taker
        return abs(nocional) * bps / 10_000.0

    def financiacion(self, nocional: float, periodos: int, lado: int) -> float:
        """Coste de financiacion de `periodos` cobros de 8 h.

        lado: +1 largo, -1 corto. Con tasa positiva el largo paga y el corto
        cobra; se devuelve un COSTE, asi que el corto obtiene negativo.
        """
        if periodos <= 0:
            return 0.0
        return abs(nocional) * (self.financiacion_bps_8h / 10_000.0) * periodos * lado


SIN_COSTOS = Costos(0.0, 0.0, 0.0, 0.0)
"""Solo para pruebas del motor. Usarlo para evaluar una estrategia es
enganarse a uno mismo con numeros que nunca van a ocurrir."""


def periodos_de_financiacion(entrada_ms: int, salida_ms: int) -> int:
    """Cuantos cobros de financiacion cruza una posicion.

    Los cobros caen en 00:00, 08:00 y 16:00 UTC. Se cuentan los limites
    ESTRICTAMENTE dentro del intervalo (entrada, salida]: quien abre y cierra
    antes del siguiente corte no paga nada.
    """
    if salida_ms <= entrada_ms:
        return 0
    primero = (entrada_ms // FUNDING_CADA_MS + 1) * FUNDING_CADA_MS
    if primero > salida_ms:
        return 0
    return int((salida_ms - primero) // FUNDING_CADA_MS) + 1
