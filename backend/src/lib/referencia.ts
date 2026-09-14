import { randomBytes } from 'crypto';

// ── La referencia con la que se nombra un servicio ───────────────────────────
//
// «NXM-4821» es lo que ve el pasajero, lo que dicta por teléfono al llamar a
// soporte y lo que busca el administrador en el panel. Tiene que ser corta y
// fácil de leer en voz alta.
//
// Y tiene que ser ÚNICA, porque la columna lo es en la base. Se generaba con
// `Math.floor(1000 + Math.random() * 8000)`: **ocho mil valores posibles**. Con
// mil viajes en la tabla, uno de cada ocho intentos de pedir un carro choca con
// una referencia existente, la base rechaza el `create` y el pasajero recibe un
// error sin explicación. No es un fallo que aparezca en las pruebas ni en los
// primeros meses: llega solo, empeora con el uso y justo cuando hay tráfico.
//
// Aquí el espacio es de 32⁶ ≈ 1.070 millones. Con cien mil servicios en la
// tabla, la probabilidad de que el siguiente choque es de una entre diez mil, y
// para eso está el reintento de quien llama.
//
// El alfabeto no lleva 0, O, 1 ni I: esto se dicta por teléfono, y "cero o e"
// es una llamada perdida.

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LARGO = 6;

/**
 * Una referencia nueva con el prefijo dado (`NXM` viajes, `NXE` mandados,
 * `NXI` intermunicipal).
 */
export function nuevaReferencia(prefijo: string): string {
  const bytes = randomBytes(LARGO);
  let out = '';
  for (let i = 0; i < LARGO; i++) out += ALFABETO[bytes[i]! % ALFABETO.length];
  return `${prefijo}-${out}`;
}

/** Los caracteres que nunca aparecen, por confundirse al dictarlos. */
export const CARACTERES_PROHIBIDOS = ['0', 'O', '1', 'I'] as const;
