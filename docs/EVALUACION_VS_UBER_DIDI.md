# Evaluación de Nexum vs Uber / DiDi / inDrive / Rappi

Inventario contrastado de las 3 superficies (app cliente, app conductor, backend +
portales web) con madurez **real / parcial / falta**, hecho leyendo el código.
Actualizado tras las tandas 1–40 (matching real de todos los servicios, liquidaciones
reales, modelo de carga completo, Nexum Pro, dark mode, mapa de fletes, manifiesto de
operador).

## Veredicto

Nexum ya NO es un MVP de happy-path: es una **plataforma multi-servicio funcional de
punta a punta** para una ciudad/región. El núcleo real incluye viajes urbanos, mandados,
pedidos a negocios, **intermunicipal** (pooled + negociación) y **carga/fletes**
(turbo/camión/mula) — todos con matching geoespacial real, liquidación con comisión,
billetera/retiros y push. Lo que falta para "competirle a las grandes" ya no es el
flujo básico, sino tres capas: **(1) confianza/seguridad legal (KYC real, seguro,
antifraude)**, **(2) pulido de producto competitivo (agendar, paradas, pagos completos
en la UI, recibos)** y **(3) escala/observabilidad/cumplimiento**.

Paridad estimada (actualizada):
- Transporte urbano **~80 %**
- Delivery/pedidos/mandados **~82 %**
- Intermunicipal **~92 %** (diferenciador propio, sin equivalente en Uber/DiDi)
- Carga/fletes **~78 %** (diferenciador propio; Uber/DiDi no lo hacen)
- Confianza/seguridad/legal **~40 %** ← el verdadero cuello de botella
- Operación/escala/observabilidad **~40 %**

---

## Diferenciadores que Nexum YA tiene y las grandes NO (fortalezas)

| Diferenciador | Estado |
|---|---|
| **Intermunicipal** con empresas habilitadas: pooled (cupos) + negociación de tarifa con contraoferta | ✅ real |
| **Marketplace de carga/fletes** (turbo/camión/mula, urbano e intermunicipal, comisión, panel financiero) | ✅ real |
| **Conductor unificado**: un mismo conductor recibe viajes, mandados, envíos, pedidos y fletes | ✅ real |
| **"Pon tu precio"** estilo inDrive (negociación con pujas y chat) | ✅ real (en memoria) |
| **Portal de empresas/flotas** (B2B): registro, verificación, afiliación, rutas, salidas programadas, manifiesto de pasajeros, panel financiero | ✅ real |
| **Portal de negocios** (comercios): catálogo con fotos, portada, pedidos, prueba de entrega | ✅ real |
| **Prueba de custodia** (foto recogida/entrega) visible a cliente y negocio | ✅ real |
| **Nexum Pro**: niveles de fidelidad del conductor con datos reales | ✅ real |

---

## Lo que YA iguala a Uber/DiDi (real, verificado)

| Capacidad | Estado |
|---|---|
| Login OTP/SMS cliente y conductor (Twilio Verify o código dev) | ✅ real |
| Matching geoespacial PostGIS (ST_DWithin, oferta secuencial, frescura GPS, fallback sin conductores) | ✅ real |
| Matching de **todos** los servicios (viaje/mandado/envío/**pedido**/intermunicipal/flete) | ✅ real |
| Preferencias de servicio del conductor (filtran candidatos) | ✅ real |
| Tarifa dinámica / surge por zona | ✅ real |
| Estimación de tarifa antes de pedir | ✅ real |
| Seguimiento en vivo (mapa flutter_map/OSM + WebSocket, polling REST de respaldo) | ✅ real |
| Pagos con tarjeta **Wompi** (sandbox/prod, webhook, secreto de integridad) | ✅ real (backend) |
| Propinas 100 % al conductor | ✅ real |
| **Liquidación real** de cada servicio (finalFare/netEarning/comisión → wallet) | ✅ real |
| Billetera y retiros del conductor (saldo, solicitud, aprobación admin) | ✅ real |
| **Ganancias del conductor desde el backend** (/earnings/history, sin semilla local) | ✅ real |
| Perfil real de conductor y cliente + foto (multipart web-safe) | ✅ real |
| Push FCM en todos los servicios (oferta, aceptación, estados, flete) | ✅ real (código; requiere llaves en prod) |
| Seguridad: SOS, contacto de confianza, compartir viaje, **teléfono enmascarado** | ✅ real (SOS no avisa a policía — stub declarado) |
| Verificación de documentos + panel admin (aprobar/rechazar, docs, conductores, empresas, rutas, SOS, promos, payouts, diagnóstico de matching) | ✅ real |
| Navegación al destino: el conductor abre **Google/Waze/Maps.me** (selector en ajustes) | ✅ real (nav externa, como inDrive) |
| Promos / cupones / referidos | ✅ real (backend) |
| Modo oscuro | ✅ en pulido (iterativo por dispositivo) |

---

## Brechas vs las grandes (por prioridad, estado actual)

### P0 — Confianza, seguridad y legalidad (bloquean un lanzamiento serio)

1. **KYC / antecedentes reales.** Hoy solo se suben fotos de documentos y el admin las
   aprueba a ojo. Falta: validación de cédula/licencia contra RUNT/Registraduría,
   antecedentes penales, **selfie/liveness** contra la foto del documento. Es el pilar de
   seguridad y lo primero que exige un operador serio.
2. **Seguro por viaje / cobertura legal.** Uber/DiDi incluyen seguro de accidentes por
   viaje (requisito de facto para operar formalmente). No existe.
3. **Antifraude y abuso.** Sin detección de GPS falso, velocidad imposible, cuentas
   múltiples, patrones de cancelación, ni límites por usuario. Un límite de intentos OTP
   ya existe; falta el resto.
4. **Chat in-app + llamada por número proxy en viaje NORMAL.** El teléfono se enmascara y
   se puede llamar por `tel:`, pero el chat real solo existe en la negociación de ride, no
   en un viaje/pedido normal (la UI dice "comunícate por el chat" pero ese canal no está
   cableado fuera de ride-negotiation). Riesgo de privacidad y de operación.
5. **Soporte in-app real (tickets).** Hoy es estado vacío/placeholder. Sin canal de soporte
   no hay operación seria ni retención.

### P1 — Paridad de producto competitiva

6. **Programar viajes** y **múltiples paradas (A→B→C).** No existen en urbano (intermunicipal
   sí tiene salidas programadas vía pooled). Uber/DiDi/Rappi los tienen.
7. **Métodos de pago completos en la UI del cliente.** El backend soporta Wompi
   (tarjeta/PSE/Nequi) pero la app no expone el checkout con esos métodos ni la **billetera
   del cliente** (saldo) ni la lógica de **efectivo**. Hoy el cobro real al pasajero no está
   cerrado en la app.
8. **Aplicar cupón en el checkout** (el backend valida cupones; falta el campo en la UI).
9. **Recibos descargables (PDF) / facturación electrónica** (DIAN). No existen.
10. **Lugares recientes y favoritos sincronizados** (hoy favoritos son locales del dispositivo).
11. **Calificación post-viaje urbana** completamente cableada en ambas apps (intermunicipal ya
    tiene endpoint de rating; urbano es parcial).
12. **Chat/soporte con foto y estados de pedido más ricos** (ETA dinámico del repartidor, etc.).

### P2 — Escala, calidad y cumplimiento

13. **Multi-ciudad / geocercas.** Coordenadas de Pamplona *hardcoded*; falta modelo de
    zonas/ciudades y geofencing para expandir.
14. **Escalabilidad multi-instancia.** Redis reparte entregas (bus), pero el estado de
    matching y suscripciones es por instancia — hoy un solo proceso real.
15. **Observabilidad.** Hay logging (Pino) y Sentry opcional; faltan métricas (Prometheus),
    tracing y health checks de negocio (más allá de `/health`).
16. **Pruebas.** Cobertura mínima (backend ~9 unit + tests Flutter básicos). Falta
    integración/e2e de matching, pagos y WebSocket.
17. **Dispersión bancaria real** de payouts (hoy el admin marca "pagado" a mano; sin API
    bancaria/ACH).
18. **WhatsApp real** a negocios/cliente (hoy stub/logs; falta integrar Meta/Twilio).
19. **S3/R2 y FCM en producción** (código listo y E2E-verificado; requiere config del usuario
    — ver `docs/ACTIVAR_S3_FCM.md`).

---

## Roadmap sugerido (orden de impacto para competir)

**Fase A — Confianza mínima para operar formalmente (P0):**
KYC + antecedentes (integrar proveedor: Truora/Metamap/RUNT) · seguro por viaje (alianza
aseguradora + registro por viaje) · antifraude básico (GPS/velocidad/cuentas/cancelaciones)
· chat in-app + llamada proxy en viaje normal · soporte in-app con tickets.

**Fase B — Producto competitivo (P1):**
Checkout de pago completo en la app (tarjeta/PSE/Nequi/efectivo/billetera del cliente) ·
cupón en checkout · programar viaje · múltiples paradas · calificación post-viaje urbana ·
recibos PDF · lugares recientes/favoritos sincronizados.

**Fase C — Escala y cumplimiento (P2):**
Multi-ciudad/geocercas · matching multi-instancia (Redis) · observabilidad (métricas/
tracing) · suite de pruebas e2e · dispersión bancaria · WhatsApp real · activar S3/R2+FCM.

---

## Notas de honestidad (hallazgos al verificar, estado actual)

- **Pagos:** el backend Wompi es real (webhook + integridad), pero el **checkout del cliente
  en la app no expone tarjeta/PSE/Nequi ni billetera** — cerrar el cobro al pasajero en la UI
  es P1 crítico.
- **Chat:** en viaje/pedido normal el canal real es teléfono enmascarado + `tel:`; el chat
  in-app solo vive en la negociación de ride.
- **SOS:** registra el evento y avisa al contacto de confianza por SMS, pero **no** avisa
  automáticamente a la policía (stub declarado).
- **Navegación:** el conductor abre una app externa (Google/Waze/Maps.me); no hay
  turn-by-turn embebido (aceptable — inDrive hace lo mismo).
- **KYC:** solo revisión manual de fotos por el admin; sin validación contra registros ni
  liveness. Es el gap #1 de seguridad.
- Lo que la versión anterior de este doc marcaba como "simulado" (despacho de pedidos,
  ganancias del conductor, liquidación de mandados) **ya es real** desde las tandas 4–11.
