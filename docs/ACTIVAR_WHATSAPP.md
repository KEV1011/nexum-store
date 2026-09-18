# Activar la entrada por WhatsApp

Son **dos pasos** y ninguno exige escribir nada:

1. El pasajero le escribe cualquier cosa al número de ZIPA y recibe el **botón
   nativo de ubicación** de WhatsApp.
2. Lo toca, manda su ubicación, y recibe **un enlace** que lo mete a la app web
   ya autenticado y con el punto de recogida puesto. Solo le queda elegir a
   dónde va.

El código ya está listo y probado. Lo que falta es **configuración en Meta**, y
eso no lo puedo hacer yo. Esta guía es el orden exacto.

---

## 1. Por qué un enlace y no un chat que pregunta todo

Un chat conversacional para pedir un taxi son unos **siete mensajes salientes**
por carrera (menú, pedir ubicación, pedir destino, precio, buscando, conductor
asignado, llegó). Con el enlace son **dos**.

El botón de ubicación es lo que hace que dos pasos basten: resuelve la parte
cara del formulario —escribir una dirección en un teclado, que es lo que más
gente abandona— sin gastar una conversación entera en preguntas.

Eso importa por dinero y por producto:

| | Chat completo | Enlace |
|---|---|---|
| Mensajes salientes por viaje | ~7 | 2 |
| Viajes dentro de los 1.000 gratis al mes | ~140 | **500** |
| El pasajero ve el mapa y al conductor | No | Sí |
| Botón de emergencia y chat con el conductor | No | Sí |

---

## 2. Lo que cuesta

Desde el **1 de octubre de 2026** Meta cobra los mensajes de servicio (los que
responde el negocio dentro de las 24 h desde que el usuario escribió) **pasados
los 1.000 gratis al mes por número**. Los mensajes que escribe el pasajero no
cuestan nunca.

Colombia tiene una de las tarifas más bajas del mundo: alrededor de
**0,0008–0,001 USD** por mensaje. Con dos mensajes por viaje:

- Los primeros ~500 viajes del mes: **gratis**.
- Después: unos **8 pesos por viaje**.

Contra una carrera de 6.000 pesos con 15 % de comisión (900 pesos), es
irrelevante. **El riesgo de costo nunca estuvo aquí** — estaba en poner un
modelo de lenguaje a responder cada mensaje, que es lo que NO se hizo.

> **⚠ Antes del 30 de septiembre de 2026 hay que cargar un medio de pago en
> Meta.** Sin él, a partir del 1 de octubre dejan de entregarse los mensajes de
> servicio **aunque estés por debajo de los 1.000 gratis**. No es que vayan a
> cobrar de inmediato: es el requisito para que sigan saliendo.

---

## 3. Lo que hay que hacer en Meta (una vez)

1. **Meta Business Manager** → verificar el negocio (cámara de comercio / RUT).
   Es el trámite más largo: cuenta días, no horas.
2. Crear una **app** de tipo *Business* y añadirle el producto **WhatsApp**.
3. Registrar un **número dedicado**. No puede ser un número que ya esté usando
   la app normal de WhatsApp ni WhatsApp Business. Sirve una línea fija o una
   SIM prepago; no hay cuota mensual de Meta por el número.
4. Anotar de la app:
   - **Phone number ID** (el del número, no el de la cuenta).
   - **Token de acceso permanente** (el token de prueba caduca en 24 h — hay que
     crear un usuario de sistema y generarle uno permanente).
   - **App Secret** (Configuración → Básica).

### 3 bis. Para probar YA, sin quemar ningún número

Nada de lo anterior hace falta para una primera prueba. Meta da un **número de
prueba gratuito** con un token temporal (24 h) y hasta **5 destinatarios
verificados**, y basta una *Test Business Account*: sin verificación de negocio
y sin costo.

1. App de tipo *Business* → añadir **WhatsApp** → elegir *Test Business Account*.
2. En «API Setup» aparecen el **Phone number ID** del número de prueba y el
   **token temporal**.
3. En el campo **«To»**, agregar tu teléfono y confirmar el código. Ese es el que
   usarás como pasajero.
4. Seguir con los pasos 4 y 5 de abajo, poniendo esos dos valores.

> **⚠ NO registres como emisor un número que ya uses en la app de WhatsApp
> Business.** Migrarlo a la Cloud API **borra su historial de chats** y lo deja
> inutilizable en la app hasta darlo de baja; y si alguna vez estuvo con otro
> proveedor, el enfriamiento puede ser de **semanas**. Para producción, consigue
> una línea aparte (fija o SIM prepago).

## 4. Variables en Render (servicio `nexum-api`)

| Variable | Qué es |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | El Phone number ID del paso 3 |
| `WHATSAPP_ACCESS_TOKEN` | El token permanente |
| `WHATSAPP_APP_SECRET` | El App Secret — **con esto se valida la firma** |
| `WHATSAPP_VERIFY_TOKEN` | Una cadena que te inventas tú (la misma va en el paso 5) |
| `CLIENT_WEB_URL` | Raíz de la app web del cliente. Por defecto `https://kev1011.github.io/nexum-store/cliente` |

Opcional: `WHATSAPP_GRAPH_VERSION` (por defecto `v21.0`).

> `WHATSAPP_APP_SECRET` no es opcional. Sin él el webhook **se niega a
> funcionar** y responde 503, a propósito: sin poder comprobar la firma,
> cualquiera podría mandar un POST diciendo «este mensaje viene del
> +57300…» y llevarse la sesión de esa persona.

## 5. Conectar el webhook

En la app de Meta → WhatsApp → Configuración → Webhooks:

- **URL de devolución de llamada:** `https://nexum-api-trxr.onrender.com/webhooks/whatsapp`
- **Token de verificación:** el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
- Suscribirse al campo **`messages`** (solo ese; los demás son ruido que
  igualmente se descarta, pero no tiene sentido recibirlo).

Meta llama una vez a esa URL para comprobar el token. Si la respuesta es 403,
el token no coincide.

## 6. Comprobar que quedó bien

Abre `https://nexum-api-trxr.onrender.com/health` y mira el campo `whatsapp`:

| Valor | Qué significa |
|---|---|
| `apagado` | No hay ninguna variable puesta |
| `configuracion-incompleta` | Puede recibir pero no mandar (o al revés). **Este es el error fácil**: el canal se ve muerto sin que aparezca ningún error en los registros |
| `cloud-api` | Listo |

Después, la prueba de verdad: escríbele «hola» al número desde tu teléfono.

1. Debe llegarte un mensaje con un botón **«Enviar ubicación»**.
2. Al tocarlo, WhatsApp abre su pantalla de compartir ubicación. Mándala.
3. Debe llegarte un enlace que, al tocarlo, te deje dentro de la app web con tu
   cuenta **y con la recogida ya puesta**.

---

## 7. Cómo se comporta

- **El teléfono lo verifica Meta**, así que no se pide código. Por eso la firma
  del webhook es toda la seguridad: se valida antes de mirar el contenido.
- **El enlace vale una sola vez y quince minutos.** El código viaja detrás del
  `#` de la URL, que no se manda al servidor — ni el hosting ni el robot que
  arma la vista previa del chat llegan a verlo.
- **Quien ya escribió y no usó su enlace recibe el mismo**, no uno nuevo. Pero
  si manda una ubicación NUEVA, el punto de recogida de ese enlace **se
  actualiza**: si no, el taxi iría a donde estuvo, no a donde está.
- **Quien no quiere mandar su ubicación no se queda encerrado.** Si vuelve a
  escribir texto después de que se la pedimos, recibe el enlace igual y escribe
  la dirección en la app, que tiene buscador y mapa.
- **Un punto donde ZIPA no opera se responde diciéndolo**, sin mandar enlace:
  entrar a la app para descubrir que no hay nadie es peor que saberlo en el
  chat, y nos ahorra el mensaje. Si la tabla de municipios estuviera vacía no se
  bloquea a nadie — un problema nuestro no puede parecer «no damos servicio».
- **Máximo 20 mensajes salientes por teléfono cada 24 horas** (son 10 carreras:
  el botón y el enlace cuentan los dos). Quien escriba en bucle deja de recibir:
  sin ese tope, una persona sola se gasta el presupuesto de mensajes de toda la
  operación.
- **Solo números colombianos.** A un número extranjero no se le responde y no se
  le abre cuenta: normalizarlo a `+57` crearía una cuenta con un teléfono que no
  existe, y operando en la frontera eso pasaría a diario.
- **No se responde a mensajes de más de 10 minutos.** Tras una caída, Meta
  entrega de golpe la cola acumulada; contestarle «aquí tienes tu taxi» a quien
  lo pidió hace tres horas es peor que callarse.
- Un mensaje repetido por un reintento de Meta **no manda un segundo enlace**.

## 8. Diagnóstico cuando alguien dice «escribí y no me llegó nada»

La tabla `whatsapp_inbound` guarda por qué. El campo `outcome` dice:

| Valor | Lectura |
|---|---|
| `respondido:ubicacion-pedida` | Salió el botón de ubicación (paso 1) |
| `respondido` | Salió el enlace (paso 2) |
| `respondido:fuera-de-cobertura` | Mandó un punto donde no operamos |
| `…:sin-salir` | Se decidió bien pero Meta rechazó el envío — mirar los registros de Render |
| `ignorado:mensaje-viejo:Nmin` | Llegó tarde |
| `ignorado:tope-diario:N` | Ese teléfono ya agotó sus 20 del día |
| `procesando` | Se quedó a medias (el servidor se reinició en mitad) |

Si no hay **ninguna fila** para ese teléfono: o el mensaje nunca llegó al
webhook (revisar la suscripción en Meta), o el número no es colombiano.
