// ── La dirección del backend, en UN solo sitio ─────────────────────────────
//
// POR QUÉ. Esta dirección estaba escrita a mano en TREINTA ficheros del
// portal, y para cuando se midió ya habían divergido: veinticinco traían la
// rama de desarrollo (`localhost:3000` cuando trabajas en tu máquina) y cinco
// no, así que esas cinco pantallas hablaban con PRODUCCIÓN mientras probabas
// en local — tocando datos de negocios reales sin un solo aviso.
//
// Es el mismo patrón que ya se pagó dos veces aquí: el formateador de moneda
// acabó en diecisiete copias con dos formatos distintos, y el correo de
// contacto en dos servicios que podían contradecirse. Copiar tres líneas
// siempre será más rápido que buscar el ayudante, así que `backend-url.test.ts`
// prohíbe la dirección literal fuera de este fichero.
//
// Y ADEMÁS: el día que ZIPA tenga su dominio, esto es UNA línea en vez de
// treinta — y treinta es justo el número en el que alguien se deja un rincón
// apuntando al servidor viejo, que no falla de forma visible hasta que un
// cliente abre esa pantalla concreta.

/**
 * La raíz del backend, sin barra final.
 *
 * `NEXT_PUBLIC_BACKEND_URL` manda sobre todo, para poder apuntar a un
 * servidor de pruebas sin tocar código. Sin ella, en desarrollo se habla con
 * el backend local y en producción con el de verdad.
 */
export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')
).replace(/\/+$/, '')

/**
 * La misma dirección para WebSocket. Se DERIVA, no se escribe aparte: así no
 * puede pasar que el portal pida los datos a un servidor y abra el socket
 * contra otro, que es lo que ocurriría en cuanto una de las dos se cambie y
 * la otra se quede.
 */
export const BACKEND_WS = BACKEND_URL.replace(/^http/, 'ws')
