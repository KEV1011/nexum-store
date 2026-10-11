// ── Dos negocios con el mismo nombre y el mismo teléfono ─────────────────────
//
// EL DEFECTO: `registerBusiness` creaba sin comprobar nada. `/business/register`
// es público y el dueño lo abre en un celular con mala señal, así que el
// segundo toque en «Registrar» —o el reintento del navegador— creaba un SEGUNDO
// negocio con **otro enlace mágico**.
//
// El daño no es cosmético y se ve en la lista del cliente: «BETOS» dos veces.
// El dueño carga su catálogo en uno, los clientes piden en el otro —que está
// vacío—, y la recuperación por teléfono le devuelve dos enlaces sin poder
// decirle cuál es el bueno.
//
// SE REUTILIZA, NO SE RECHAZA. Quien pulsó dos veces quiere su portal, no un
// error: el registro devuelve el que ya existe con su enlace. Un 400 dejaría al
// dueño sin saber qué hacer, y es el mismo criterio con el que el escáner
// precarga la ficha del producto que ya tiene en vez de negarse.

/**
 * El nombre de un negocio en forma comparable: sin tildes, en minúscula y sin
 * espacios de sobra.
 *
 * «Betos», «BETOS» y «betos  » son el mismo negocio. No se quita la puntuación
 * a propósito: «Pieros» y «Pieros Pizza» son dos locales distintos del mismo
 * dueño y tienen que poder convivir — lo que se caza es el doble toque, no el
 * parecido.
 */
export function nombreComparable(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Son el mismo negocio escrito dos veces? */
export function esElMismoNegocio(a: string, b: string): boolean {
  const na = nombreComparable(a);
  return na !== '' && na === nombreComparable(b);
}
