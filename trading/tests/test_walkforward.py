"""Walk-forward: que los parametros se elijan SIN ver la ventana de prueba."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tecnico import senales as sg
from tecnico.costos import Costos
from tecnico.estrategia import EstrategiaDeCondiciones
from tecnico.motor import Contexto, Estrategia, Intencion, LARGO, backtest
from tecnico.velas import serie_sintetica
from tecnico.walkforward import ResultadoWF, Tramo, _SoloDesde, rejilla, walk_forward


class RejillaTest(unittest.TestCase):
    def test_producto_cartesiano(self):
        r = rejilla({"a": [1, 2], "b": ["x", "y", "z"]})
        self.assertEqual(6, len(r))
        self.assertEqual(6, len({(c["a"], c["b"]) for c in r}))

    def test_rejilla_vacia_da_una_combinacion_vacia(self):
        self.assertEqual([{}], rejilla({}))


class CalentamientoTest(unittest.TestCase):
    def test_no_se_abre_posicion_antes_del_indice(self):
        class SiempreCompra(Estrategia):
            nombre = "siempre"

            def evaluar(self, ctx):
                if not ctx.hay_posicion():
                    return Intencion("abrir", LARGO, 1.0, ctx.cierre() * 0.9, None, "x")
                return None

        s = serie_sintetica(n=300, semilla=8)
        r = backtest(s, _SoloDesde(SiempreCompra(), desde=100), Costos(), exigir_serie_limpia=False)
        self.assertTrue(r.operaciones)
        self.assertGreaterEqual(min(o.indice_entrada for o in r.operaciones), 100)


class VentanasTest(unittest.TestCase):
    def _construir(self, p):
        return EstrategiaDeCondiciones(
            entrada=[sg.TendenciaAlcista(p["ema"]), sg.RupturaDonchian(p["donchian"])],
            nombre="t",
            stop_en_atr=2.0,
            objetivo_en_r=None,
            salida_por_arrastre=3.0,
        )

    def test_serie_corta_no_inventa_tramos_y_explica_por_que(self):
        r = walk_forward(
            serie_sintetica(n=300),
            self._construir,
            rejilla({"ema": [50], "donchian": [20]}),
            Costos(),
            barras_entrenamiento=2000,
            barras_prueba=500,
        )
        self.assertEqual([], r.tramos)
        self.assertTrue(any("no se puede validar" in a for a in r.advertencias))
        self.assertIn("ningun tramo", r.resumen())

    def test_las_operaciones_reportadas_son_solo_de_las_ventanas_de_prueba(self):
        s = serie_sintetica(n=4000, semilla=17, deriva=0.0005, volatilidad=0.02)
        r = walk_forward(
            s,
            self._construir,
            rejilla({"ema": [50, 100], "donchian": [20, 40]}),
            Costos(),
            barras_entrenamiento=1200,
            barras_prueba=400,
            calentamiento=210,
        )
        self.assertTrue(r.tramos, "no se produjo ni un tramo; la prueba no mide nada")
        for t in r.tramos:
            for op in t.operaciones:
                # Dentro de cada tramo de prueba el motor recibe
                # [fin_entrenamiento - calentamiento, fin_prueba), asi que toda
                # entrada debe caer despues del calentamiento.
                self.assertGreaterEqual(op.indice_entrada, 210)

    def test_la_estabilidad_detecta_parametros_que_bailan(self):
        wf = ResultadoWF()
        for i, ema in enumerate([50, 50, 50, 50]):
            wf.tramos.append(Tramo(i, {"ema": ema, "otro": i}, None, None))
        est = wf.estabilidad()
        self.assertAlmostEqual(1.0, est["ema"])
        self.assertAlmostEqual(0.25, est["otro"])

    def test_sin_combinaciones_se_rechaza(self):
        with self.assertRaises(ValueError):
            walk_forward(serie_sintetica(n=3000), self._construir, [], Costos())


if __name__ == "__main__":
    unittest.main(verbosity=2)
