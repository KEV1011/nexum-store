import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tecnico.costos import FUNDING_CADA_MS, Costos, periodos_de_financiacion


class CostosTest(unittest.TestCase):
    def setUp(self):
        self.c = Costos(comision_taker=10.0, comision_maker=5.0, deslizamiento=20.0)

    def test_el_deslizamiento_siempre_juega_en_contra(self):
        self.assertAlmostEqual(100.2, self.c.precio_de_compra(100.0))
        self.assertAlmostEqual(99.8, self.c.precio_de_venta(100.0))

    def test_comprar_y_vender_al_mismo_precio_pierde_plata(self):
        """La prueba que mas importa: sin movimiento, operar cuesta."""
        compra = self.c.precio_de_compra(100.0)
        venta = self.c.precio_de_venta(100.0)
        bruto = venta - compra
        neto = bruto - self.c.comision(compra) - self.c.comision(venta)
        self.assertLess(neto, 0.0)

    def test_maker_cuesta_menos_que_taker(self):
        self.assertLess(self.c.comision(1000, maker=True), self.c.comision(1000))

    def test_comision_negativa_se_rechaza(self):
        with self.assertRaises(ValueError):
            Costos(comision_taker=-1.0)

    def test_financiacion_cero_sin_cruzar_corte(self):
        # Abre a las 00:10 y cierra a las 07:50 del mismo dia.
        entrada = 10 * 60_000
        salida = entrada + 7 * 3_600_000
        self.assertEqual(0, periodos_de_financiacion(entrada, salida))

    def test_financiacion_cuenta_cada_corte_cruzado(self):
        entrada = 60_000  # 00:01
        self.assertEqual(1, periodos_de_financiacion(entrada, entrada + 8 * 3_600_000))
        self.assertEqual(3, periodos_de_financiacion(entrada, entrada + 24 * 3_600_000))

    def test_el_corte_exacto_cuenta(self):
        self.assertEqual(1, periodos_de_financiacion(0, FUNDING_CADA_MS))

    def test_el_corto_cobra_la_financiacion_positiva(self):
        largo = self.c.financiacion(10_000, 3, lado=+1)
        corto = self.c.financiacion(10_000, 3, lado=-1)
        self.assertGreater(largo, 0.0)
        self.assertAlmostEqual(-largo, corto)

    def test_una_posicion_de_un_mes_paga_lo_suyo(self):
        """90 cobros sobre 10.000 al 0,01% = 90. No es ruido."""
        c = Costos(financiacion_bps_8h=1.0)
        self.assertAlmostEqual(90.0, c.financiacion(10_000, 90, +1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
