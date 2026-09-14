// ── Hitos del conductor ──────────────────────────────────────────────────────
//
// Lo primero fue comprobar qué había: **Nexum Pro ya es una escalera de logros**
// (Bronce → Diamante por servicios liquidados y nota, con progreso al
// siguiente). Montar otra al lado sería medir dos veces lo mismo y obligar al
// conductor a entender dos sistemas que dicen casi igual.
//
// Así que aquí solo vive lo que Pro NO mide —los kilómetros— y el perfil
// público enseña el nivel Pro que ya existe. De paso se cumple una promesa que
// llevaba tiempo rota: los beneficios de Plata y Oro dicen «insignia visible en
// tu perfil» y el perfil no enseñaba ninguna.
//
// Dos reglas, y la segunda es la que importa:
//
//  1. **Solo el escalón más alto de cada familia.** Enseñar «10+, 25+, 100+»
//     junto es ruido: «100+ servicios» ya lo dice todo.
//  2. **Sin dato medido no hay hito.** Los kilómetros salen de sumar los
//     trayectos que el servidor midió. Los viajes anteriores a esa medición
//     tienen la distancia en null y NO se estiman: un «5.000 km» inventado en
//     un perfil público es la misma clase de mentira que una verificación
//     falsa. Quedarse corto es seguro; pasarse, no.

export interface Hito {
  clave: string;
  etiqueta: string;
}

/** Escalones de servicios completados. */
const ESCALONES_SERVICIOS = [10, 25, 100, 500, 1000];

/** Escalones de kilómetros medidos. */
const ESCALONES_KM = [100, 500, 1000, 5000, 10000];

function _mayorAlcanzado(valor: number, escalones: number[]): number | null {
  let alcanzado: number | null = null;
  for (const e of escalones) {
    if (valor >= e) alcanzado = e;
    else break;
  }
  return alcanzado;
}

/** Formatea con el punto de miles colombiano: 5000 → «5.000». */
function _miles(n: number): string {
  return n.toLocaleString('es-CO');
}

/**
 * Los hitos que este conductor ya alcanzó.
 *
 * [kmMedidos] debe ser la suma de los trayectos REALMENTE medidos. Se pasa
 * `null` cuando no hay ninguno, que no es lo mismo que cero: sin medición no se
 * enseña hito de kilómetros en vez de enseñar uno de cero.
 */
export function hitosDeConductor(
  servicios: number,
  kmMedidos: number | null,
): Hito[] {
  const out: Hito[] = [];

  const s = _mayorAlcanzado(Math.max(0, Math.trunc(servicios)), ESCALONES_SERVICIOS);
  if (s !== null) {
    out.push({
      clave: `servicios_${s}`,
      etiqueta: `${_miles(s)}+ servicios`,
    });
  }

  if (kmMedidos !== null && kmMedidos > 0) {
    const k = _mayorAlcanzado(Math.trunc(kmMedidos), ESCALONES_KM);
    if (k !== null) {
      out.push({ clave: `km_${k}`, etiqueta: `${_miles(k)}+ km recorridos` });
    }
  }

  return out;
}
