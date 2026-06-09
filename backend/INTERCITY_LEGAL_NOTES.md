# Transporte intermunicipal — Notas legales y de configuración

> ⚠️ **No soy abogado.** Este documento resume decisiones de producto y su
> configuración técnica. La operación de transporte intermunicipal de pasajeros
> en Colombia está regulada por el Ministerio de Transporte y la
> Superintendencia de Transporte. **Valida con asesoría jurídica antes de
> producción.**

## Contexto legal

En Colombia, transportar pasajeros entre municipios cobrando una **tarifa
comercial** es un servicio público regulado que **requiere habilitación** del
Ministerio de Transporte. Un particular no habilitado **no** puede operar como
empresa de transporte.

La figura de **gasto compartido** (cost sharing) permite que un particular
comparta un viaje y **recupere sus costos** (combustible + peajes) sin lucrarse.
Mientras el conductor solo recupere costos y no obtenga utilidad, la plataforma
actúa como **intermediario tecnológico**, no como operador de transporte.

**Eliminar el tope de gasto compartido convierte la operación en transporte
intermunicipal informal/ilegal.** Por eso el tope NO es un bug: es una
salvaguarda deliberada.

## Las tres opciones (configurables)

La opción se elige por variables de entorno. **Por defecto opera la Opción A.**

### Opción A — Gasto compartido con costos recalibrados (por defecto, recomendada)

El tope sigue vigente, pero los costos base se recalibraron a valores 2026 y son
configurables por entorno. Esto sube el tope de forma legítima sin perder la
figura de gasto compartido.

| Variable de entorno | Default | Descripción |
|---|---|---|
| `SHARED_RIDE_COST_PER_KM` | `950` | Costo de operación por km en COP (combustible + desgaste, sin utilidad). **TODO: el operador debe confirmar la cifra real 2026.** |
| `SHARED_RIDE_TOLL_PER_100KM` | `16000` | Costo estimado de peajes por cada 100 km. **TODO: confirmar peajes reales por corredor.** |

**Fórmula del tope** (`getMaxFarePerSeat` en `config/constants.ts`):

```
costoTotal = distanciaKm * SHARED_RIDE_COST_PER_KM
           + (distanciaKm / 100) * SHARED_RIDE_TOLL_PER_100KM
ocupantes  = puestos + 1            (el conductor también ocupa un puesto)
topePorPuesto = techo(costoTotal / ocupantes, múltiplo de $500)
```

Con los defaults recalibrados, el tope para Bucaramanga (200 km, 4 puestos) pasa
de **$31.600** (insuficiente) a **$44.500**, cubriendo la tarifa sugerida de
$42.000. Las cifras exactas las fija el operador en los TODO de arriba.

### Opción B — Modelo dual (rutas troncales con operador habilitado)

`INTERCITY_DUAL_MODEL=true` (default `false`).

Las rutas troncales marcadas con `requiresLicensedOperator` se **deshabilitan
para conductores particulares** hasta tener convenio con una empresa de
transporte habilitada. Rutas troncales actuales: Pamplona–Bucaramanga,
Pamplona–Bogotá, Cúcuta–Bucaramanga, Málaga–Bucaramanga, y cualquier ruta
estimada de ≥ 150 km. Las rutas cortas/veredales siguen como gasto compartido.

Cuando está activo, tanto la publicación de viajes (conductor) como la solicitud
directa (cliente) sobre una ruta troncal se rechazan con HTTP 422 y un mensaje
claro.

### Opción C — Sin tope (NO recomendada sin habilitación)

`INTERCITY_REMOVE_CAP=true` (default `false`).

Solo debe activarse si el operador **confirma por escrito que asume el marco
legal** del transporte intermunicipal comercial (habilitación). Cuando está
activo:

- No se valida el tope al publicar viajes (el valor de gasto compartido se sigue
  calculando como referencia, pero no se exige).
- El backend expone `legal.capEnforced=false` en `GET /client/intercity/routes`,
  para que las apps muestren el **descargo de responsabilidad legal**.

## Resumen de variables de entorno

```bash
# Opción A (recalibración de costos) — siempre activa
SHARED_RIDE_COST_PER_KM=950          # TODO: confirmar 2026
SHARED_RIDE_TOLL_PER_100KM=16000     # TODO: confirmar 2026

# Opción B (modelo dual)
INTERCITY_DUAL_MODEL=false

# Opción C (quitar el tope) — requiere asumir el marco legal por escrito
INTERCITY_REMOVE_CAP=false
```

## Estado del emparejamiento (nota técnica)

Hay dos flujos intermunicipales:

- **Pooled / gasto compartido** (`intercity-pool.service.ts`): el conductor
  publica un viaje con puestos. El cliente busca y reserva sobre viajes **reales
  publicados**. El tope se aplica en la publicación.
- **Directo / negociación de tarifa** (`intercity.service.ts`): el cliente ofrece
  una tarifa y recibe aceptación o contraoferta. Hoy la respuesta del conductor
  se **simula** desde el servidor (no hay aún UI de conductor para solicitudes
  directas; el conductor solo gestiona viajes pooled). El cliente puede solicitar
  **cualquier par de municipios soportados** y el sistema busca conductor. El
  despacho directo a conductores reales vía PostGIS queda como trabajo futuro:
  requiere construir la pantalla de solicitudes directas en la app del conductor.

El cálculo geográfico de rutas usa centroides municipales aproximados
(`INTERCITY_CITY_COORDS`) para sintetizar distancia/tarifa de cualquier par sin
fila explícita, de modo que **ningún par de municipios queda "sin ruta"**.
