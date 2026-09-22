"""Pruebas del motor. Cada escenario usa velas escritas a mano para poder
afirmar el precio EXACTO al que se lleno cada orden.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tecnico.costos import SIN_COSTOS, Costos
from tecnico.motor import CORTO, LARGO, Contexto, Estrategia, Intencion, backtest
from tecnico.velas import MARCOS_MS, Serie, Vela

PASO = MARCOS_MS["1h"]
T0 = 1_600_000_000_000 - (1_600_000_000_000 % PASO)


def velas(*ohlc: tuple[float, float, float, float]) -> Serie:
    """Construye una serie 1h a partir de tuplas (apertura, max, min, cierre)."""
    return Serie(
        "TEST/USDT",
        "1h",
        [Vela(T0 + i * PASO, a, h, l, c, 1000.0) for i, (a, h, l, c) in enumerate(ohlc)],
    )


class CompraEnLaBarra(Estrategia):
    """Abre un largo al evaluar la barra `cuando`. Stop y objetivo fijos."""

    nombre = "compra-en-barra"

    def __init__(self, cuando: int, stop: float, objetivo: float | None = None, lado=LARGO):
        self.cuando, self.stop, self.objetivo, self.lado = cuando, stop, objetivo, lado

    def evaluar(self, ctx: Contexto):
        if ctx.i == self.cuando and not ctx.hay_posicion():
            return Intencion("abrir", self.lado, 1.0, self.stop, self.objetivo, "prueba")
        return None


class EjecucionTest(unittest.TestCase):
    def test_la_orden_se_llena_en_la_apertura_de_la_barra_siguiente(self):
        s = velas((100, 101, 99, 100), (110, 111, 109, 110), (110, 111, 109, 110))
        r = backtest(s, CompraEnLaBarra(0, stop=90.0), SIN_COSTOS)
        # Decide viendo el cierre de la barra 0 (=100) y se llena en la
        # apertura de la barra 1 (=110), NO a 100.
        self.assertEqual(1, len(r.operaciones))
        self.assertAlmostEqual(110.0, r.operaciones[0].precio_entrada)
        self.assertEqual(1, r.operaciones[0].indice_entrada)

    def test_el_stop_se_ejecuta_en_el_stop_cuando_la_barra_lo_atraviesa(self):
        s = velas((100, 100, 100, 100), (100, 101, 99, 100), (100, 101, 94, 96), (96, 97, 95, 96))
        r = backtest(s, CompraEnLaBarra(0, stop=95.0), SIN_COSTOS)
        op = r.operaciones[0]
        self.assertEqual("stop", op.razon_salida)
        self.assertAlmostEqual(95.0, op.precio_salida)

    def test_un_hueco_por_debajo_del_stop_se_llena_peor_que_el_stop(self):
        """El stop NO es un precio garantizado. Esta es la regla 3."""
        s = velas((100, 100, 100, 100), (100, 101, 99, 100), (80, 82, 78, 80), (80, 81, 79, 80))
        r = backtest(s, CompraEnLaBarra(0, stop=95.0), SIN_COSTOS)
        op = r.operaciones[0]
        self.assertAlmostEqual(80.0, op.precio_salida, msg="se lleno al stop, no al hueco")
        self.assertLess(op.neto, 0.0)

    def test_stop_y_objetivo_en_la_misma_barra_gana_el_stop(self):
        """Regla 2: con datos de vela no se sabe cual toco primero."""
        s = velas((100, 100, 100, 100), (100, 101, 99, 100), (100, 120, 90, 100))
        r = backtest(s, CompraEnLaBarra(0, stop=95.0, objetivo=115.0), SIN_COSTOS)
        self.assertEqual("stop", r.operaciones[0].razon_salida)

    def test_el_objetivo_se_ejecuta_si_el_stop_no_se_toca(self):
        s = velas((100, 100, 100, 100), (100, 101, 99, 100), (100, 120, 99, 118))
        r = backtest(s, CompraEnLaBarra(0, stop=95.0, objetivo=115.0), SIN_COSTOS)
        op = r.operaciones[0]
        self.assertEqual("objetivo", op.razon_salida)
        self.assertAlmostEqual(115.0, op.precio_salida)

    def test_el_corto_gana_cuando_el_precio_baja(self):
        s = velas((100, 100, 100, 100), (100, 101, 99, 100), (90, 91, 89, 90), (90, 91, 89, 90))
        r = backtest(s, CompraEnLaBarra(0, stop=110.0, lado=CORTO), SIN_COSTOS)
        self.assertEqual(CORTO, r.operaciones[0].lado)
        self.assertGreater(r.operaciones[0].neto, 0.0)


class RiesgoTest(unittest.TestCase):
    def test_el_tamano_hace_que_el_stop_cueste_el_riesgo_declarado(self):
        """Con riesgo 1%, saltar el stop debe costar ~1% del capital.

        Es la propiedad que permite dormir: da igual donde este el stop, la
        perdida por operacion es la misma.
        """
        for stop in (95.0, 90.0, 99.0):
            s = velas(
                (100, 100, 100, 100),
                (100, 101, 99, 100),
                (100, 101, stop - 1, stop - 1),
            )
            r = backtest(s, CompraEnLaBarra(0, stop=stop), SIN_COSTOS, capital_inicial=10_000.0)
            perdida = 10_000.0 - r.capital_final
            self.assertAlmostEqual(100.0, perdida, delta=1.0, msg=f"stop={stop}")

    def test_sin_stop_no_se_abre_posicion(self):
        class SinStop(Estrategia):
            nombre = "sin-stop"

            def evaluar(self, ctx):
                if ctx.i == 0:
                    return Intencion("abrir", LARGO, 1.0, None, None, "x")
                return None

        s = velas((100, 101, 99, 100), (100, 101, 99, 100), (100, 101, 99, 100))
        r = backtest(s, SinStop(), SIN_COSTOS)
        self.assertEqual([], r.operaciones)
        self.assertTrue(any("sin stop" in a for a in r.advertencias))

    def test_un_stop_del_lado_equivocado_se_rechaza(self):
        s = velas((100, 101, 99, 100), (100, 101, 99, 100), (100, 101, 99, 100))
        r = backtest(s, CompraEnLaBarra(0, stop=105.0), SIN_COSTOS)  # largo con stop arriba
        self.assertEqual([], r.operaciones)
        self.assertTrue(any("stop de largo" in a for a in r.advertencias))


class CostosTest(unittest.TestCase):
    def test_entrar_y_salir_al_mismo_precio_pierde_plata(self):
        s = velas(
            (100, 100, 100, 100),
            (100, 100, 100, 100),
            (100, 100, 100, 100),
            (100, 100, 100, 100),
        )

        class EntraYSale(Estrategia):
            nombre = "ida-y-vuelta"

            def evaluar(self, ctx):
                if ctx.i == 0:
                    return Intencion("abrir", LARGO, 1.0, 90.0, None, "e")
                if ctx.i == 2 and ctx.hay_posicion():
                    return Intencion("cerrar", razon="s")
                return None

        r = backtest(s, EntraYSale(), Costos(), capital_inicial=10_000.0)
        self.assertEqual(1, len(r.operaciones))
        self.assertLess(r.capital_final, 10_000.0)
        self.assertGreater(r.operaciones[0].comisiones, 0.0)

    def test_la_financiacion_se_cobra_en_posiciones_largas_en_el_tiempo(self):
        # 30 velas de 1h planas: cruza al menos 3 cortes de financiacion.
        s = velas(*[(100, 100, 100, 100)] * 30)
        c = Costos(comision_taker=0.0, comision_maker=0.0, deslizamiento=0.0, financiacion_bps_8h=10.0)
        r = backtest(s, CompraEnLaBarra(0, stop=90.0), c)
        self.assertGreater(r.operaciones[0].financiacion, 0.0)


class GuardasTest(unittest.TestCase):
    def test_una_serie_con_huecos_se_rechaza(self):
        s = velas((100, 101, 99, 100), (100, 101, 99, 100))
        rota = Serie("TEST/USDT", "1h", [s[0], Vela(s[1].apertura_ms + PASO * 5, 100, 101, 99, 100, 1000.0)])
        with self.assertRaises(ValueError) as e:
            backtest(rota, CompraEnLaBarra(0, stop=90.0), SIN_COSTOS)
        self.assertIn("hueco", str(e.exception))

    def test_un_indicador_desalineado_se_rechaza(self):
        class Desalineada(Estrategia):
            nombre = "desalineada"

            def preparar(self, serie):
                return {"ema": [1.0] * (len(serie) - 3)}

            def evaluar(self, ctx):
                return None

        s = velas(*[(100, 101, 99, 100)] * 10)
        with self.assertRaises(ValueError) as e:
            backtest(s, Desalineada(), SIN_COSTOS)
        self.assertIn("desalineado", str(e.exception))

    def test_la_posicion_viva_al_final_se_cierra_y_se_avisa(self):
        s = velas(*[(100, 101, 99, 100)] * 5)
        r = backtest(s, CompraEnLaBarra(0, stop=90.0), SIN_COSTOS)
        self.assertEqual("fin_de_datos", r.operaciones[0].razon_salida)
        self.assertTrue(any("posicion abierta al acabar" in a for a in r.advertencias))

    def test_el_contexto_no_deja_mirar_al_futuro(self):
        """La defensa estructural: no es que este mal visto, es que revienta."""
        s = velas(*[(100, 101, 99, 100)] * 5)
        ctx = Contexto(s, 2, None, 10_000.0, {"ema": [1.0] * 5})
        self.assertEqual(100.0, ctx.cierre(0))
        with self.assertRaises(ValueError):
            ctx.cierre(-1)
        with self.assertRaises(ValueError):
            ctx.maximo(-1)
        with self.assertRaises(ValueError):
            ctx.ind("ema", -3)

    def test_el_contexto_no_inventa_historia_que_no_existe(self):
        s = velas(*[(100, 101, 99, 100)] * 5)
        ctx = Contexto(s, 1, None, 10_000.0, {})
        with self.assertRaises(IndexError):
            ctx.cierre(5)

    def test_un_indicador_no_preparado_revienta_en_vez_de_devolver_none(self):
        s = velas(*[(100, 101, 99, 100)] * 5)
        ctx = Contexto(s, 2, None, 10_000.0, {"ema": [None] * 5})
        self.assertIsNone(ctx.ind("ema"))
        with self.assertRaises(KeyError):
            ctx.ind("rsi")

    def test_la_curva_de_equity_tiene_un_punto_por_barra(self):
        s = velas(*[(100, 101, 99, 100)] * 7)
        r = backtest(s, CompraEnLaBarra(0, stop=90.0), SIN_COSTOS)
        self.assertEqual(7, len(r.equity))
        self.assertEqual(7, len(r.marcas))


if __name__ == "__main__":
    unittest.main(verbosity=2)
