# Activar «la carta desde una foto»

El dueño de un restaurante le toma una foto a su carta impresa y el catálogo
le queda escrito para revisar. **Sin esto, tiene que digitar cuarenta platos
a mano**, que es lo que de verdad frena el registro de comercios.

El código está listo. Falta habilitar el lector en Google Cloud: leer texto de
una imagen es un servicio externo, como los mapas.

---

## Lo que hace y lo que NO hace

- **Lee** la foto y propone una lista de platos con su precio y su sección.
- **No publica nada.** El dueño ve la lista en una tabla **editable**, corrige
  y solo entonces pulsa «Crear N productos». Lo aprobado entra por el mismo
  importador del CSV, con las mismas validaciones.
- **No inventa precios.** Si una línea no tiene precio, o tiene dos («Jugo
  5.000 / 7.000»), la fila sale **en blanco y marcada en ámbar**. Elegir uno
  por cuenta propia le cobraría de más o de menos a un cliente, y nadie se
  enteraría hasta la caja.
- **No guarda la foto.** De la carta interesa el texto. La imagen viaja en
  memoria, se lee y se descarta.

---

## ⚠️ La credencial que hace falta es una **API key**, no un cliente OAuth

En Google Cloud → «Crear credenciales» hay tres opciones y solo una sirve:

| Opción | ¿Sirve? |
|---|---|
| **Clave de API** | **SÍ.** Es la que usa el servidor. |
| ID de cliente de OAuth 2.0 | No. Es para que un **usuario** inicie sesión con Google dentro de una app (por eso pide el nombre del paquete y la huella SHA‑1). No tiene nada que ver con leer una imagen desde nuestro backend. |
| Cuenta de servicio | También valdría, pero es más trabajo (archivo JSON, firma de tokens) y aquí no aporta nada. |

Si te pidió **«Nombre del paquete»** y **«Huella digital del certificado
SHA‑1»**, estás en la pantalla equivocada: cancela y elige **Clave de API**.

---

## Pasos en Google Cloud (5 minutos)

Es la misma cuenta donde ya está `GOOGLE_MAPS_API_KEY`.

1. **APIs y servicios → Biblioteca** → busca **Cloud Vision API** → *Habilitar*.
2. **APIs y servicios → Credenciales**:
   - Puedes **reutilizar la llave de los mapas**. Si la tienes restringida por
     API (lo recomendable), entra en ella y **añade Cloud Vision API** a la
     lista de APIs permitidas — si no, Google responde **403** y el dueño verá
     «no pudimos leer la carta».
   - O crea una **Clave de API** nueva y restríngela solo a Cloud Vision API.
     Esa va en `CARTA_OCR_API_KEY`.
3. La llave **no lleva restricción por sitio web ni por app**: la usa el
   servidor, no el navegador. Si la restringes, hazlo **por API**.

**Costo:** Cloud Vision cobra por imagen con una capa gratuita mensual (las
primeras 1.000 unidades al mes). Una carta son una o dos fotos, así que el
gasto por restaurante que se registra es despreciable frente a lo que cuesta
la visita. Confirma la tarifa vigente antes de activarlo — cambia.

---

## Las variables en Render (servicio `nexum-api`)

```
CARTA_OCR_PROVIDER = google-vision
```

Y, **solo si creaste una llave aparte**:

```
CARTA_OCR_API_KEY = AIza...
```

Sin `CARTA_OCR_API_KEY` se reutiliza `GOOGLE_MAPS_API_KEY`, que ya está puesta.

Sin `CARTA_OCR_PROVIDER`, la función queda **apagada**: el botón responde
diciendo que todavía no está activada y ofrece el CSV. No se rompe nada y no
se finge que la carta no se entiende.

> `CARTA_OCR_PROVIDER=azure-read` está admitido como valor pero **no está
> implementado**: si se pone, el servidor contesta lo mismo que apagado y deja
> el motivo en el log. Usa `google-vision`.

---

## Cómo comprobar que quedó activo

1. `GET /health` → el campo **`cartaFoto`**:
   - `google-vision` → listo.
   - `google-vision-sin-llave` → falta la llave (ni `CARTA_OCR_API_KEY` ni
     `GOOGLE_MAPS_API_KEY` en el entorno).
   - `apagado` → falta `CARTA_OCR_PROVIDER`.
2. Entra a `/negocio/<token>/catalogo` y pulsa **«Tomar foto de la carta»**.
3. Si sale «No pudimos leer la carta en este momento», el motivo real está en
   los **logs de Render** (`[CartaOCR] …`). El más probable es un **403**: la
   llave no tiene Cloud Vision API habilitada o permitida.

---

## Lo único que hay que saber del lector

Se usa `DOCUMENT_TEXT_DETECTION` y no `TEXT_DETECTION`: la segunda está pensada
para letreros sueltos y en una carta a dos columnas mezcla los renglones de las
dos, que es justo lo que le pegaría el precio de un plato a otro. Se manda
`languageHints: ['es']` para conservar tildes y ñ — sin eso «Patacón» vuelve
«Patacon» y el dueño acaba corrigiendo cada plato a mano, que es el trabajo que
esto venía a quitar.

El análisis se apoya en que **cada plato va en su renglón**: el lector devuelve
el texto con sus saltos de línea y de ahí salen las filas.
