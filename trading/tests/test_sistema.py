"""Senales, escaner, metricas, diagnostico y la prueba de sistema:
sobre ruido puro, el motor NO puede dar ganancias.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tecnico import senales as sg
from tecnico.costos import SIN_COSTOS, Costos
from tecnico.diagnostico import diagnosticar
from tecnico.escaner import escanear
from tecnico.estrategia import ComprarYMantener, EstrategiaDeCondiciones
from tecnico.metricas import MUESTRA_MINIMA, calcular
from tecnico.motor import LARGO, Contexto, Operacion, Resultado, backtest
from tecnico.senales import indicadores_de
from tecnico.velas import MARCOS_MS, Serie, Vela, serie_sintetica

PASO = MARCOS_MS["1h"]
T0 = 1_600_000_000_000 - (1_600_000_000_000 % PASO)


def velas(*ohlcv):
    return Serie(
        "T/USDT",
        "1h",
        [
            Vela(T0 + i * PASO, a, h, l, c, v)
            for i, (a, h, l, c, v) in enumerate(ohlcv)
        ],
    )


def ctx_en(serie, i, condiciones):
    return Contexto(serie, i, None, 0.0, indicadores_de(condiciones, serie))


class SenalesTest(unittest.TestCase):
    def test_la_ruptura_no_se_cumple_contra_su_propio_canal(self):
        """Si el canal incluyera la barra actual, cada nuevo maximo 'rompe'
        su propio techo y la condicion se cumple trivialmente."""
        c = sg.RupturaDonchian(3)
        # Precio plano en 100 y luego un maximo nuevo en la ultima barra.
        s = velas(*[(100, 100, 100, 100, 10)] * 5, (100, 106, 100, 105, 10))
        ctx = ctx_en(s, 5, [c])
        self.assertTrue(c.cumple(ctx))
        # En la barra 4 (plana) NO puede haber ruptura.
        self.assertFalse(c.cumple(ctx_en(s, 4, [c])))

    def test_un_maximo_plano_no_es_ruptura(self):
        c = sg.RupturaDonchian(3)
        s = velas(*[(100, 100, 100, 100, 10)] * 6)
        self.assertFalse(c.cumple(ctx_en(s, 5, [c])))

    def test_el_cruce_es_un_evento_no_un_estado(self):
        """Un cruce ocurre en UNA barra. 'Estar por encima' dura cientos."""
        c = sg.CruceAlcista(2, 4)
        # Serie que baja y luego sube con fuerza: la rapida cruza a la lenta
        # en una barra concreta y despues sigue arriba sin volver a cruzar.
        precios = [100, 99, 98, 97, 96, 97, 100, 104, 109, 115, 122, 130]
        s = velas(*[(p, p + 0.5, p - 0.5, p, 10) for p in precios])
        cruces = [i for i in range(len(s)) if c.cumple(ctx_en(s, i, [c]))]
        self.assertEqual(1, len(cruces), f"se detectaron {len(cruces)} cruces: {cruces}")

    def test_la_rapida_no_puede_ser_mas_lenta_que_la_lenta(self):
        with self.assertRaises(ValueError):
            sg.CruceAlcista(50, 20)

    def test_rsi_con_banda_invertida_se_rechaza(self):
        with self.assertRaises(ValueError):
            sg.RsiEntre(80, 40)

    def test_los_indicadores_compartidos_se_calculan_una_sola_vez(self):
        s = serie_sintetica(n=300)
        condiciones = [sg.TendenciaAlcista(50), sg.TendenciaAlcista(50), sg.RupturaDonchian(20)]
        todos = indicadores_de(condiciones, s)
        self.assertIn("ema_50", todos)
        self.assertEqual(len(s), len(todos["ema_50"]))


class EscanerTest(unittest.TestCase):
    def test_descarta_la_vela_en_formacion(self):
        """La ultima vela de /klines todavia esta viva: usarla es el lookahead
        del mundo real."""
        s = serie_sintetica(n=300, marco="1h")
        ultima = s[-1]
        # "Ahora" cae DENTRO del periodo de la ultima vela: aun no cerro.
        ahora = ultima.apertura_ms + PASO // 2
        r = escanear({"T": s}, [sg.VolatilidadSuficiente(0.0)], solo_completos=False, ahora_ms=ahora)
        self.assertEqual(1, len(r))
        self.assertTrue(any("formacion" in p for p in r[0].problemas))
        self.assertEqual(s[-2].apertura_ms, r[0].cierre_ms)

    def test_usa_la_ultima_vela_si_ya_cerro(self):
        s = serie_sintetica(n=300, marco="1h")
        ahora = s[-1].apertura_ms + PASO + 1000
        r = escanear({"T": s}, [sg.VolatilidadSuficiente(0.0)], solo_completos=False, ahora_ms=ahora)
        self.assertEqual(s[-1].apertura_ms, r[0].cierre_ms)
        self.assertEqual([], r[0].problemas)

    def test_sin_condiciones_se_rechaza(self):
        with self.assertRaises(ValueError):
            escanear({"T": serie_sintetica(n=300)}, [])

    def test_la_historia_corta_no_se_da_por_buena(self):
        corta = serie_sintetica(n=50)
        r = escanear({"T": corta}, [sg.TendenciaAlcista(200)], solo_completos=False)
        self.assertTrue(any("historia insuficiente" in p for p in r[0].problemas))
        self.assertFalse(r[0].completo)

    def test_solo_completos_filtra_los_parciales(self):
        s = serie_sintetica(n=300, semilla=2)
        imposible = sg.VolatilidadSuficiente(999.0)
        self.assertEqual([], escanear({"T": s}, [imposible], solo_completos=True))
        self.assertEqual(1, len(escanear({"T": s}, [imposible], solo_completos=False)))


class MetricasTest(unittest.TestCase):
    def _resultado(self, netos, capital=10_000.0):
        r = Resultado("x", "T/USDT", "1h", capital)
        equity = capital
        for j, neto in enumerate(netos):
            equity += neto
            r.operaciones.append(
                Operacion(
                    LARGO, T0, T0 + PASO, j, j + 1, 100.0, 100.0 + neto, 1.0,
                    neto, 0.0, 0.0, "e", "s",
                )
            )
            r.equity.append(equity)
            r.marcas.append(T0 + j * PASO)
        r.barras_evaluadas = len(netos)
        return r

    def test_muestra_pequena_no_es_concluyente(self):
        m = calcular(self._resultado([100.0] * 5))
        self.assertFalse(m.concluyente)
        self.assertIn("NO CONCLUYENTE", m.resumen())

    def test_muestra_suficiente_si_es_concluyente(self):
        m = calcular(self._resultado([10.0, -5.0] * MUESTRA_MINIMA))
        self.assertTrue(m.concluyente)

    def test_avisa_si_una_sola_operacion_lo_gana_todo(self):
        netos = [-10.0] * 20 + [5000.0] + [-10.0] * 20
        m = calcular(self._resultado(netos))
        self.assertTrue(any("una sola operacion" in a for a in m.advertencias))

    def test_sin_perdedoras_avisa_en_vez_de_dar_profit_factor_infinito(self):
        m = calcular(self._resultado([50.0] * 10))
        self.assertIsNone(m.profit_factor)
        self.assertTrue(any("infinito" in a for a in m.advertencias))

    def test_sin_operaciones_lo_dice_y_no_finge_metricas(self):
        r = Resultado("x", "T/USDT", "1h", 10_000.0)
        r.equity = [10_000.0] * 10
        r.marcas = [T0 + i * PASO for i in range(10)]
        m = calcular(r)
        self.assertIsNone(m.acierto_pct)
        self.assertIn("-", m.resumen())
        self.assertTrue(any("no abrio ni una operacion" in a for a in m.advertencias))

    def test_el_drawdown_mide_de_pico_a_valle(self):
        r = Resultado("x", "T/USDT", "1h", 100.0)
        r.equity = [100.0, 200.0, 150.0, 100.0, 250.0]
        r.marcas = [T0 + i * PASO for i in range(5)]
        m = calcular(r)
        self.assertAlmostEqual(50.0, m.max_drawdown_pct)  # de 200 a 100

    def test_la_racha_perdedora_cuenta_consecutivas(self):
        m = calcular(self._resultado([-1.0, -1.0, 5.0, -1.0, -1.0, -1.0, 5.0]))
        self.assertEqual(3, m.racha_perdedora)


class DiagnosticoTest(unittest.TestCase):
    def test_senala_la_condicion_que_hunde_el_embudo(self):
        s = serie_sintetica(n=500, semilla=4)
        imposible = sg.VolatilidadSuficiente(999.0)
        d = diagnosticar(s, [sg.VolatilidadSuficiente(0.0), imposible])
        self.assertEqual(0, d.todas)
        self.assertEqual(imposible.nombre, d.culpable.nombre)
        self.assertIn("CERO senales", d.resumen())

    def test_el_embudo_solo_puede_decrecer(self):
        s = serie_sintetica(n=500, semilla=6)
        d = diagnosticar(s, [sg.TendenciaAlcista(50), sg.RupturaDonchian(20), sg.VolumenSuperiorA(1.2)])
        previo = d.barras
        for f in d.filas:
            self.assertLessEqual(f.cumple_acumulado, previo)
            previo = f.cumple_acumulado

    def test_sin_condiciones_se_rechaza(self):
        with self.assertRaises(ValueError):
            diagnosticar(serie_sintetica(n=100), [])


class SistemaTest(unittest.TestCase):
    """La prueba que impide que todo lo anterior sea decorativo."""

    def _estrategia(self):
        return EstrategiaDeCondiciones(
            entrada=[sg.TendenciaAlcista(100), sg.RupturaDonchian(20), sg.VolumenSuperiorA(1.2)],
            nombre="seguimiento",
            stop_en_atr=2.5,
            objetivo_en_r=None,
            salida_por_arrastre=3.0,
        )

    def test_sobre_ruido_sin_deriva_y_con_costos_se_pierde_dinero(self):
        """Un mercado sin tendencia no se puede explotar. Si esto saliera
        positivo de forma consistente, el motor estaria mintiendo en algun
        sitio: no hay nada que descubrir en un camino aleatorio.
        """
        perdidas = 0
        corridas = 0
        for semilla in range(1, 9):
            s = serie_sintetica(n=2500, semilla=semilla, deriva=0.0, volatilidad=0.02)
            r = backtest(s, self._estrategia(), Costos(), 10_000.0)
            if r.operaciones:
                corridas += 1
                if r.capital_final < 10_000.0:
                    perdidas += 1
        self.assertGreaterEqual(corridas, 5, "la estrategia casi no opero; la prueba no mide nada")
        self.assertGreaterEqual(
            perdidas, corridas * 0.6,
            f"solo {perdidas}/{corridas} corridas sobre ruido perdieron dinero; "
            "sospechar del motor antes que de la estrategia",
        )

    def test_los_costos_empeoran_el_resultado_siempre(self):
        s = serie_sintetica(n=2000, semilla=21, deriva=0.0005)
        sin = backtest(s, self._estrategia(), SIN_COSTOS, 10_000.0)
        con = backtest(s, self._estrategia(), Costos(), 10_000.0)
        self.assertEqual(len(sin.operaciones), len(con.operaciones))
        self.assertLess(con.capital_final, sin.capital_final)

    def test_comprar_y_mantener_sigue_al_precio(self):
        """Referencia obligatoria: si sube 50%, comprar y mantener sube ~50%."""
        s = serie_sintetica(n=1000, semilla=3, deriva=0.001)
        r = backtest(s, ComprarYMantener(), SIN_COSTOS, 10_000.0)
        variacion = (s[-1].cierre / s[0].apertura - 1) * 100
        m = calcular(r)
        self.assertAlmostEqual(variacion, m.rentabilidad_pct, delta=abs(variacion) * 0.15 + 1)

    def test_una_estrategia_sin_condiciones_de_entrada_se_rechaza(self):
        with self.assertRaises(ValueError):
            EstrategiaDeCondiciones(entrada=[], nombre="todo")

    def test_el_arrastre_nunca_afloja_el_stop(self):
        """Un stop que retrocede no es un stop, es una esperanza."""
        s = serie_sintetica(n=800, semilla=9, deriva=0.0015)
        est = self._estrategia()
        stops = []

        class Espia(EstrategiaDeCondiciones):
            def evaluar(self, ctx):
                r = super().evaluar(ctx)
                if ctx.hay_posicion() and ctx.posicion.stop is not None:
                    stops.append((ctx.posicion.indice_entrada, ctx.posicion.stop))
                return r

        espia = Espia(
            entrada=est.entrada, nombre="espia", stop_en_atr=2.5,
            objetivo_en_r=None, salida_por_arrastre=3.0,
        )
        backtest(s, espia, SIN_COSTOS, 10_000.0)
        self.assertTrue(stops, "no se abrio ninguna posicion: la prueba no mide nada")
        por_operacion: dict[int, list[float]] = {}
        for entrada, stop in stops:
            por_operacion.setdefault(entrada, []).append(stop)
        for entrada, serie_stops in por_operacion.items():
            for a, b in zip(serie_stops, serie_stops[1:]):
                self.assertGreaterEqual(b, a - 1e-9, f"el stop retrocedio en la operacion {entrada}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
