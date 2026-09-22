#!/usr/bin/env python3
"""Linea de comandos del motor tecnico.

  python3 trading/cli.py demo
  python3 trading/cli.py backtest BTCUSDT --marco 4h --velas 3000
  python3 trading/cli.py escanear --marco 4h --top 20
  python3 trading/cli.py walkforward BTCUSDT --marco 4h --velas 8000
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from tecnico import senales as sg
from tecnico.costos import Costos
from tecnico.estrategia import ComprarYMantener, EstrategiaDeCondiciones
from tecnico.diagnostico import diagnosticar
from tecnico.escaner import escanear, tabla
from tecnico.metricas import calcular
from tecnico.motor import backtest
from tecnico.velas import Serie, serie_sintetica
from tecnico.walkforward import rejilla, walk_forward


def condiciones_seguimiento(ema_tendencia=200, donchian=20, volumen=1.3, liquidez=200_000):
    """Seguimiento de tendencia: la familia que mejor aguanta fuera de muestra
    en cripto. No porque acierte mucho -- acierta el 35-45% -- sino porque las
    ganadoras son varias veces mas grandes que las perdedoras.

    liquidez=0 quita ese filtro. Solo tiene sentido con datos REALES: sobre
    series sinteticas el volumen es inventado y el filtro no mide nada.
    """
    condiciones = [
        sg.TendenciaAlcista(ema_tendencia),
        sg.RupturaDonchian(donchian),
        sg.VolumenSuperiorA(volumen),
        sg.VolatilidadSuficiente(0.3),
    ]
    if liquidez > 0:
        condiciones.append(sg.LiquidezMinima(liquidez))
    return condiciones


def _costos(args) -> Costos:
    return Costos(
        comision_taker=args.comision,
        comision_maker=args.comision / 2,
        deslizamiento=args.deslizamiento,
        financiacion_bps_8h=args.financiacion,
    )


def _serie(args) -> Serie:
    if args.sintetico:
        return serie_sintetica(args.simbolo, args.marco, args.velas, deriva=0.0004)
    from tecnico.fuentes.binance import descargar_con_cache

    print(f"descargando {args.simbolo} {args.marco} ({args.velas} velas)...", file=sys.stderr)
    return descargar_con_cache(
        args.simbolo, args.marco, args.velas, args.cache, futuros=args.futuros
    )


def cmd_backtest(args) -> int:
    serie = _serie(args)
    costos = _costos(args)
    estrategia = EstrategiaDeCondiciones(
        entrada=condiciones_seguimiento(args.ema, args.donchian, args.volumen),
        nombre="seguimiento de tendencia",
        riesgo_pct=args.riesgo,
        stop_en_atr=args.stop_atr,
        objetivo_en_r=None if args.arrastre > 0 else args.objetivo_r,
        salida_por_arrastre=args.arrastre,
    )
    res = backtest(serie, estrategia, costos, args.capital, exigir_serie_limpia=False)
    m = calcular(res)

    print(f"\n{serie.simbolo} {serie.marco} — {len(serie)} velas — {estrategia.nombre}")
    print(f"capital {args.capital:,.0f} -> {res.capital_final:,.2f}")
    print(m.resumen())

    # La comparacion que casi ningun informe incluye.
    ref = backtest(serie, ComprarYMantener(), costos, args.capital, exigir_serie_limpia=False)
    m_ref = calcular(ref)
    print(f"\n  referencia: comprar y mantener  {m_ref.rentabilidad_pct:+.2f}%  "
          f"(caida maxima {m_ref.max_drawdown_pct:.1f}%)")
    diferencia = m.rentabilidad_pct - m_ref.rentabilidad_pct
    if diferencia <= 0:
        print(f"  >> la estrategia NO bate a comprar y esperar ({diferencia:+.2f} puntos)")
    else:
        print(f"  la estrategia gana {diferencia:+.2f} puntos sobre comprar y esperar")

    if not res.operaciones:
        print("\n  POR QUE NO HUBO NI UNA OPERACION:")
        print(diagnosticar(serie, estrategia.entrada).resumen())

    if args.operaciones and res.operaciones:
        print("\n  ultimas operaciones:")
        for op in res.operaciones[-args.operaciones:]:
            print(
                f"    {'LARGO' if op.lado == 1 else 'CORTO'} "
                f"{op.precio_entrada:>12,.6g} -> {op.precio_salida:>12,.6g}  "
                f"neto {op.neto:>10,.2f}  {op.barras:>4} barras  salida: {op.razon_salida}"
            )
    return 0


def cmd_escanear(args) -> int:
    condiciones = condiciones_seguimiento(args.ema, args.donchian, args.volumen)
    if args.sintetico:
        series = {
            f"SIM{i}USDT": serie_sintetica(f"SIM{i}USDT", args.marco, 400, semilla=i, deriva=0.001)
            for i in range(1, 13)
        }
        fallos: dict[str, str] = {}
    else:
        from tecnico.fuentes.binance import descargar_muchos, simbolos_usdt

        print("consultando simbolos liquidos...", file=sys.stderr)
        simbolos = simbolos_usdt(args.liquidez, futuros=args.futuros)[: args.simbolos]
        print(f"{len(simbolos)} simbolos; descargando {args.marco}...", file=sys.stderr)

        def avance(n, total, simbolo):
            if n % 10 == 0 or n == total:
                print(f"  {n}/{total}", end="\r", file=sys.stderr)

        series, fallos = descargar_muchos(
            simbolos, args.marco, args.velas, args.cache, futuros=args.futuros, al_avanzar=avance
        )
        print(file=sys.stderr)

    hallazgos = escanear(series, condiciones, solo_completos=not args.parciales)
    print(f"\nescaneados {len(series)} simbolos en {args.marco}; "
          f"cumplen todo: {sum(1 for h in hallazgos if h.completo)}")
    print("condiciones: " + " + ".join(c.nombre for c in condiciones))
    print()
    print(tabla(hallazgos[: args.top]))
    if fallos:
        print(f"\n  {len(fallos)} simbolo(s) no se pudieron consultar: "
              f"{', '.join(list(fallos)[:5])}{'...' if len(fallos) > 5 else ''}")
    print("\n  Esto NO es una recomendacion de compra: son los simbolos que cumplen")
    print("  unas condiciones que TU tienes que haber validado antes con backtest.")
    return 0


def cmd_walkforward(args) -> int:
    serie = _serie(args)
    costos = _costos(args)

    def construir(p):
        return EstrategiaDeCondiciones(
            entrada=condiciones_seguimiento(p["ema"], p["donchian"], 1.3),
            nombre="seguimiento",
            riesgo_pct=args.riesgo,
            stop_en_atr=p["stop_atr"],
            objetivo_en_r=None,
            salida_por_arrastre=p["arrastre"],
        )

    combinaciones = rejilla(
        {
            "ema": [100, 200],
            "donchian": [20, 55],
            "stop_atr": [2.0, 3.0],
            "arrastre": [2.0, 4.0],
        }
    )
    print(f"\n{serie.simbolo} {serie.marco} — {len(serie)} velas — "
          f"{len(combinaciones)} combinaciones por tramo")
    res = walk_forward(
        serie,
        construir,
        combinaciones,
        costos,
        barras_entrenamiento=args.entrenamiento,
        barras_prueba=args.prueba,
        capital_inicial=args.capital,
    )
    print(res.resumen())

    ops = res.operaciones_fuera_de_muestra
    print(f"\n  operaciones fuera de muestra en total: {len(ops)}")
    if ops:
        neto = sum(o.neto for o in ops)
        ganadoras = sum(1 for o in ops if o.ganadora)
        print(f"  neto agregado: {neto:,.2f}   acierto: {ganadoras / len(ops) * 100:.1f}%")
        if len(ops) < 30:
            print("  >> menos de 30 operaciones: no es concluyente, hace falta mas historia")
    return 0


def cmd_diagnosticar(args) -> int:
    serie = _serie(args)
    liquidez = 0 if args.sintetico else 200_000
    d = diagnosticar(
        serie, condiciones_seguimiento(args.ema, args.donchian, args.volumen, liquidez)
    )
    print()
    print(d.resumen())
    return 0


def cmd_demo(args) -> int:
    """Recorre todo el sistema con datos sinteticos, sin tocar la red."""
    print("=" * 74)
    print("DEMO con datos SINTETICOS (ruido con deriva). Sirve para ver que el")
    print("sistema funciona, NO para sacar conclusiones sobre ninguna estrategia.")
    print("=" * 74)
    serie = serie_sintetica("DEMO/USDT", "4h", 3000, deriva=0.0006, volatilidad=0.018)
    costos = Costos()
    estrategia = EstrategiaDeCondiciones(
        entrada=condiciones_seguimiento(100, 20, 1.2, liquidez=0),
        nombre="seguimiento de tendencia",
        riesgo_pct=1.0,
        stop_en_atr=2.5,
        objetivo_en_r=None,
        salida_por_arrastre=3.0,
    )
    res = backtest(serie, estrategia, costos, 10_000.0)
    m = calcular(res)
    print(f"\n[1] BACKTEST  {serie.simbolo} {serie.marco}, {len(serie)} velas")
    print(m.resumen())

    ref = calcular(backtest(serie, ComprarYMantener(), costos, 10_000.0))
    print(f"\n  referencia comprar y mantener: {ref.rentabilidad_pct:+.2f}%")

    print("\n[2] MISMAS CONDICIONES COMO ESCANER (ultima vela cerrada)")
    series = {
        f"SIM{i}USDT": serie_sintetica(f"SIM{i}USDT", "4h", 500, semilla=i * 13, deriva=0.0008)
        for i in range(1, 15)
    }
    hallazgos = escanear(series, condiciones_seguimiento(100, 20, 1.2, liquidez=0), solo_completos=False)
    print(tabla(hallazgos[:8]))

    print("\n[3] WALK-FORWARD (parametros elegidos solo con el pasado)")

    def construir(p):
        return EstrategiaDeCondiciones(
            entrada=condiciones_seguimiento(p["ema"], p["donchian"], 1.2, liquidez=0),
            nombre="seguimiento",
            stop_en_atr=p["stop_atr"],
            objetivo_en_r=None,
            salida_por_arrastre=3.0,
        )

    wf = walk_forward(
        serie,
        construir,
        rejilla({"ema": [100, 200], "donchian": [20, 55], "stop_atr": [2.0, 3.0]}),
        costos,
        barras_entrenamiento=1200,
        barras_prueba=400,
    )
    print(wf.resumen())
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Motor de analisis tecnico y backtesting")
    sub = p.add_subparsers(dest="cmd", required=True)

    def comunes(sp, con_simbolo=True):
        if con_simbolo:
            sp.add_argument("simbolo", nargs="?", default="BTCUSDT")
        sp.add_argument("--marco", default="4h", help="1m,5m,15m,1h,4h,1d...")
        sp.add_argument("--velas", type=int, default=2000)
        sp.add_argument("--capital", type=float, default=10_000.0)
        sp.add_argument("--riesgo", type=float, default=1.0, help="%% de capital por operacion")
        sp.add_argument("--comision", type=float, default=4.5, help="bps por lado")
        sp.add_argument("--deslizamiento", type=float, default=2.0, help="bps")
        sp.add_argument("--financiacion", type=float, default=1.0, help="bps cada 8h")
        sp.add_argument("--futuros", action="store_true")
        sp.add_argument("--cache", default="trading/datos")
        sp.add_argument("--sintetico", action="store_true", help="sin red, datos generados")
        sp.add_argument("--ema", type=int, default=200)
        sp.add_argument("--donchian", type=int, default=20)
        sp.add_argument("--volumen", type=float, default=1.3)

    sp = sub.add_parser("backtest", help="prueba una estrategia sobre historia")
    comunes(sp)
    sp.add_argument("--stop-atr", type=float, default=2.5)
    sp.add_argument("--objetivo-r", type=float, default=3.0)
    sp.add_argument("--arrastre", type=float, default=3.0, help="stop que persigue, en ATR (0=no)")
    sp.add_argument("--operaciones", type=int, default=10, help="cuantas imprimir")
    sp.set_defaults(func=cmd_backtest)

    sp = sub.add_parser("escanear", help="busca simbolos que cumplen las condiciones ahora")
    comunes(sp, con_simbolo=False)
    sp.add_argument("--top", type=int, default=25)
    sp.add_argument("--simbolos", type=int, default=120, help="cuantos pares mirar")
    sp.add_argument("--liquidez", type=float, default=20_000_000, help="volumen 24h minimo")
    sp.add_argument("--parciales", action="store_true", help="mostrar tambien los que no cumplen todo")
    sp.set_defaults(func=cmd_escanear, velas=400)

    sp = sub.add_parser("walkforward", help="validacion fuera de muestra")
    comunes(sp)
    sp.add_argument("--entrenamiento", type=int, default=1500)
    sp.add_argument("--prueba", type=int, default=500)
    sp.set_defaults(func=cmd_walkforward)

    sp = sub.add_parser("diagnosticar", help="por que no salen senales")
    comunes(sp)
    sp.set_defaults(func=cmd_diagnosticar)

    sp = sub.add_parser("demo", help="recorre todo sin tocar la red")
    sp.set_defaults(func=cmd_demo)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\ninterrumpido", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
