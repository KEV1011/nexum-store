// ── Elogios: lo que el pasajero destaca de su conductor ──────────────────────
//
// Una nota de cinco estrellas no dice qué hizo bien. «Carro limpio» y
// «Conducción segura» sí, y son las dos cosas por las que alguien vuelve a
// subirse. Para el conductor la diferencia es aún mayor: un 4,8 no le enseña
// nada, y «tres pasajeros dijeron que llegas puntual» sí.
//
// Tres reglas sostienen que esto signifique algo:
//
//  1. **El catálogo es cerrado.** Lo que llegue y no esté aquí se descarta. Si
//     se guardara texto libre acabaríamos con etiquetas escritas por el
//     teléfono, y un elogio inventado en el perfil de alguien es tan grave
//     como una verificación falsa.
//  2. **Hay un tope por viaje.** Marcar los seis no destaca nada: si todo es
//     excepcional, nada lo es. Tres obliga a elegir, y elegir es lo que
//     convierte el dato en información.
//  3. **Se cuentan y se enseña el número.** «Puntual · 3» dice mucho más que
//     una etiqueta suelta, y evita que un solo viaje parezca una costumbre.
//
// Los elogios NO afectan la nota, ni los niveles, ni el despacho. Son
// reconocimiento, no otra vara con la que medir al conductor por la puerta de
// atrás.

export interface Elogio {
  clave: string;
  etiqueta: string;
}

/** Cuántos puede marcar el pasajero en un mismo viaje. */
export const MAX_ELOGIOS_POR_VIAJE = 3;

export const ELOGIOS_AL_CONDUCTOR: readonly Elogio[] = [
  { clave: 'conduccion_segura', etiqueta: 'Conducción segura' },
  { clave: 'carro_limpio', etiqueta: 'Carro limpio' },
  { clave: 'puntual', etiqueta: 'Puntual' },
  { clave: 'amable', etiqueta: 'Amable' },
  { clave: 'buena_conversacion', etiqueta: 'Buena conversación' },
  { clave: 'buena_musica', etiqueta: 'Buena música' },
];

const _POR_CLAVE = new Map(ELOGIOS_AL_CONDUCTOR.map((e) => [e.clave, e]));

/**
 * Deja solo los elogios válidos: los del catálogo, sin repetir y hasta el tope.
 *
 * Devuelve `null` cuando no queda ninguno, para poder guardar null en vez de un
 * array vacío — así «no marcó nada» y «marcó cosas que no existen» se ven
 * igual en la base, que es lo correcto: ninguno de los dos es un elogio.
 */
export function saneaElogios(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;

  const vistos = new Set<string>();
  for (const bruto of valor) {
    if (typeof bruto !== 'string') continue;
    const clave = bruto.trim().toLowerCase();
    if (!_POR_CLAVE.has(clave)) continue;
    vistos.add(clave);
    if (vistos.size >= MAX_ELOGIOS_POR_VIAJE) break;
  }
  return vistos.size > 0 ? [...vistos] : null;
}

export function etiquetaDeElogio(clave: string): string | null {
  return _POR_CLAVE.get(clave)?.etiqueta ?? null;
}

export interface ElogioContado {
  clave: string;
  etiqueta: string;
  veces: number;
}

/**
 * Agrupa los elogios de muchos viajes y los ordena de más a menos.
 *
 * Solo salen los que alguien marcó: una lista con «Buena música · 0» es ruido,
 * y además se leería como un reproche.
 */
export function cuentaElogios(porViaje: (string[] | null | undefined)[]): ElogioContado[] {
  const conteo = new Map<string, number>();
  for (const viaje of porViaje) {
    if (!Array.isArray(viaje)) continue;
    // Se vuelve a sanear al leer: en la base puede haber filas de una versión
    // anterior, o con una etiqueta que después se retiró del catálogo.
    for (const clave of saneaElogios(viaje) ?? []) {
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
  }

  const salida: ElogioContado[] = [];
  for (const [clave, veces] of conteo) {
    const etiqueta = etiquetaDeElogio(clave);
    // Sin etiqueta se OMITE, no se revienta. `saneaElogios` ya debería haber
    // filtrado la clave, así que llegar aquí sin nombre solo puede pasar si
    // alguien toca el catálogo — y esto lo sirve una ruta pública: un `!` de
    // más ahí convierte un descuido en un error 500 para todo el mundo.
    if (etiqueta !== null) salida.push({ clave, etiqueta, veces });
  }
  return salida.sort(
    (a, b) => b.veces - a.veces || a.etiqueta.localeCompare(b.etiqueta, 'es'),
  );
}
