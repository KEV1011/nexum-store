# Activar «la carta desde una foto»

El dueño de un restaurante le toma una foto a su carta impresa y el catálogo
le queda escrito para revisar. **Sin esto, tiene que digitar cuarenta platos
a mano**, que es lo que de verdad frena el registro de comercios.

El código está listo y probado. Falta contratar el lector: leer texto de una
imagen es un servicio externo, como los mapas.

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

---

## Qué contratar

Cualquiera de los dos. El código ya tiene el punto de integración escrito en
`backend/src/services/carta-ocr.service.ts` con la forma exacta de la llamada.

### Opción A — Google Cloud Vision (recomendada)

Es la misma cuenta de Google Cloud donde ya está `GOOGLE_MAPS_API_KEY`.

1. Google Cloud Console → **APIs y servicios** → habilitar **Cloud Vision API**.
2. La función que sirve es `DOCUMENT_TEXT_DETECTION` (texto denso en columnas),
   no `TEXT_DETECTION` (pensada para letreros sueltos).
3. Reutiliza la llave que ya tienes o crea una restringida a esa API.

### Opción B — Azure AI Vision («Read»)

Útil si prefieres no ampliar la cuenta de Google. Devuelve el texto por
líneas, que es justo lo que el lector necesita.

**Sobre el costo:** las dos cobran por imagen, con una capa gratuita mensual.
Una carta son una o dos fotos, así que el gasto por restaurante que se registra
es despreciable frente a lo que cuesta la visita. Confirma el precio vigente en
la página de tarifas del proveedor que elijas antes de activarlo — cambia.

---

## Las variables en Render (servicio `nexum-api`)

```
CARTA_OCR_PROVIDER = google-vision
```

o

```
CARTA_OCR_PROVIDER = azure-read
```

Sin la variable, la función queda **apagada**: el botón responde diciendo que
todavía no está activada y ofrece el CSV. No se rompe nada y no se finge que
la carta no se entiende.

> **Importante:** hoy los dos proveedores están como *punto de integración*.
> Poner la variable sin implementar la llamada hace que el servidor conteste
> «el lector está configurado pero no responde» — que es lo correcto, pero no
> sirve. La implementación son unas veinte líneas en
> `leerTextoDeCarta`, con el ejemplo de cada proveedor escrito en el comentario.

---

## Cómo comprobar que quedó activo

1. `GET /health` → el campo **`cartaFoto`** debe decir `google-vision` o
   `azure-read` (apagado ⇒ `apagado`).
2. Entra a `/negocio/<token>/catalogo` y pulsa **«Tomar foto de la carta»**.

---

## Lo único que hay que saber del lector

Tiene que devolver el texto **con sus saltos de línea**. El análisis se apoya
en que cada plato va en su renglón; un proveedor que devuelva un párrafo
corrido dejaría la carta entera en una sola fila. Las dos opciones de arriba
cumplen.
