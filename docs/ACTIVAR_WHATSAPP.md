# Activar la entrada por WhatsApp

El pasajero le escribe al número de ZIPA y recibe **un enlace** que lo mete a la
app web ya autenticado, sin descargar nada y sin escribir ningún código.

El código ya está listo y probado. Lo que falta es **configuración en Meta**, y
eso no lo puedo hacer yo. Esta guía es el orden exacto.

---

## 1. Por qué un enlace y no un chat que pregunta todo

Un chat conversacional para pedir un taxi son unos **siete mensajes salientes**
por carrera (menú, pedir ubicación, pedir destino, precio, buscando, conductor
asignado, llegó). Con el enlace son **uno o dos**.

Eso importa por dinero y por producto:

| | Chat completo | Enlace |
|---|---|---|
| Mensajes salientes por viaje | ~7 | 1–2 |
| Viajes dentro de los 1.000 gratis al mes | ~140 | **más de 500** |
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
Debe llegarte un enlace que, al tocarlo, te deje dentro de la app web con tu
cuenta.

---

## 7. Cómo se comporta

- **El teléfono lo verifica Meta**, así que no se pide código. Por eso la firma
  del webhook es toda la seguridad: se valida antes de mirar el contenido.
- **El enlace vale una sola vez y quince minutos.** El código viaja detrás del
  `#` de la URL, que no se manda al servidor — ni el hosting ni el robot que
  arma la vista previa del chat llegan a verlo.
- **Quien ya escribió y no usó su enlace recibe el mismo**, no uno nuevo.
- **Máximo 10 respuestas por teléfono cada 24 horas.** Quien escriba en bucle
  deja de recibir: sin ese tope, una persona sola se gasta el presupuesto de
  mensajes de toda la operación.
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
| `respondido` | Salió el enlace |
| `respondido:sin-salir` | Se emitió el enlace pero Meta rechazó el envío — mirar los registros de Render |
| `ignorado:mensaje-viejo:Nmin` | Llegó tarde |
| `ignorado:tope-diario:N` | Ese teléfono ya agotó sus 10 del día |
| `procesando` | Se quedó a medias (el servidor se reinició en mitad) |

Si no hay **ninguna fila** para ese teléfono: o el mensaje nunca llegó al
webhook (revisar la suscripción en Meta), o el número no es colombiano.
