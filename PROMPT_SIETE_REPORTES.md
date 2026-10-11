# Prompt — los reportes del 11 de octubre

Cada punto está MEDIDO contra el código antes de escribir esto: no hay suposiciones,
y cada uno dice el archivo y la línea. **No se toca nada de lo que ya funciona**: los
siete son o una capacidad construida que nadie puede alcanzar, o un defecto concreto
y acotado.

Orden recomendado: **1 → 8 → 2 → 7 → 3 → 5 → 4 → 6**. El 1 destruye catálogos; el 8 es
una línea y evita que un dueño cargue su carta en el negocio equivocado; el 2 y el 7
son capacidades YA construidas a las que solo les falta la pantalla —o sea, lo más
barato por lo que más se nota—; el 6 es cosmético y en parte ni siquiera es código.

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

## 7. La hoja del producto IGNORA seis datos que el servidor ya le manda

Referencia del usuario: Rappi. Comparando su captura con la nuestra, la hoja de
producto de la app cliente es un título, un campo de notas, el contador y el botón.
Nada más.

**El hallazgo no es de diseño.** `ProductEntity`
(`business_entity.dart:212`) ya trae **todo**: `imageUrl`, `images` (galería),
`description`, `compareAtPrice`, `descuentoPct`, `masPedidoPuesto` y `optionGroups`.
`product_options_sheet.dart` (531 líneas) **solo consume `optionGroups`** — los otros
seis llegan del servidor en cada pedido de catálogo y la hoja no los pinta. Es el mismo
patrón ya pagado tres veces en este repo: el dato existe en la base, viaja en el DTO, y
la pantalla no lo lee.

La LISTA sí está bien y **no se toca**: `product_tile.dart:79` ya usa
`PrecioProducto` (tachado + insignia de descuento) y `business_detail_screen` ya ordena
por `descuentoPct`.

**Qué pintar en la hoja**, de arriba abajo:

1. **Foto del plato a lo ancho**, con la galería deslizable si `images` trae más de
   una. Es lo primero que mira quien pide comida.
2. **Insignia «#N más pedido»** cuando `masPedidoPuesto` existe.
3. **Precio grande, con el tachado y el `-N %`** reusando `PrecioProducto` en su
   variante `grande` — que ya existe y por eso el porcentaje del listado y el del
   detalle no pueden discrepar.
4. **Descripción completa**, con «Ver más / Ver menos» si pasa de tres renglones.
5. Los grupos de opciones como están hoy, pero **con la insignia «Obligatorio»** en los
   que lo son (el dato ya está en la entidad) y el botón apagado DICIENDO qué falta
   elegir, no mudo.
6. El contador y **«Agregar · $X» con el total ya calculado** (precio + opciones ×
   cantidad), que es lo que evita la sorpresa en el carrito.

**Las reglas de siempre, que aquí deciden casi todo:**

- **Sin foto NO se dibuja un marco gris grande.** La hoja arranca en el título y gana
  altura la descripción. Un rectángulo vacío de 200 px se lee como «la app no cargó»;
  es peor que no tener foto. Mismo criterio que el carrusel del home.
- Sin descuento no hay insignia, sin ranking no hay «#N», sin descripción no hay
  bloque. Nada de relleno.
- **Si el producto está agotado**, la hoja lo dice y el botón no deja agregar — hoy se
  entra igual.

**Lo de Rappi que NO se copia, y por qué:**

- **«Oferta Exclusiva Pro»**: es una suscripción con cobro recurrente. Ya se descartó
  en este repo y el motivo sigue vigente: no hay pasarela operativa en producción.
  Prometer un precio de socio que no se puede cobrar es la peor clase de promesa.
- **El «90 % (+339)» de pulgares**: nosotros tenemos estrellas por PEDIDO, no pulgares
  por producto. Inventar ese porcentaje a partir de la nota del negocio sería un número
  que no mide lo que dice.
- **«Tus opciones recomendadas»** (el upsell con otro producto): es una función aparte
  —y mal hecha engaña, porque en su propia captura la bebida «recomendada» cuesta más
  que el plato—. Si se quiere, va en su tanda, con la regla de que el precio mostrado
  sea el que se cobra.

**La cabecera del negocio** (segunda captura del usuario) también está desnutrida: el
bloque crema con el cubierto genérico es el respaldo de `Business.imageUrl` cuando no
hay portada, y encima el nombre «BETOS» queda casi ilegible sobre él. Dos cosas:
subir el contraste del nombre sobre el respaldo —es la co-ocurrencia que la regla de
contraste del repo prohíbe— y que el respaldo **no ocupe el mismo alto** que una
portada real; sin foto, la cabecera debe encogerse y dejar sitio a la carta.

**QA del usuario:** proporciones, altura de la foto y si la hoja tapa demasiado solo se
juzgan en un teléfono.

---

## 8. Dos negocios con el mismo nombre en la lista

En la captura del listado aparecen **«BETOS» dos veces y «Pieros Pizza» dos veces**.

Medido: `registerBusiness` hace `prisma.business.create` **sin comprobar nada antes** —
ni nombre repetido, ni teléfono repetido. `/business/register` es público, y en un
celular con mala señal el segundo toque en «Registrar» (o un reintento) crea un segundo
negocio con **otro enlace mágico**.

El daño no es cosmético: el dueño carga su catálogo en uno y los clientes piden en el
otro, que está vacío; y la recuperación por teléfono le devuelve dos enlaces sin poder
decirle cuál es el bueno.

**Qué hacer:** antes de crear, buscar un negocio del mismo teléfono normalizado con
nombre equivalente (sin tildes, sin mayúsculas, sin espacios de más — la misma
normalización que ya usa `findBusinessesByPhone`). Si existe, **no crear otro**:
devolver el que ya está con su enlace, diciendo «ya tenías este negocio registrado».
Reutilizar en vez de rechazar, porque quien pulsó dos veces quiere su portal, no un
error.

**No se borran los duplicados que ya están en producción desde el código**: eso es una
limpieza del admin, que ya tiene la pestaña Negocios para activar y desactivar. Decirle
al usuario cuáles son y que desactive el vacío.

---

## Lo que NO se toca

- El despacho, la liquidación, las tarifas y todo lo listado en HECHO.
- `_assertParticipant` y las rutas de chat: ya están bien, el defecto es de UI.
- El `object-cover` del LISTADO de la carta y del carrusel: ahí es correcto.
- `product_tile.dart` y `PrecioProducto`: el listado del negocio ya pinta el tachado y
  el porcentaje. Lo que falta es la HOJA.
- Los push del pedido en la app cliente: la cadena está completa, falta la llave.

## Reglas del repo que aplican a esta tanda

- Una capacidad construida sin puerta es código muerto: el punto 2 es exactamente eso.
- Cuando se corrige un dato inventado o mal formateado, **buscar el mismo defecto en la
  otra superficie** (la foto caída está en el portal Y en `/carta`; el chat falta en las
  DOS apps).
- Toda guarda nueva se comprueba **rompiéndola** y viendo caer exactamente su prueba.
- Sin Flutter local, los cambios de Dart se dan por buenos solo cuando el CI lo
  confirma; y lo que se juzga con un dedo (la firma) es QA del usuario, hay que decirlo.
