/**
 * El sistema visual de las superficies web de ZIPA.
 *
 * VIVE EN LA RAÍZ Y NO EN `app/negocio/` por una razón medida: nació para el
 * portal del dueño y la **carta del QR** —`app/carta/`, la pantalla que ve el
 * comensal sentado en la mesa— quedó fuera del sistema Y fuera de la guarda que
 * lo vigila, que solo recorría `app/negocio`. El resultado era el esperable: dos
 * primarios en el mismo flujo (el botón «Agregar» en negro y «Enviar a la
 * cocina» en esmeralda), `violet` en una píldora y botones de 28 px. Un sistema
 * de diseño que no cubre la pantalla que ve el cliente final no es un sistema.
 *
 * Lo que de verdad se comparte son `MARCA`, `BOTON` y `TARJETA`. `ESTADO`,
 * `ETIQUETA` y `CONTENEDOR` son del tablero de pedidos y no tendrían sentido en
 * una carta —un plato no está «en curso»—, pero se dejan en el mismo archivo:
 * partirlo en dos obligaría a decidir en cada token nuevo a cuál pertenece, y
 * esa decisión se acaba tomando mal.
 *
 * POR QUÉ EXISTE. Medido antes de escribirlo: el portal usaba DIEZ familias de
 * color en dieciséis archivos —slate 441 usos, teal 142, emerald 82, amber 66,
 * red 58, sky 20, orange 10, violet 9, rose 7, blue 6— y dos de ellas, teal y
 * emerald, convivían como si fueran el mismo verde. El chip del logo era
 * `emerald-700` y los acentos `teal-*`. Eso no se lee como una decisión: se lee
 * como una plantilla de dashboard a medio terminar, que es exactamente lo que
 * impide enseñárselo a un local.
 *
 * LA REGLA QUE LO SOSTIENE: **el color significa algo o no se usa.**
 *
 * La fila de estadísticas tenía cinco tintes —naranja, violeta, teal, esmeralda
 * y celeste— que no querían decir nada; eran decoración. Aquí solo hay un
 * primario (esmeralda, el de la marca, ya fijado en `/empresa` y `/admin`) y
 * cuatro estados que SÍ dicen algo:
 *
 *   nuevo     ámbar     pide una acción AHORA
 *   enCurso   esmeralda va bien, no toques nada
 *   listo     slate     terminado; se aparta y deja de pedir atención
 *   problema  rojo      algo se rompió
 *
 * Que «listo» sea gris no es ahorro de color: un pedido entregado que sigue
 * gritando en verde compite por la mirada con el que acaba de entrar, y el que
 * acaba de entrar es el que paga.
 *
 * CÓMO SE USA. Estas son cadenas de clases de Tailwind, no componentes. Se
 * eligió así a propósito: el portal ya está escrito con Tailwind suelto en
 * dieciséis archivos, y meter una capa de componentes obligaría a reescribirlos
 * todos de golpe. Con cadenas, cada pantalla se pasa al sistema cuando le toca
 * y las que faltan siguen funcionando igual.
 */

/** El verde de ZIPA. Una sola familia: `emerald`, nunca `teal`. */
export const MARCA = {
  /** Fondo de un elemento sólido (botón principal, chip del logo). */
  solido: 'bg-emerald-600 text-white',
  solidoHover: 'hover:bg-emerald-700',
  /** Fondo suave para una píldora o un aviso. */
  suave: 'bg-emerald-50 text-emerald-700',
  borde: 'border-emerald-200',
  texto: 'text-emerald-700',
  anillo: 'focus-visible:ring-emerald-500',
} as const

/**
 * Los cuatro estados. Cada uno es una píldora completa, lista para pegar.
 *
 * Llevan `ring-1` en vez de `border` para que el borde no sume al tamaño y las
 * píldoras de distinto estado queden exactamente igual de altas: una fila de
 * pedidos donde las etiquetas bailan un píxel se ve descuidada.
 */
export const ESTADO = {
  nuevo: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  enCurso: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  listo: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  problema: 'bg-red-50 text-red-700 ring-1 ring-red-200',
} as const

export type Estado = keyof typeof ESTADO

/**
 * Una ETIQUETA, que no es lo mismo que un estado.
 *
 * «Mesa 4», «Salón», «Domicilio», «Se actualiza»: dicen de qué CLASE es algo,
 * no cómo va ni si hay que hacer nada. Si se pintaran de colores —como estaban,
 * en celeste— competirían por la mirada con los estados, que son los que sí
 * piden acción, y el color dejaría de significar nada.
 *
 * Van en gris a propósito: la palabra ya distingue «Salón» de «Domicilio» sin
 * ayuda, y leer la queja es lo que se hace de todos modos.
 */
export const ETIQUETA = 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'

/** Solo el tinte del icono de una estadística, sin el fondo de la tarjeta. */
export const TINTE_ESTADO: Record<Estado, string> = {
  nuevo: 'bg-amber-100 text-amber-700',
  enCurso: 'bg-emerald-100 text-emerald-700',
  listo: 'bg-slate-100 text-slate-500',
  problema: 'bg-red-100 text-red-700',
}

/**
 * La superficie de una tarjeta.
 *
 * Borde de un pelo y sombra mínima, no sombra flotante: una pantalla llena de
 * tarjetas con sombra fuerte se lee como un montón de cajas volando, y aquí
 * hay muchas en vertical.
 */
export const TARJETA =
  'bg-white border border-slate-200 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)]'

/** Tarjeta que pide acción: se distingue por el borde, no por el fondo. */
export const TARJETA_NUEVA =
  'bg-white border-2 border-amber-300 rounded-2xl shadow-[0_2px_8px_rgba(217,119,6,0.10)]'

/**
 * Botones.
 *
 * `min-h-[44px]` en los de acción NO es decorativo: es el objetivo táctil
 * mínimo cómodo con el pulgar, y este portal se usa de pie, detrás de un
 * mostrador y con una mano. Los botones de `py-2` que había medían 32 px.
 */
export const BOTON = {
  principal:
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 '
    + 'text-sm font-semibold text-white transition-colors hover:bg-emerald-700 '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 '
    + 'focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  secundario:
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 '
    + 'bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 '
    + 'focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  /** Para una acción destructiva o de rechazo. */
  peligro:
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-200 '
    + 'bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 '
    + 'focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  /** Icono solo. Cuadrado y del mismo alto que los demás. */
  icono:
    'inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 '
    + 'text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-700 '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 '
    + 'disabled:opacity-50',
} as const

/**
 * El paso de una cantidad (el `−` y el `+` de una línea del carrito).
 *
 * 40 px y no 28, que es lo que medían. No llega a los 44 de `BOTON` a propósito:
 * van DOS pegados en una fila estrecha con el precio al lado, y a 44 cada uno el
 * nombre del plato se queda sin sitio en un teléfono de 360 px. 40 con el área
 * táctil ampliada por el `p-0.5` del contenedor es el compromiso; por debajo de
 * 36 se falla el toque y se quita un plato queriendo añadirlo.
 */
export const PASO =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 '
  + 'text-slate-600 transition-colors hover:border-slate-400 active:bg-slate-100 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'

/**
 * Una barra pegada al fondo de la pantalla.
 *
 * `env(safe-area-inset-bottom)` NO es un detalle: sin él, en cualquier iPhone
 * con barra de gestos el botón principal queda medio tapado por la barra del
 * sistema y el pulgar arrastra la pantalla en vez de pulsar. Se nota solo en el
 * dispositivo, que es la peor clase de defecto porque en el navegador del
 * escritorio se ve perfecto. `max()` conserva el relleno en los que no tienen
 * muesca, donde el inset vale cero.
 */
export const BARRA_FIJA =
  'fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 '
  + 'px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur'

/**
 * El ancho de la página.
 *
 * Las tres pantallas estaban en `max-w-2xl` (672 px). En el teléfono está bien;
 * en el portátil del dueño es una columna estrecha en medio de una página
 * vacía, que se lee como una pantalla de móvil estirada — y eso es justo lo que
 * resta al enseñárselo a un local.
 *
 * `max-w-5xl` con las tarjetas en dos columnas desde `lg` aprovecha la pantalla
 * sin alargar la línea de texto, que es lo que pasaría con una sola columna
 * ancha.
 */
export const CONTENEDOR = 'mx-auto w-full max-w-5xl px-4 sm:px-6'
