/**
 * El portal del negocio instalable en el celular (PWA).
 *
 * El manifiesto es de CADA negocio y lo arma `app/negocio/pwa.ts` — TypeScript
 * puro, así que se prueba aquí como `app/moneda.ts`. Lo que vigila:
 *   · que la app instalada abra SU portal y no se salga de él;
 *   · que los íconos que nombra existan con el tamaño que dice (un ícono que
 *     no está hace que Chrome no ofrezca instalar, sin ningún error visible);
 *   · que nadie registre un service worker: un portal de pedidos servido de
 *     una copia vieja enseñaría pedidos que ya no existen.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  COLOR_TEMA,
  ICONO_APPLE,
  manifiestoDeNegocio,
  nombreCorto,
  rutaDelPortal,
} from '../../../app/negocio/pwa';

const RAIZ = path.resolve(__dirname, '../../..');

/** Ancho y alto de un PNG, leídos de su cabecera. */
function tamanoPng(ruta: string): [number, number] {
  const b = fs.readFileSync(ruta);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('el manifiesto de cada negocio', () => {
  const m = manifiestoDeNegocio('tok-abc123', 'Asadero El Fogón');

  it('abre SU portal y no se sale de él', () => {
    expect(m.start_url).toBe('/negocio/tok-abc123');
    // El alcance es un PREFIJO: con barra final, el propio inicio quedaría fuera.
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect('/negocio/tok-abc123/catalogo'.startsWith(m.scope)).toBe(true);
    expect('/negocio/otro-token'.startsWith(m.scope)).toBe(false);
    expect(m.id).toBe(m.start_url);
    expect(m.display).toBe('standalone');
  });

  it('lleva el nombre del local', () => {
    expect(m.name).toBe('Asadero El Fogón · ZIPA');
    expect(m.short_name).toBe('Asadero El');
    expect(m.theme_color).toBe(COLOR_TEMA);
  });

  it('un token raro no rompe la dirección', () => {
    expect(rutaDelPortal('a/b?c')).toBe('/negocio/a%2Fb%3Fc');
  });

  it('sin nombre, uno genérico', () => {
    expect(manifiestoDeNegocio('t', '  ').name).toBe('Mi negocio · ZIPA');
  });

  it('el nombre corto se corta por palabra, nunca por la mitad', () => {
    expect(nombreCorto('Pieros')).toBe('Pieros');
    expect(nombreCorto('Restaurante La Casona')).toBe('Restaurante');
    expect(nombreCorto('Supercalifragilístico')).toBe('Supercalifra');
    for (const n of ['Bar La Esquina del Parque', 'Pizzería Don Mario', 'X']) {
      expect(nombreCorto(n).length).toBeLessThanOrEqual(12);
    }
  });

  it('los íconos que nombra existen con el tamaño que dice', () => {
    const iconos = [...m.icons.map((i) => ({ src: i.src, sizes: i.sizes })), { src: ICONO_APPLE, sizes: '180x180' }];
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of iconos) {
      const [w, h] = tamanoPng(path.join(RAIZ, 'public', i.src));
      expect(`${w}x${h}`, i.src).toBe(i.sizes);
    }
  });
});

describe('las piezas están conectadas', () => {
  const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), 'utf8');

  it('la página declara el manifiesto de su negocio y el ícono de iPhone', () => {
    const layout = leer('app/negocio/[token]/layout.tsx');
    expect(layout).toMatch(/manifest: `\$\{rutaDelPortal\(token\)\}\/manifest\.webmanifest`/);
    expect(layout).toContain('appleWebApp');
    expect(layout).toContain('ICONO_APPLE');
    // Un enlace de portal es la llave del negocio: fuera de los buscadores.
    expect(layout).toMatch(/robots: \{ index: false/);
  });

  it('el manifiesto sale de la función probada, no de una copia', () => {
    const ruta = leer('app/negocio/[token]/manifest.webmanifest/route.ts');
    expect(ruta).toContain('manifiestoDeNegocio(token, nombre)');
    expect(ruta).toContain('application/manifest+json');
  });

  it('nadie registra un service worker que guarde el portal', () => {
    const archivos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(path.join(RAIZ, 'app'));
    const culpables = archivos.filter((f) => /serviceWorker\s*\.\s*register/.test(fs.readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
    expect(fs.existsSync(path.join(RAIZ, 'public', 'sw.js'))).toBe(false);
  });
});
