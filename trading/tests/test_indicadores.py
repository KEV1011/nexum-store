"""La prueba central del paquete: ningun indicador puede mirar al futuro.

Metodo: se calcula el indicador sobre la serie ENTERA y despues sobre cada
prefijo datos[:k]. Si el valor de la posicion k-1 cambia segun cuantas barras
FUTURAS haya en la lista, el indicador esta mirando adelante. Ese es el fallo
que convierte cualquier estrategia en oro dentro de un backtest y en perdidas
en la cuenta real, y no lo caza ninguna otra prueba: el indicador sigue
devolviendo numeros razonables.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tecnico import indicadores as ind
from tecnico.velas import serie_sintetica


def _prefijos(calcular, n, paso=7, minimo=40):
    """Compara serie completa contra prefijos. Devuelve los desajustes."""
    completo = calcular(n)
    fallos = []
    for k in range(minimo, n + 1, paso):
        parcial = calcular(k)
        a, b = completo[k - 1], parcial[k - 1]
        if a is None and b is None:
            continue
        if a is None or b is None or abs(a - b) > 1e-9:
            fallos.append((k, a, b))
    return fallos


class CausalidadTest(unittest.TestCase):
    def setUp(self):
        self.s = serie_sintetica(n=300, semilla=11)
        self.c = self.s.cierres()
        self.h = self.s.maximos()
        self.l = self.s.minimos()
        self.v = self.s.volumenes()

    def test_sma_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.sma(self.c[:k], 20), 300))

    def test_ema_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.ema(self.c[:k], 20), 300))

    def test_rma_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.rma(self.c[:k], 14), 300))

    def test_rsi_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.rsi(self.c[:k], 14), 300))

    def test_atr_es_causal(self):
        self.assertEqual(
            [], _prefijos(lambda k: ind.atr(self.h[:k], self.l[:k], self.c[:k], 14), 300)
        )

    def test_desviacion_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.desviacion(self.c[:k], 20), 300))

    def test_bollinger_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.bollinger(self.c[:k], 20)[2], 300))

    def test_macd_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.macd(self.c[:k])[0], 300, minimo=60))
        self.assertEqual([], _prefijos(lambda k: ind.macd(self.c[:k])[1], 300, minimo=60))

    def test_donchian_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.donchian(self.h[:k], self.l[:k], 20)[0], 300))

    def test_volumen_relativo_es_causal(self):
        self.assertEqual([], _prefijos(lambda k: ind.volumen_relativo(self.v[:k], 20), 300))

    def test_pendiente_es_causal(self):
        self.assertEqual(
            [], _prefijos(lambda k: ind.pendiente_pct(ind.ema(self.c[:k], 20), 5), 300)
        )

    def test_el_detector_caza_un_indicador_tramposo(self):
        """Contraprueba: sin esto, las 11 de arriba podrian pasar por vacuidad.

        Una media CENTRADA es el ejemplo clasico de indicador que mira al
        futuro y que en un grafico se ve perfecto.
        """

        def sma_centrada(datos, periodo=20):
            mitad = periodo // 2
            salida = [None] * len(datos)
            for i in range(len(datos)):
                a, b = max(0, i - mitad), min(len(datos), i + mitad + 1)
                if b - a == periodo + 1:
                    salida[i] = sum(datos[a:b]) / (periodo + 1)
            return salida

        fallos = _prefijos(lambda k: sma_centrada(self.c[:k]), 300)
        self.assertTrue(fallos, "el detector de causalidad no esta detectando nada")


class ValoresTest(unittest.TestCase):
    """Valores conocidos, calculados a mano. Causal pero mal no sirve de nada."""

    def test_sma_valor_exacto(self):
        self.assertEqual([None, None, 2.0, 3.0, 4.0], ind.sma([1, 2, 3, 4, 5], 3))

    def test_ema_se_siembra_con_la_sma(self):
        r = ind.ema([1, 2, 3, 4, 5], 3)
        self.assertIsNone(r[1])
        self.assertAlmostEqual(2.0, r[2])  # SMA(1,2,3)
        self.assertAlmostEqual(2.0 + (4 - 2) * 0.5, r[3])  # k = 2/(3+1) = 0.5

    def test_rsi_todo_sube_da_cien(self):
        r = ind.rsi(list(range(1, 40)), 14)
        self.assertAlmostEqual(100.0, r[-1])

    def test_rsi_todo_baja_da_cero(self):
        r = ind.rsi(list(range(40, 1, -1)), 14)
        self.assertAlmostEqual(0.0, r[-1])

    def test_rsi_se_mantiene_en_rango(self):
        s = serie_sintetica(n=400, semilla=3)
        for v in ind.rsi(s.cierres(), 14):
            if v is not None:
                self.assertGreaterEqual(v, 0.0)
                self.assertLessEqual(v, 100.0)

    def test_rango_verdadero_cubre_el_hueco_de_apertura(self):
        # Cierre previo 10; la barra siguiente abre en 20 con rango 20-22.
        tr = ind.rango_verdadero([12, 22], [8, 20], [10, 21])
        self.assertAlmostEqual(4.0, tr[0])
        self.assertAlmostEqual(12.0, tr[1])  # 22 - 10, el hueco cuenta

    def test_atr_nunca_es_negativo(self):
        s = serie_sintetica(n=200, semilla=5)
        for v in ind.atr(s.maximos(), s.minimos(), s.cierres(), 14):
            if v is not None:
                self.assertGreater(v, 0.0)

    def test_periodo_invalido_revienta(self):
        with self.assertRaises(ValueError):
            ind.sma([1, 2, 3], 0)

    def test_serie_corta_devuelve_todo_none(self):
        self.assertEqual([None, None], ind.ema([1, 2], 20))


if __name__ == "__main__":
    unittest.main(verbosity=2)
