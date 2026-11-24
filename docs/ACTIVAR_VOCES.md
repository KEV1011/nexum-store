# Voces en las notificaciones

Las notificaciones clave suenan con una frase hablada («Tu conductor llegó»,
«Tu pedido va en camino»…), también con la app cerrada. Los audios se generan
**una sola vez** con la voz de Google y viajan dentro de la app: cada aviso
cuesta **cero pesos**.

## Costo

Google Cloud Text-to-Speech cobra por letras y regala el primer millón al mes
en las voces Chirp 3 HD. Las 7 frases suman unas 180 letras. El generador se
niega a pedir más de 2.000 letras por corrida. Hace falta tener la facturación
activa en el proyecto (Google la exige aunque no se pase de lo gratis), que ya
está porque es el mismo proyecto de Google Maps.

## Activar (una vez)

1. Google Cloud Console → el proyecto de ZIPA → **APIs y servicios →
   Biblioteca** → «Cloud Text-to-Speech API» → **Habilitar**.
2. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
   En «Restringir clave», restríngela a «Cloud Text-to-Speech API» (así, si se
   filtra, solo sirve para esto).
3. GitHub → repositorio → **Settings → Secrets and variables → Actions → New
   repository secret**: nombre `GOOGLE_TTS_API_KEY`, valor la clave.
4. GitHub → **Actions → Generar voces → Run workflow**, sobre la rama de
   trabajo. Sube los audios a esa rama; después va por PR como siempre.
5. Publicar APK nuevo de las dos apps (las voces van dentro).

## Qué suena y cuándo

La lista está en `tools/voces/frases.json` (fuente única) y el servidor elige la
voz en cada aviso (`backend/src/lib/voces-aviso.ts`). Cambiar una frase =
editar ese archivo y volver a correr el workflow.

- **Android**: un canal de notificación por frase (en Android 8+ el sonido es
  del canal). Una app vieja sin ese canal usa el sonido normal.
- **iPhone**: todavía suena el sonido normal. Para la voz hay que meter los
  audios en el paquete de iOS registrándolos en el proyecto de Xcode; queda
  pendiente.
