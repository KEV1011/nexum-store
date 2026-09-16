import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'fs';

import { formatCOP, formatNumero } from '../../../app/moneda';

/**
 * El formateador de pesos de los DOS portales web.
 *
 * Vive en `app/` pero se prueba desde aquí porque es donde corre vitest, y el
 * fichero es TypeScript puro sin nada de Next — se importa igual que cualquier
 * otro módulo, tal como `dockerfiles.test.ts` lee ficheros de fuera de `src/`.
 *
 * Lo que vigila, y por qué: el precio estaba copiado en DIECISIETE sitios entre
 * `/empresa` y `/negocio`, y las copias ya habían divergido — once daban
 * «$ 5.200» (con espacio, el patrón de moneda de es-CO) y una «$5.200». La
 * segunda prueba es la que impide que vuelvan a aparecer.
 */
describe('pesos del portal', () => {
  it('el peso va PEGADO al número, sin espacio', () => {
    // `Intl.NumberFormat('es-CO', {style:'currency'})` mete un espacio
    // duro entre el símbolo y la cifra. En Colombia se escribe «$5.200».
    expect(formatCOP(5200)).toBe('$5.200');
    expect(formatCOP(5200)).not.toContain(' ');
  });

  it('el punto separa los miles', () => {
    expect(formatCOP(1250000)).toBe('$1.250.000');
  });

  it('sin centavos: un precio se redondea', () => {
    expect(formatCOP(8700.4)).toBe('$8.700');
    expect(formatCOP(0)).toBe('$0');
  });

  it('un importe ausente vale «$0» y no tumba la página', () => {
    // Dos pantallas lo llaman con campos opcionales (el valor de un flete que
    // todavía no se ha puesto). `undefined.toLocaleString()` reventaría.
    expect(formatCOP(undefined)).toBe('$0');
    expect(formatCOP(null)).toBe('$0');
    expect(formatCOP(Number.NaN)).toBe('$0');
  });

  it('los kilos y los bultos NO llevan peso', () => {
    // Poner «$» en 18.000 kg diría que son pesos.
    expect(formatNumero(18000)).toBe('18.000');
    expect(formatNumero(124.5)).toBe('124,5');
    expect(formatNumero(undefined)).toBe('0');
  });
});

describe('una sola definición', () => {
  it('ningún archivo del portal vuelve a formatear pesos por su cuenta', () => {
    // Esta es la que de verdad importa. Diecisiete copias no se escribieron a
    // propósito: se fueron acumulando porque copiar tres líneas es más rápido
    // que buscar el helper, y así fue como el mismo panel acabó enseñando el
    // precio de dos maneras según la pestaña.
    const raiz = join(__dirname, '..', '..', '..', 'app');
    const archivos = globSync('**/*.{ts,tsx}', { cwd: raiz }) as string[];
    const infractores: string[] = [];
    for (const rel of archivos) {
      if (rel === 'moneda.ts') continue;
      const texto = readFileSync(join(raiz, rel), 'utf8');
      texto.split('\n').forEach((linea, i) => {
        if (linea.trim().startsWith('*') || linea.trim().startsWith('//')) return;
        if (/currency:\s*'COP'/.test(linea)) {
          infractores.push(`${rel}:${i + 1}  ${linea.trim()}`);
        }
      });
    }
    expect(infractores, `Usa formatCOP de app/moneda.ts:\n${infractores.join('\n')}`)
      .toEqual([]);
  });
});
