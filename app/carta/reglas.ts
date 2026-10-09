/**
 * Las decisiones de la carta que se pueden equivocar en silencio.
 *
 * Viven aquí, en TypeScript puro sin React, por lo mismo que `app/moneda.ts` y
 * `app/contacto.ts`: el portal no tiene corredor de pruebas, y desde el
 * backend —que sí lo tiene— se puede importar un fichero sin JSX.
 * `backend/src/lib/carta-reglas.test.ts` las ejercita.
 */

/**
 * El ancla de una sección, para que los chips puedan llevar hasta ella.
 *
 * Sin tildes y sin espacios porque va en un `id` de HTML y en un selector de
 * `querySelector`: «Platos fuertes» o «Bebidas frías» romperían el selector.
 */
export function idDeSeccion(nombre: string): string {
  const base = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  // Una sección con un nombre entero en otro alfabeto dejaría el id vacío y
  // todos los chips apuntarían al mismo sitio.
  return `sec-${base || 'seccion'}`
}

/**
 * ¿Esta sección se dibuja con fotos o como lista de texto?
 *
 * LA REGLA: con fotos solo si **alguna** de sus platos la tiene. Es la misma
 * que ya se aplica al carrusel del home del cliente —«solo entra quien TIENE
 * foto, y si ninguno la tiene la sección no se dibuja»— llevada al caso que
 * aquí no admite esconder el plato: una carta escrita desde un CSV o leída de
 * una foto del menú impreso no tiene ni una imagen, y cincuenta recuadros
 * grises se leen como una carta que no cargó. En texto, esa misma carta se ve
 * como lo que es: una carta, bien puesta.
 *
 * Mezclado dentro de una sección sí se admite —el plato sin foto lleva su
 * recuadro con la inicial— porque ahí la ausencia es del plato, no del local.
 */
export function seccionConFotos(items: { imageUrl?: string | null }[]): boolean {
  return items.some((p) => !!p.imageUrl)
}

/**
 * ¿Merece la pena agrupar esta carta en secciones?
 *
 * CASO REAL QUE LA MOTIVA (captura de producción): un local había puesto cada
 * plato en su propia categoría, así que la carta tenía tantas «secciones» como
 * platos. El resultado era una barra de chips donde cada chip llevaba a UN
 * producto, y encabezados de sección que repetían el nombre del plato que
 * tenían justo debajo. No es que se viera recargado: es que la agrupación no
 * agrupaba nada y hacía ver la carta como si estuviera rota.
 *
 * Agrupar vale cuando, en promedio, una sección tiene **dos o más platos**.
 * Con «Entradas 1 · Fuertes 10 · Bebidas 1» el promedio es 4 y sí vale —ahí la
 * sección grande es la que justifica los chips—; con tres secciones de un
 * plato cada una el promedio es 1 y no vale.
 *
 * Se usa el promedio y no «¿alguna sección tiene 2?» porque con diez secciones
 * de un plato y una de dos la barra seguiría siendo ruido.
 */
export function agruparVale(secciones: { items: unknown[] }[]): boolean {
  if (secciones.length < 2) return false
  const platos = secciones.reduce((n, s) => n + s.items.length, 0)
  return platos / secciones.length >= 2
}
