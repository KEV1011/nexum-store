# Prontuario — lo que está verificado y NO se toca

> **Regla, puesta por el usuario el 2026-10-04:**
> **lo que está en este documento NO se modifica a menos que él lo indique.**
>
> No es «código bonito»: es código **con una prueba automática detrás** que ya
> se comprobó rompiéndola. Tocarlo «de paso», para dejarlo más limpio o para
> acomodar una función nueva, es la forma más rápida conocida de romper algo
> que funcionaba. Si una tanda nueva necesita cambiar algo de aquí, el paso
> previo es **decírselo al usuario y esperar su respuesta**, no decidirlo.

---

## Cómo leer esto

Una línea entra aquí solo si cumple las dos:

1. **Está cubierta** por una prueba unitaria o un E2E contra PostgreSQL real.
2. **Esa cobertura se comprobó rompiéndola**: se introdujo el fallo a mano y
   la prueba cayó. Una prueba que nunca se vio fallar no prueba nada — puede
   estar afirmando algo trivialmente cierto, y eso ya pasó aquí varias veces
   (ver «falsos positivos» abajo).

Lo que NO esté en esta lista no es necesariamente frágil; simplemente no tiene
esta garantía, y puede revisarse con normalidad.

---

## Estado medido (2026-10-04)

| | |
|---|---|
| Pruebas del backend | **1195** en 99 archivos |
| Guiones E2E contra PostgreSQL real | **54** |
| `tsc --noEmit` backend y raíz | limpio |
| `next build` del portal | verde |
| Checks obligatorios en CI | los tres en verde |

---

## 1. Reservas de taxi — VERIFICADO DE PUNTA A PUNTA

**Auditado el 2026-10-04 a raíz del reporte «al conductor no le sale nada de
las reservas de taxi». No se encontró ningún defecto en el código.** Se
revisaron las tres superficies y se probó la cadena completa por HTTP.

Cubierto por `e2e/reserva-llega-al-conductor.ts` (**17 comprobaciones**), que
NO siembra viajes en la base: el pasajero reserva por `POST
/client/trips/request` como lo haría su teléfono y el conductor mira su
tablero por `GET /driver/reservas`.

Lo que queda congelado:

- El pasajero reserva y el viaje nace `SCHEDULED`, sin conductor y con el
  servicio sellado (`TAXI`).
- Al conductor **le sale** en su tablero, con su hora.
- Le queda **constancia del aviso** (`reservaAviso`, resultado `enviado`).
- La aparta, queda sellada a su nombre y pasa a «mis reservas».
- Apartada, **ya no se le ofrece a otro** taxista.
- Una reserva de taxi **no le sale a un motociclista**, y al taxista sí
  (control: distingue «filtra bien» de «el tablero está roto para todos»).

Y dentro de eso, tres reglas que son la razón de que funcione:

- **El filtro de plaza excluye lo ajeno, nunca lo que falta**
  (`OR: [{citySlug}, {citySlug: null}]` en `listarReservasLibres`). Con
  igualdad estricta, un viaje sin plaza desaparecía para todo conductor que sí
  la tuviera, y el tablero quedaba en blanco sin un solo mensaje.
- **`tiposVehiculoParaServicio` es la inversa exacta de
  `serviciosQuePuedeTomar`** — la misma regla leída en las dos direcciones.
  Si cada una tuviera su tabla, se avisaría de reservas que el tablero no
  muestra. Lo vigila `reservas-coherencia.test.ts`.
- **Apartar es atómico** (`driverId: null` en el `where` del `updateMany`).

También cubierto: `e2e/reservas-taxi.ts` (tope por conductor, liberación por
incumplimiento, documentos vencidos), `e2e/recordatorio-reserva.ts` (el aviso
de 30 minutos, una sola vez) y `e2e/aviso-de-reserva.ts`.

> **Si vuelve a reportarse que el tablero sale vacío**, el código ya está
> descartado: es el entorno. En orden de probabilidad, con cómo comprobarlo:
>
> 1. **El APK del conductor es viejo.** Las reservas entraron en el **build
>    #439** (2026-09-15); el último de `main` es el **#476**. El número lo
>    enseña el cajón lateral de la app: «v1.0.0 · build N». Por debajo de 439
>    la función no existe en ese teléfono. *Esta confusión ya ocurrió antes con
>    el nombre «Nexum Conductor» en el arranque.*
> 2. **Render no ha redesplegado.** `/health` enseña el `commit`.
> 3. **El pasajero no usó «Programar para más tarde».** Un viaje sin
>    `scheduledFor` nace `SEARCHING` y va al despacho normal: nunca aparece en
>    el tablero, y es correcto que no aparezca.

**Cabo suelto conocido, NO corregido a propósito** (es cosmético y la pantalla
sí lo dice): `ReservasPanelCard` muestra «Sin reservas por ahora» aunque el
motivo real sea «registra tu vehículo». El `aviso` que devuelve la ruta se usa
en la pantalla pero no en la tarjeta del home.

---

## 2. Dinero — lo que nunca se toca sin avisar

| Qué | Dónde | Por qué está congelado |
|---|---|---|
| El precio lo calcula **el servidor**, el del teléfono se descarta | `trip-options.service`, `lib/fare.ts` | Probado: una petición pidiendo una carrera de $1 se guardaba como $1 |
| Tarifa de taxi = **Decreto 049/2023 de Pamplona**, sin surge | `lib/tarifa-decreto.ts` (23 pruebas) | Subir una tarifa regulada es cobrar por encima de lo autorizado |
| Comisión **flota → ciudad → global**, sellada al liquidar | `lib/comision.ts` | Renegociar mañana no puede reescribir lo que se pagó ayer |
| Solo se le debe al conductor **lo que la plataforma recaudó** | `lib/saldo-conductor.ts` (17 pruebas) | El signo estaba invertido: un taxista de solo efectivo veía $255.000 «disponibles» |
| El saldo de una cuenta de cobro **se deriva, no se guarda** | `lib/cobro-balance.ts` | Un saldo guardado y unos pagos guardados acaban discrepando |
| El precio del pedido sale **de la base**, no del carrito | `placeClientOrder` | |
| Un cupón de pasaje **lo asume la empresa**, no ZIPA | `lib/cupon-pasaje.ts` | Por la app no pasa un peso de ese pasaje |

---

## 3. Seguridad — tocar esto exige avisar primero

- **El panel admin falla CERRADO**: `router.use` sobre todo menos tres rutas
  públicas. Vigilado por `admin-auth.test.ts`. **No volver a la lista de
  prefijos**: con ella, toda ruta nueva nacía pública, y una dejó a cualquiera
  fijar la comisión de una plaza.
- **El webhook de WhatsApp valida la firma y falla cerrado** sin
  `WHATSAPP_APP_SECRET`. Sin esa guarda, una petición falsificada crea la
  cuenta y emite enlaces para un teléfono ajeno (comprobado quitándola).
- **Las funciones que emiten sesión sin OTP** no pueden aparecer en
  `src/routes/`. Lo vigila `enlace-magico-alcance.test.ts`.
- **Las suscripciones WS comprueban propiedad** (`_puedeSuscribirse`).
- **El PIN de entrega** solo viaja en la creación y en las vistas propias del
  cliente, nunca en el DTO compartido con el conductor.

---

## 4. Guardas que existen para impedir una regresión concreta

Cada una nació de un fallo real que llegó a producción. **No se desactivan ni
se «simplifican».**

| Guarda | Impide |
|---|---|
| `admin-panel.test.ts` | El panel es HTML dentro de una cadena de TS: ni `tsc` ni el linter lo miran. Hay que EJECUTARLO |
| `migraciones.test.ts` | Salida de herramientas dentro de un `.sql` — así se rompió producción una vez |
| `dockerfiles.test.ts` | Hay **dos** Dockerfiles y solo `/Dockerfile` despliega |
| `copywith_completo_test.dart` (las 2 apps) | Un campo olvidado en `copyWith` — así se perdía el PIN del envío |
| `moneda-portal.test.ts` | El formateador de pesos llegó a estar copiado en 18 sitios, con 2 formatos |
| `fuentes-portal.test.ts` | Volver a `next/font/google` hace que un tropiezo de red de Google tumbe un despliegue |
| `estado-pedido.test.ts` | Lee el enum de Dart y comprueba que los dos lados coincidan |
| `zipa_icon_test` / `sin_emojis_test` | Emojis renderizados; en muchos Android la bandera sale como un recuadro |
| `google-services.test.ts` | El `applicationId` vive en dos sitios que deben decir lo mismo |
| `pedido-eventos.test.ts` | La bitácora del pedido tiene UNA puerta |

---

## 5. Falsos positivos ya pagados — método, no código

Esto no se «arregla»: se recuerda. Son formas de escribir una prueba que pasa
sin probar nada.

- **La concurrencia no se prueba llamando dos veces seguidas.** Entre las dos
  llamadas hay tiempo de sobra para que la segunda vea la escritura de la
  primera. Hay que lanzar **cuatro a la vez** con `Promise.all` /
  `allSettled`; sin la guarda atómica ganan las cuatro.
- **Una contraprueba con lista vacía no prueba nada.** «No le llega la oferta»
  pasa igual si no hay ofertas: hay que exigir además que HAYA alguna.
- **Comprobar un estado que no cambia en ninguno de los dos casos.** Un pedido
  sin conductor cerca se queda en `PREPARING` con la guarda y sin ella.
- **Bloquear por `/etc/hosts` no bloquea tráfico que va por un proxy**: el
  proxy resuelve DNS por su cuenta. Hace falta un **control** que demuestre
  que el bloqueo funciona.
- **`e2e/` no entra en el `typecheck`** (el tsconfig solo incluye `src/`): un
  nombre de columna o un argumento invertido no lo caza el compilador.
- **Cuando un E2E falla raro justo después de otro que reventó**, limpiar los
  huérfanos de la base antes de creerse el fallo.

---

## 6. Lo que NO está en este prontuario

Sigue siendo trabajo normal, sin congelar:

- **QA visual en teléfono** de todo lo reciente (ilustración de Tiendas, la
  rejilla de cinco puertas, la lupa de la barra, los marcadores de paradas).
  Nada de eso se ha visto en una pantalla real.
- **Configuración de producción del usuario**: `CARTA_OCR_PROVIDER` + Cloud
  Vision, Twilio (hoy un código fijo abre cualquier teléfono, `/admin`
  incluido), dominio propio, publicar la versión nueva de la política legal.
- Las piezas marcadas como PENDIENTE en `CLAUDE.md`.
