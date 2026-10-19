/**
 * Las reglas de la clave personal, para avisar en el portal ANTES de enviar.
 *
 * Copia de `motivoClaveInvalida` del backend (`backend/src/lib/clave-personal`):
 * el servidor vuelve a comprobarlo y su respuesta es la que manda, pero sin
 * esto el dueño escribiría «1234», pulsaría guardar y solo entonces se
 * enteraría. `clave-personal-portal.test.ts` pasa la misma tabla por las dos.
 */
export function motivoClaveInvalida(clave: unknown): string | null {
  if (typeof clave !== 'string') return 'Escribe tu clave.'
  const c = clave.trim()
  if (!/^\d+$/.test(c)) return 'La clave son solo números.'
  if (c.length < 4 || c.length > 6) return 'La clave tiene de 4 a 6 números.'
  if (/^(\d)\1+$/.test(c)) return 'No uses el mismo número repetido: es lo primero que se prueba.'
  const d = c.split('').map(Number)
  const sube = d.every((x, i) => i === 0 || x === (d[i - 1]! + 1) % 10)
  const baja = d.every((x, i) => i === 0 || x === (d[i - 1]! + 9) % 10)
  if (sube || baja) return 'No uses números seguidos (1234, 4321): es lo primero que se prueba.'
  return null
}
