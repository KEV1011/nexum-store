# Activar la entrada por WhatsApp

**El pedido se hace ENTERO dentro del chat.** El pasajero no necesita abrir
ninguna página ni descargar nada:

1. Le escribe cualquier cosa al número de ZIPA → recibe los **términos** con un
   botón «Acepto» (pedir un taxi es tratar sus datos; sin permiso no se opera).
2. Recibe el **botón nativo de ubicación** de WhatsApp → lo toca y manda su
   punto de recogida. Sin teclear una dirección.
3. Escribe **a dónde va** → el servidor mide el trayecto y le responde con el
   **precio** y dos botones: Confirmar o Cancelar.
4. Confirma → el viaje entra al despacho igual que si viniera de la app, y la
   solicitud **le suena al conductor en su teléfono**.
5. Los avisos (aceptado, llegó, terminado) le vuelven al mismo chat.

El enlace a la app web no desaparece: va ofrecido dentro de un mensaje que ya
salía («ver en el mapa»), porque en el chat no hay mapa ni botón de emergencia
y eso no se disimula. Pero es opcional.

El código ya está listo y probado. Lo que falta es **configuración en Meta**, y
eso no lo puedo hacer yo. Esta guía es el orden exacto.

---

## 1. Por qué la conversación completa y no solo un enlace

La primera versión mandaba un enlace en dos mensajes, para gastar menos. El
cálculo que la sostenía estaba **mal planteado**: contaba los mensajes, no el
dinero. Pasados los 1.000 gratis, Colombia tiene una de las tarifas más bajas
del mundo (~4 pesos por mensaje), así que **mil carreras al mes con siete
mensajes cada una cuestan unos 24.000 pesos** — menos del 3 % de la comisión de
esas mismas carreras.

El costo que no se estaba contando era el otro: **la gente no abre la página**,
y justo la que no la abre es para la que existe esta puerta.

**Cero IA por mensaje, a propósito.** No hay modelo de lenguaje respondiendo:
es una máquina de estados. Un modelo por turno costaría más que el mensaje y es
peor para direcciones.

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

### La prueba de punta a punta (WhatsApp → app conductor)

Hace falta **un conductor de verdad conectado**, o el viaje se creará y no se lo
ofrecerá a nadie. Ten a mano dos teléfonos.

**Antes de escribir nada**, en el teléfono del conductor:

1. Entra a la app ZIPA Conductor y **conéctate** (el círculo del centro de la
   barra inferior, que queda en verde).
2. Comprueba que **no salga el banner de GPS**: sin lectura real de ubicación no
   se manda latido, y sin latido de menos de 120 s el despacho no lo ve.
3. Tiene que estar **verificado** y con documentos vigentes, y su vehículo ser
   del tipo que cotiza el viaje. Si dudas, míralo en `/admin` → Conductores →
   **Diagnóstico de despacho** poniendo la lat/lng de la recogida: esa tabla
   dice cuál de los cuatro filtros lo está dejando fuera.
4. El conductor tiene que estar **a menos de 5 km** del punto de recogida. Es la
   causa número uno de «no le llega nada»: cliente y conductor en ciudades
   distintas.

**Ahora, desde tu teléfono como pasajero:**

1. Escríbele «hola» al número. Llegan los **términos** con el botón «Acepto».
2. Tócalo. Llega el botón **«Enviar ubicación»** → WhatsApp abre su pantalla de
   compartir ubicación. Mándala.
3. Escribe **a dónde vas** (una dirección de verdad, más de 4 caracteres: un
   «ok» se rechaza a propósito para no cotizar un trayecto inventado).
4. Llega el **precio** con los botones Confirmar / Cancelar.
5. Toca **Confirmar** → en el teléfono del conductor debe **sonar la solicitud**
   en pocos segundos.
6. El conductor acepta → al chat le vuelve el aviso, y de ahí en adelante
   «llegó» y «viaje terminado» con el total.

**Si el paso 5 no suena**, el viaje sí se creó: míralo en `/admin` → Métricas o
en la tabla de diagnóstico. El problema está en el despacho, no en WhatsApp.

---

## 7. Cómo se comporta

- **El teléfono lo verifica Meta**, así que no se pide código. Por eso la firma
  del webhook es toda la seguridad: se valida antes de mirar el contenido.
- **Sin aceptar los términos no se opera.** Es lo primero que se pide, antes que
  el origen: pedir un taxi es tratar sus datos —teléfono, ubicación, destino— y
  eso necesita permiso. Queda constancia con la versión y la fecha.
- **Una ubicación NUEVA reinicia el origen, esté donde esté la conversación.**
  Quien manda su punto, camina dos cuadras y manda otro, sale desde el segundo.
  Sin esa regla el taxi iría a donde estuvo, no a donde está, y nada en pantalla
  lo delataría.
- **El precio que se confirma es el del VIAJE, no el de la cotización.** El
  servidor recalcula al crear y descarta lo que venga del cliente (es lo que
  impide pedir una carrera de mil pesos); si cambió, el mensaje lo dice.
- **Quien escribe en vez de tocar «Confirmar» no se queda atascado**: si lo que
  escribió parece una dirección, se entiende que cambió de destino y se vuelve a
  cotizar, que es lo que haría un humano en la taquilla.
- **Cancelar funciona desde cualquier paso**, incluso sin haber aceptado los
  términos — si no, quien no quiera aceptarlos se quedaría recibiendo la misma
  pantalla sin salida.
- **La conversación caduca a los 20 minutos** y vuelve a empezar. Pero cancelar
  y mandar ubicación siguen valiendo aunque esté vieja.
- **Quien ya tiene un viaje en curso y escribe, recibe en qué va**, no un
  segundo taxi.
- **Un punto donde ZIPA no opera se responde diciéndolo**, sin seguir:
  entrar a la app para descubrir que no hay nadie es peor que saberlo en el
  chat, y nos ahorra el mensaje. Si la tabla de municipios estuviera vacía no se
  bloquea a nadie — un problema nuestro no puede parecer «no damos servicio».
- **Máximo 20 mensajes salientes por teléfono cada 24 horas.** Cada paso de la
  conversación cuenta, así que da para unas tres carreras al día por persona.
  Quien escriba en bucle deja de recibir: sin ese tope, una persona sola se
  gasta el presupuesto de mensajes de toda la operación. **Si al probar dejas de
  recibir respuestas, es esto** — usa otro número o espera.
- **Solo números colombianos.** A un número extranjero no se le responde y no se
  le abre cuenta: normalizarlo a `+57` crearía una cuenta con un teléfono que no
  existe, y operando en la frontera eso pasaría a diario.
- **No se responde a mensajes de más de 10 minutos.** Tras una caída, Meta
  entrega de golpe la cola acumulada; contestarle «aquí tienes tu taxi» a quien
  lo pidió hace tres horas es peor que callarse.
- Un mensaje repetido por un reintento de Meta **no se procesa dos veces**.

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
