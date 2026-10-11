# Prompt — los siete reportes del 11 de octubre

Cada punto está MEDIDO contra el código antes de escribir esto: no hay suposiciones,
y cada uno dice el archivo y la línea. **No se toca nada de lo que ya funciona**: los
siete son o una capacidad construida que nadie puede alcanzar, o un defecto concreto
y acotado.

Orden recomendado: **5 → 1 → 3 → 7 → 4 → 6**. El 5 es el que destruye catálogos, el 1
es el que ya está construido y solo hay que abrirle la puerta, y el 6 es cosmético.

Verificación de cada tanda: `cd backend` → `npm run typecheck` y `npm test`; raíz →
`node_modules/.bin/tsc --noEmit` y `node_modules/.bin/next build`. Flutter solo en CI.
Con pipes, `set -o pipefail`.

---

## 1. La carta por foto convierte los platos en secciones y los precios en productos

**ES EL MÁS GRAVE Y ESTÁ REPRODUCIDO.** No es que «no detecte el menú»: detecta mal el
layout más común de una carta impresa, el de dos renglones (nombre arriba, precio
debajo).

```
parsearCarta('ASADOS\nCarne asada\n21.000\nCostilla de cerdo BBQ\n23.000')
→ secciones: ['Asados', 'Carne asada', 'Costilla de cerdo BBQ']
→ producto "21.000" sin precio, producto "23.000" sin precio
```

Es exactamente la captura del catálogo del usuario: secciones llamadas «Carne asada» y
«Costilla de cerdo BBQ», y un producto llamado «$23.000». **El plato desaparece y su
precio ocupa su lugar.**

La causa, en `backend/src/lib/carta-foto.ts`: una línea sin precio y corta se toma por
sección (`pareceSeccion`), y la línea siguiente —que solo trae el número— cae en la
rama `!nombre || nombre.length < 2` y se emite con la línea cruda como nombre.

**Qué hacer:** antes de clasificar, **unir la línea que solo contiene un precio con la
línea de texto inmediatamente anterior** cuando esa anterior no tiene precio propio.
Es una pasada previa sobre los renglones, no un parche dentro del bucle.

Las condiciones que la hacen segura, y que van probadas una por una:

- Solo se une si la línea de precio **no tiene nada más** que el número (y su `$`): si
  trae texto, es un plato completo y se queda como está.
- Solo se une si la anterior **no tiene precio**: si ya lo tiene, son dos platos.
- **No se une a través de un encabezado reconocido por su TAMAÑO** (con geometría) ni
  si la anterior va gritada y suena a sección del vocabulario («BEBIDAS» seguido de un
  precio suelto no es «BEBIDAS: 3.000»). Ante la duda, NO unir: el peor caso al no unir
  es una fila con aviso que el dueño corrige; el peor caso al unir de más es un
  encabezado convertido en producto, con precio, publicado.
- Con geometría, **no se une si los dos renglones están en columnas distintas**.
- Nunca se une más de una línea de precio a la misma línea de texto.

Y el segundo defecto del mismo flujo: **`applyProductImport` escribe con
`prisma.product.create({ name: n.nombre, category: n.seccion })` directo**
(`business.service.ts`, dentro de `applyProductImport`), saltándose `nombreDeProducto`
y `limpiarTextoDeCarta` que SÍ aplica `createBusinessProduct`. Por eso las viñetas del
papel llegan al catálogo. Hay que pasar el nombre y la sección por el limpiador en ese
camino también.

Medido: `limpiarTextoDeCarta` sí quita `⬤` (U+2B24) pero **no quita `●` (U+25CF)** ni
nada del bloque Geometric Shapes (25A0–25FF), que es justo de donde salen las viñetas
de una carta. Añadir ese bloque — **comprobando antes que no se lleve por delante nada
legítimo**: ahí viven `▪ ▫ ◆ ○ ●` pero también caracteres que nadie usa en un nombre de
plato. Verificar con una prueba que «Café ½ libra» y «Pollo 1/4» sobreviven intactos.

Pruebas: ampliar `carta-foto.test.ts` con el caso de dos renglones (que es el que
reproduce el reporte) y los cuatro rechazos de la unión. **Comprobar la regla
rompiéndola**: sin la pasada previa, el caso de dos renglones vuelve a dar sección +
producto-precio.

---

## 2. El chat no existe en pedidos ni mandados, y el backend ya lo soporta

Medido: `trip-chat.service.ts` → `_assertParticipant` autoriza **Trip, Errand U ORDER**
(líneas 57–77), y las rutas `GET /{client,driver}/trips/:id/chat` y
`POST …/chat/photo` funcionan con cualquiera de los tres ids. La capacidad está
construida, probada y desplegada.

Lo que falta es la puerta:

- **Conductor** — `active_trip_screen.dart:1112` la cierra a propósito:
  `if (!trip.request.isOrder && !trip.request.isErrand)`, con un comentario que dice
  «pedidos/mandados no usan el chat de viaje». Eso dejó de ser cierto cuando se
  arregló `_assertParticipant`. **Quitar la condición** y pasar el id correcto
  (`orderId`/`errandId` cuando corresponda, que es el que el backend resuelve).
- **Cliente** — el botón solo vive en `transport_tracking_screen.dart:1840` (viaje
  urbano). `order_tracking_screen.dart` no lo tiene. **Añadirlo ahí**, con el mismo
  `TripChatScreen` y el `orderId`, y **solo cuando ya hay repartidor asignado**: un
  chat sin nadie al otro lado es peor que ningún botón.

El envío de fotos **no es un defecto aparte**: `trip_chat_screen.dart:154` ya sube a
`/chat/photo`. Sin chat no hay foto; con chat, la foto va incluida. Comprobarlo en el
pedido antes de darlo por bueno.

En el mandado, el nombre del interlocutor: el pedido guarda `driverName` y el negocio
su nombre — usar el que corresponda, nunca un «Conductor» genérico cuando el dato
existe.

---

## 3. La firma solo se puede trazar en horizontal

`delivery_proof_sheet.dart:598` — el lienzo es un `GestureDetector(onPanStart,
onPanUpdate)` **dentro de una hoja desplazable**. En Flutter el reconocedor de arrastre
vertical del padre gana la puja de la arena en cuanto el trazo es más vertical que
horizontal: el dedo desplaza la hoja en vez de pintar. Se firma en horizontal y no en
vertical — literalmente «no funciona en todo el parámetro».

**Qué hacer:** un `RawGestureDetector` con un reconocedor que **gane la arena en el
pointer-down**:

```dart
class _FirmaRecognizer extends PanGestureRecognizer {
  @override
  void addAllowedPointer(PointerDownEvent event) {
    super.addAllowedPointer(event);
    resolve(GestureDisposition.accepted);
  }
}
```

No combinar `onPan*` con `onVerticalDrag*` en el mismo `GestureDetector`: Flutter lanza
una aserción.

**Segunda mitad, decisión de producto:** hoy el botón «Confirmar entrega» se habilita
con `foto || firma`, así que se cierra una entrega sin firma aunque el panel diga «El
destinatario firma directamente en pantalla». Si la firma es la prueba que se reclama,
**exigirla para pedidos y paquetes** (y decir qué falta en el botón apagado, no dejarlo
mudo). Si no, cambiar el texto para que no prometa lo que no exige. Lo que no puede
quedarse es la contradicción.

**QA del usuario:** el trazo solo se juzga con un dedo en un teléfono. Decírselo.

---

## 4. El portal recorta el botón de eliminar en el celular

`app/negocio/[token]/catalogo/page.tsx:546` — la fila de acciones es
`flex items-center justify-between` con **cinco controles a la derecha** (Opciones,
subir, bajar, editar, eliminar) más la píldora Disponible a la izquierda, dentro de una
tarjeta que ya cede 96 px a la foto. A 360–390 px no cabe y el último se sale: es el
icono de basura cortado de la captura.

Además esos botones son `p-1` sobre un icono de 16 px ≈ **24 px de objetivo táctil**,
cuando `app/ui.ts` exige 44 (`BOTON.icono`) y documenta por qué: este portal se usa de
pie, detrás de un mostrador y con una mano.

**Qué hacer:** que la fila **envuelva** (`flex-wrap` con `gap`) en vez de desbordar, y
subir los objetivos a los tokens del sistema. Si con 44 px los cinco no caben en una
fila de teléfono, mover subir/bajar a la vista de ordenar o dejarlos solo en escritorio
— pero **no encogerlos**, que es cómo se llegó aquí.

**Barrer el resto del portal con el mismo patrón** antes de dar el punto por cerrado:
cualquier `justify-between` con tres o más controles a un lado y sin `flex-wrap`, en
`app/negocio` y `app/carta`. Y dejarlo vigilado en `ui-portal-negocio.test.ts`, que ya
vigila ese sistema visual.

**OJO de método, ya pagado en este repo:** una regla que prohíba una clase de tamaño
(`p-1`, `w-4`) marca también el icono que va DENTRO de un botón correcto. Hay que
exigir el token en el botón, no prohibir la medida en el fuente.

---

## 5. El comensal de mesa no se entera de nada

`app/carta/[codigo]/page.tsx:87` sondea el estado cada 10 s y **no avisa de nada**:
cero `Notification`, cero sonido, cero `document.title`. El comensal guarda el teléfono;
cuando la cocina acepta con su tiempo, o cuando el plato sale, la página lo sabe y él
no. Por eso tampoco califica: el formulario de estrellas solo lo ve quien vuelve a
abrir la pantalla por su cuenta.

**El patrón ya existe en el repo**: `useOrderAlert`, el que avisa al negocio de un
pedido nuevo. Reusar su enfoque, **no copiarlo**, porque el destinatario es otro:

- **Un solo repique corto**, no la alarma de tres que lleva el portal: esto suena en la
  mesa de un restaurante, no en una cocina.
- Avisa en **dos** transiciones y no en cada cambio: cuando la cocina acepta y declara
  los minutos («tu pedido sale en ~20 min») y cuando se sirve. El resto es ruido.
- `Notification` solo con la pestaña oculta, y el permiso **se pide cuando el comensal
  envía el pedido**, no al abrir la carta: antes de pedir no hay nada que avisar y el
  diálogo en frío se rechaza.
- Si el `AudioContext` queda suspendido (iOS lo hace hasta el primer toque), el mismo
  botón de «Enviar a la cocina» sirve para desbloquearlo — ya se tocó.
- Al servirse, **llevar la calificación al frente** en vez de dejarla al final del
  scroll.

**Para el cliente de la APP esto NO es código:** los push de pedido existen
(`order_preparing`, `order_ready`, `order_accepted`, `order_in_transit`,
`order_delivered` en `client.service.ts`) y `push_routing.dart` los enruta a su
pantalla. No llegan porque **FCM no está operativo en producción** — es lo que
`/health` marca como `push: credenciales-invalidas`. Decírselo como configuración, no
tocar ese camino.

---

## 6. La foto del plato: dos cosas distintas, y una no es de código

**(a) El icono de imagen rota del portal** es el disco efímero de Render: sin
`S3_BUCKET` las fotos se pierden en cada despliegue y la URL queda apuntando a nada
(`/health` lo dice como `uploads: disco-efimero`). Eso se arregla con R2 siguiendo
`docs/ACTIVAR_S3_FCM.md`, no con código.

Lo que SÍ es nuestro: `app/negocio/[token]/catalogo/page.tsx:450` pinta
`<img src={img}>` **sin `onError`**, así que una foto caída sale como el icono roto del
navegador — que se lee como «el portal está roto», no como «falta la foto». El carrusel
de la app cliente ya recibió ese trato (foto caída → nombre del negocio). Hacer lo
mismo aquí y en `/carta`: respaldo con el nombre del plato, nunca un recuadro vacío.

**(b) El «mucho zoom» del menú QR** es `object-cover` en la hoja de detalle del plato
(`app/carta/[codigo]/page.tsx:933`, `max-h-56 w-full object-cover`): recorta la foto
para llenar el ancho, y una foto vertical de carta pierde medio plato. En el LISTADO
`object-cover` es correcto —miniaturas parejas— pero en el detalle, que es la única
pantalla donde el comensal quiere ver el plato entero, debe ser `object-contain` sobre
un fondo neutro, con alto fijo para que la hoja no salte de tamaño entre platos.

---

## Lo que NO se toca

- El despacho, la liquidación, las tarifas y todo lo listado en HECHO.
- `_assertParticipant` y las rutas de chat: ya están bien, el defecto es de UI.
- El `object-cover` del LISTADO de la carta y del carrusel: ahí es correcto.
- Los push del pedido en la app cliente: la cadena está completa, falta la llave.

## Reglas del repo que aplican a esta tanda

- Una capacidad construida sin puerta es código muerto: el punto 2 es exactamente eso.
- Cuando se corrige un dato inventado o mal formateado, **buscar el mismo defecto en la
  otra superficie** (la foto caída está en el portal Y en `/carta`; el chat falta en las
  DOS apps).
- Toda guarda nueva se comprueba **rompiéndola** y viendo caer exactamente su prueba.
- Sin Flutter local, los cambios de Dart se dan por buenos solo cuando el CI lo
  confirma; y lo que se juzga con un dedo (la firma) es QA del usuario, hay que decirlo.
