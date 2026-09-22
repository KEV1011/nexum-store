# Motor de análisis técnico y backtesting — cripto

Sistema para **medir** estrategias de trading antes de arriesgar dinero, y para
**buscar** en el mercado los símbolos que cumplen exactamente las condiciones
que ya mediste.

No ejecuta órdenes. Esa es una decisión, no una carencia pendiente: un bot que
opera sobre una estrategia sin validar es una máquina de perder capital rápido.

Cero dependencias — solo biblioteca estándar de Python 3.11+. No hay que
instalar nada.

## Empezar

Recorrer todo el sistema sin tocar la red, con datos generados:

```
python3 trading/cli.py demo
```

Correr las pruebas:

```
python3 trading/tests/todas.py
```

Con datos reales de Binance (esto sí necesita internet):

```
python3 trading/cli.py backtest BTCUSDT --marco 4h --velas 3000
python3 trading/cli.py escanear --marco 4h --top 20
python3 trading/cli.py walkforward BTCUSDT --marco 4h --velas 8000
python3 trading/cli.py diagnosticar BTCUSDT --marco 4h
```

En PowerShell son esas mismas líneas, una por una.

## Por qué este backtest no miente

Casi todo backtest público es optimista por los mismos cinco motivos. Los cinco
están cerrados aquí, y cada uno tiene una prueba que falla si alguien los
reabre:

| Trampa | Qué se hace |
|---|---|
| **Mirar al futuro** | Una señal vista al cierre de la barra `i` se ejecuta en la **apertura de `i+1`**. El `Contexto` que recibe la estrategia revienta si se le piden datos futuros: no está mal visto, es imposible. Y los indicadores se comparan contra sus propios prefijos para demostrar que son causales. |
| **Costos ignorados** | Comisión, deslizamiento y **financiación de perpetuos** son obligatorios. El valor por defecto es el real de Binance, no cero. |
| **Sobreajuste** | `walk_forward` elige parámetros viendo solo el pasado y reporta lo que pasó después. Además publica la **estabilidad de los parámetros**: si cada tramo gana con valores distintos, es ruido. |
| **Stop optimista** | Si el stop y el objetivo caen en la misma vela se asume el **stop**. Y un hueco por debajo del stop se llena **en la apertura**, peor que el stop. |
| **Liquidez fantasma** | `LiquidezMinima` descarta pares donde la señal es perfecta pero la orden no se puede ejecutar. |

Prueba que resume todo: **sobre ruido aleatorio con costos, el sistema pierde
dinero** (`test_sobre_ruido_sin_deriva_y_con_costos_se_pierde_dinero`). Si un
día eso saliera positivo, hay que sospechar del motor antes que de la
estrategia — en un camino aleatorio no hay nada que descubrir.

## El motor y el escáner son el mismo sistema

Una condición (`senales.py`) es un objeto, no código suelto dentro de una
estrategia. El **backtest** lo evalúa sobre toda la historia; el **escáner**,
sobre la última vela cerrada de cada símbolo. Misma clase, mismo `cumple()`.

Por eso lo que el escáner muestra hoy es exactamente lo que se validó ayer. Un
escáner escrito aparte acaba siempre divergiendo —un `>` contra un `>=`, un
periodo distinto— y entonces enseña oportunidades que nadie midió nunca.

## Escribir una estrategia

```python
from tecnico import senales as sg
from tecnico.costos import Costos
from tecnico.estrategia import EstrategiaDeCondiciones
from tecnico.fuentes.binance import descargar_con_cache
from tecnico.metricas import calcular
from tecnico.motor import backtest

estrategia = EstrategiaDeCondiciones(
    entrada=[
        sg.TendenciaAlcista(200),        # precio sobre la EMA200 y la EMA subiendo
        sg.RupturaDonchian(20),          # cierre sobre el techo de 20 barras
        sg.VolumenSuperiorA(1.5),        # con volumen detrás
        sg.LiquidezMinima(500_000),      # en un par que se puede ejecutar
    ],
    nombre="ruptura con tendencia",
    riesgo_pct=1.0,        # cuánto se pierde SI salta el stop
    stop_en_atr=2.5,       # stop a 2,5 ATR, no a un % fijo
    salida_por_arrastre=3.0,   # el stop persigue al precio y nunca afloja
)

serie = descargar_con_cache("BTCUSDT", "4h", 3000)
print(calcular(backtest(serie, estrategia, Costos())).resumen())
```

El tamaño de la posición sale del **riesgo**, no de un importe fijo: con el stop
lejos compra menos unidades y con el stop cerca compra más, y en los dos casos
se arriesga lo mismo. Da igual dónde esté el stop, la pérdida por operación es
la misma.

### Cuando no salen señales

Cinco filtros del 40% dejan vivo el 1%. Es lo normal, no un error. En vez de
aflojar parámetros al azar hasta que "salga algo" —que es como se construye una
estrategia sobreajustada sin darse cuenta— el backtest imprime solo el embudo
cuando no hubo ni una operación, y dice qué condición lo hunde:

```
python3 trading/cli.py diagnosticar BTCUSDT --marco 4h
```

## Estructura

```
tecnico/
  velas.py          Vela y Serie; validación de huecos, duplicados y desorden
  indicadores.py    EMA, RSI, ATR, MACD, Bollinger, Donchian... todos causales
  costos.py         comisión, deslizamiento y financiación de perpetuos
  senales.py        condiciones reutilizables (backtest ↔ escáner)
  estrategia.py     estrategia declarativa + referencia comprar-y-mantener
  motor.py          backtest por eventos
  metricas.py       métricas con su letra pequeña
  escaner.py        las mismas condiciones sobre la última vela cerrada
  diagnostico.py    por qué no salen señales
  walkforward.py    validación fuera de muestra
  fuentes/binance.py  descarga con caché; descarta la vela en formación
cli.py              línea de comandos
tests/              81 pruebas
```

## Lo que hay que saber antes de usarlo con dinero

- **Toda estrategia compite contra comprar y esperar.** El comando `backtest` lo
  imprime siempre, porque es la comparación que casi ningún informe incluye,
  justamente porque suele perderla.
- **Menos de 30 operaciones no concluye nada.** El informe lo dice en vez de
  presumir de un 82% de aciertos sobre once operaciones.
- **Un backtest bueno no predice; descarta.** Sirve para tirar a la basura lo
  que no funcionó nunca, no para prometer lo que va a pasar.
- **Colombia:** operar capital propio no requiere licencia. Administrar dinero de
  terceros o recomendar operaciones a cambio de una cuota **sí** la requiere
  (Superintendencia Financiera), y hacerlo sin ella es delito. Las ganancias
  tributan como renta y hay que declarar los activos en el exterior.
