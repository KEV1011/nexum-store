/**
 * Qué proponerle al dueño cuando escanea un código que él no tiene.
 *
 * EL REPORTE QUE LO ORIGINA: «solo se sube un código, mas no reconoce el
 * producto que se sube». Era exacto — el escáner rellenaba trece dígitos y
 * dejaba el nombre en blanco, así que el ahorro era cero: había que teclear
 * «Coca-Cola 1.5 L» de todas formas. Y el dato para no teclearlo ya está en la
 * plataforma: ese mismo EAN lo tienen registrado otros comercios.
 *
 * LA REGLA QUE MANDA: **el precio NUNCA se propone.** El precio lo pone cada
 * comercio y proponerlo sería ponerle el de su competencia; peor, un «Guardar»
 * distraído lo dejaría vendiendo al precio de otra tienda y nadie se enteraría
 * hasta que un cliente comprara. Lo que sí es del PRODUCTO y no de la tienda:
 * el nombre, la marca y la unidad de venta.
 *
 * Y ES UNA PROPUESTA, no un alta: llega al formulario como texto editable y
 * marcado como sugerencia. Nada se crea solo.
 *
 * EL NOMBRE SE VOTA. Si se tomara el primero que aparezca, la errata de un
 * comercio («Coca Col 1.5») se volvería el nombre que ve toda la plataforma. Se
 * cuenta cómo lo escribieron los demás, ignorando mayúsculas, tildes y espacios
 * de más, y gana la forma más repetida: dos que lo escribieron bien le ganan a
 * uno que lo escribió mal.
 */

export interface FilaDeOtroComercio {
  name: string;
  brand?: string | null;
  unit?: string | null;
}

export interface SugerenciaDeCodigo {
  /** El nombre más repetido, con la ortografía con la que lo escribieron. */
  name: string;
  brand?: string;
  unit?: string;
  /** En cuántos comercios está registrado. Se le dice al dueño. */
  comercios: number;
}

/** Para contar votos: sin tildes, sin mayúsculas y sin espacios de más. */
export function claveDeNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** El más votado de una lista de textos, con su ortografía original. */
function masVotado(valores: Array<string | null | undefined>): string | undefined {
  const votos = new Map<string, { veces: number; texto: string }>();
  for (const v of valores) {
    const texto = (v ?? '').trim();
    if (!texto) continue;
    const clave = claveDeNombre(texto);
    const ya = votos.get(clave);
    if (ya) ya.veces += 1;
    else votos.set(clave, { veces: 1, texto });
  }
  let mejor: { veces: number; texto: string } | null = null;
  for (const v of votos.values()) {
    // Empate: se queda el primero, que es el que la consulta trajo primero.
    if (!mejor || v.veces > mejor.veces) mejor = v;
  }
  return mejor?.texto;
}

/**
 * La sugerencia para un código, a partir de cómo lo tienen OTROS comercios.
 *
 * `null` cuando nadie más lo tiene: entonces el formulario se queda con el
 * código puesto y el nombre en blanco, que es el comportamiento de hoy. No se
 * inventa un nombre a partir del código.
 */
export function sugerenciaDeCodigo(
  filas: FilaDeOtroComercio[],
): SugerenciaDeCodigo | null {
  const name = masVotado(filas.map((f) => f.name));
  // Sin nombre no hay sugerencia: una marca suelta no ahorra teclear nada y
  // dejaría el campo del nombre vacío con los demás llenos, que se lee como un
  // formulario a medio cargar.
  if (!name) return null;

  const brand = masVotado(filas.map((f) => f.brand));
  const unit = masVotado(filas.map((f) => f.unit));

  return {
    name,
    ...(brand !== undefined && { brand }),
    ...(unit !== undefined && { unit }),
    comercios: filas.length,
  };
}
