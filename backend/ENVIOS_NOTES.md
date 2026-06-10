# Envíos — unificación de "Mandados" bajo un solo servicio

> Decisión de producto (2026-06): el cliente ve **una sola categoría "Envíos"**.
> La palabra "mandado" desaparece de la interfaz. El backend no cambia.

## Qué ve el cliente

En el home de movilidad hay tres servicios: **Transporte**, **Moto** y
**Envíos** ("Paquetes, compras y diligencias"). Al pedir un Envío, la app
muestra dos subtipos:

| Subtipo en la UI            | Flujo                              | Motor backend            |
|-----------------------------|------------------------------------|--------------------------|
| **Enviar un paquete**       | Punto a punto, paquete ya listo    | `Trip` con `serviceType: envios` (trip.service / matching.service) |
| **Compra o diligencia**     | Comprar/recoger/pagar algo por ti  | `Errand` (errand.service.ts) — antes "mandados" |

## Mapeo mandado → envío

- La entidad, rutas REST y mensajes WebSocket del backend **no cambian**:
  `Errand`, `/client/errands/*`, `subscribe_errand` / `errand_update` siguen
  igual. Solo cambia la presentación en AppCliente.
- Las categorías del errand (farmacia, mercado, documentos, pagos, comida,
  compras, otro) se conservan como "tipo de encargo" dentro del flujo de
  Envíos (`errand_booking_screen.dart`).
- Campos útiles del errand (descripción de qué comprar/recoger, presupuesto
  de compra, notas) viven dentro del flujo de Envíos, no en una sección
  aparte.
- Copy en la app: "mandado" → "envío" (el servicio) o "encargo" (la tarea
  concreta). Ejemplos: "Pedir un mandado" → "Envío: compra o diligencia",
  "Mi mandado" → "Mi envío", banner activo "Mandado · Farmacia" →
  "Envío · Farmacia".

## Compatibilidad con estados activos

Un errand activo creado antes del cambio sigue mostrándose en el home y en
`errand_status_screen` con la etiqueta nueva ("Envío · <categoría>"): el id,
el estado y el canal WS son los mismos, así que no se interrumpe ningún
pedido en curso.

## Por qué no se fusionó a nivel de datos

`Trip(envios)` modela transporte de un paquete entre dos puntos con tarifa
por distancia; `Errand` modela una gestión con presupuesto de compra y costo
real reportado por el mensajero. Fusionarlos en una sola tabla habría roto
los contratos REST/WS que las apps Flutter ya consumen. La unificación es de
presentación; si más adelante se quiere una sola tabla, migrar `Errand` a un
subtipo de `Trip` requiere su propia migración Prisma y versión de API.
