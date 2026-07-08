# Evaluación de Nexum vs Uber / DiDi

Inventario contrastado de las 3 superficies (app cliente, app conductor, backend),
con madurez **real / parcial / falta**. Hecho leyendo el código, no de memoria.

## Veredicto

Nexum es un **MVP honesto y sorprendentemente completo** para una ciudad pequeña
(Pamplona): el **núcleo de transporte y mandados es real de punta a punta**
(matching geoespacial PostGIS, pagos Wompi, payouts, OTP/SMS, push, seguridad,
panel admin). Lo que falta para "igualar a Uber/DiDi" no es el happy-path —ese ya
existe— sino las capas de **confianza, comunicación, navegación, operación a
escala y cumplimiento** que hacen viable un servicio nacional y seguro.

Paridad estimada: **transporte urbano ~70 %**, **delivery/mandados ~75 %**,
**intermunicipal ~90 %** (diferenciador propio), **operación/escala/compliance ~35 %**.

---

## Lo que YA iguala a Uber/DiDi (real, verificado)

| Capacidad | Estado |
|---|---|
| Login OTP/SMS (cliente y conductor) | ✅ real (Twilio o código dev) |
| Matching geoespacial de viajes (PostGIS, oferta secuencial 15 s, fallback) | ✅ real |
| Matching de mandados (mismo motor) | ✅ real |
| Tarifa dinámica / surge por zona (demanda vs oferta) | ✅ real |
| Estimación de tarifa antes de pedir | ✅ real |
| Seguimiento en vivo (mapa + WebSocket) | ✅ real |
| Pagos con tarjeta (Wompi, webhook + conciliación) | ✅ real |
| Propinas (100 % al conductor) | ✅ real |
| Billetera y retiros del conductor (saldo, solicitud, aprobación admin) | ✅ real |
| Perfil del conductor (datos reales del backend) | ✅ real |
| Notificaciones del conductor (feed derivado real) | ✅ real |
| Push FCM | ✅ real |
| Seguridad: SOS, contacto de confianza, compartir viaje, **teléfono enmascarado** | ✅ real (SOS sin aviso automático a policía — stub declarado) |
| Verificación de documentos + panel admin (aprobar/rechazar, métricas, retiros, promos, SOS) | ✅ real |
| Pedidos a negocios: catálogo, carrito, crear pedido, seguimiento, historial | ✅ real |
| Intermunicipal (pool + negociación de tarifa con contraoferta) | ✅ real (diferenciador) |
| Promos / cupones / referidos | ✅ real (backend) |

---

## Brechas vs Uber/DiDi (por prioridad)

### P0 — Confianza, seguridad y operación (bloquean un lanzamiento serio)

1. **KYC / verificación de antecedentes.** Hoy solo se suben fotos de documentos y un
   admin las aprueba a ojo. Falta: validación de cédula/licencia contra registros,
   antecedentes penales, *liveness*/selfie. Es el pilar de seguridad de Uber/DiDi.
2. **Anti-fraude y abuso.** No hay detección de GPS falso, velocidad imposible,
   patrones de cancelación, cuentas múltiples, ni *rate-limit* por usuario/viaje.
3. **Llamada/chat enmascarado en viaje normal.** El teléfono se enmascara en los DTOs,
   pero el chat in-app solo existe en la "negociación de ride", no en un viaje normal,
   y no hay llamada por número proxy. Riesgo de privacidad real.
4. **Navegación turn-by-turn.** Las apps dibujan una línea recta; no hay indicaciones
   giro a giro (el backend tiene proxy a Google pero las apps no consumen rutas).
5. **Despacho real de pedidos a negocios.** Los viajes y mandados se asignan a un
   conductor real; **los pedidos de restaurante/tienda avanzan por temporizador**
   (setTimeout), sin asignarse a un conductor real. Hay que enrutarlos por el motor de matching.
6. **Calificaciones de extremo a extremo.** El esquema es bidireccional y el rating del
   conductor se actualiza, pero falta el endpoint de envío + la pantalla de calificar
   después del viaje (en el conductor) bien cableada.
7. **Soporte in-app.** En ambas apps es un *placeholder* (FAQ/chat dummy). Sin canal de
   soporte no hay operación real.

### P1 — Paridad de producto competitiva

8. **Ganancias del conductor reales.** La pantalla de ganancias se alimenta de un
   historial **local** (semilla demo en el dispositivo); los endpoints `/earnings/*`
   existen pero la pantalla no los consume. Hay que cablearla al backend.
9. **Programar viajes** y **múltiples paradas** (A→B→C). No existen.
10. **Métodos de pago:** efectivo (mencionado, sin lógica), billetera del **cliente**
    (saldo), PSE/Nequi (el backend los soporta vía Wompi pero la app no los expone).
11. **Aplicar cupón en el checkout** (el backend valida cupones; la UI no tiene el campo).
12. **Lugares recientes** y **favoritos sincronizados** (hoy favoritos son solo locales).
13. **Recibos descargables (PDF)** y facturación.

### P2 — Escala, calidad y cumplimiento

14. **Multi-ciudad / geocercas.** Coordenadas de Pamplona están *hardcoded*; no hay
    modelo de zonas/ciudades ni geofencing.
15. **Escalabilidad multi-instancia.** Redis solo reparte entregas; el estado de matching
    y suscripciones es por instancia (un solo proceso real hoy).
16. **Observabilidad.** Hay logging estructurado (Pino) y Sentry opcional, pero faltan
    métricas (Prometheus), *tracing* y *health checks* de negocio.
17. **Pruebas.** Cobertura mínima (~unas pocas pruebas unitarias). Falta integración/e2e
    de matching, pagos y WebSocket.
18. **WhatsApp** a negocios/cliente es *stub* (solo logs); falta integrar Meta/Twilio.
19. **Dispersión bancaria real** de payouts (hoy el admin marca "pagado" y registra la
    referencia a mano; no hay API bancaria/ACH).
20. **Persistencia de ubicación** histórica y reanudación robusta de WS (reconexión
    depende del cliente).

---

## Roadmap sugerido (orden de impacto)

**Fase A — Confianza mínima para operar (P0):**
KYC + antecedentes (integración con proveedor) · anti-fraude básico (GPS/velocidad/
rate-limit por usuario) · chat in-app en viaje normal + llamada proxy · despacho real
de pedidos de negocio · calificación post-viaje cableada · soporte in-app (tickets).

**Fase B — Producto competitivo (P1):**
Ganancias del conductor desde backend · programar viaje · múltiples paradas · efectivo
y billetera del cliente · cupón en checkout · navegación turn-by-turn.

**Fase C — Escala y cumplimiento (P2):**
Multi-ciudad/geocercas · matching multi-instancia (Redis) · observabilidad (métricas/
tracing) · suite de pruebas · WhatsApp real · dispersión bancaria.

---

## Notas de honestidad (hallazgos al verificar)

- **Ganancias del conductor:** la pantalla usa `earningsBreakdownProvider` ←
  `tripHistoryProvider`, que es **local** (semilla demo); los providers `/earnings`
  cableados en una fase previa no los consume ninguna pantalla. → Pendiente real.
- **Pedidos de negocio:** el ciclo de entrega es simulado por temporizador, a diferencia
  de viajes y mandados que sí usan matching real.
- **SOS:** registra el evento y avisa al contacto de confianza por SMS, pero **no** avisa
  automáticamente a la policía (stub declarado en el código).
- Varias pantallas secundarias del conductor (calificaciones, incentivos, mapa de calor,
  documentos) son **UI con datos mock**; el dato real vive en el backend pero la pantalla
  no lo consume aún.
