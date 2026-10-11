/**
 * La guarda del lector de códigos de barras del catálogo.
 *
 * Vive en el backend por lo mismo que `ui-portal-negocio.test.ts` y
 * `moneda-portal.test.ts`: el portal Next.js no tiene corredor de pruebas, y
 * `tsc` y `next build` cazan un tipo mal puesto pero no que la cámara no abra
 * en un iPhone.
 *
 * EL DEFECTO QUE SE VIGILA. El escáner usaba solo `BarcodeDetector`, la API
 * nativa, y **Safari en iOS no la implementa**: en un iPhone caía directo a
 * «escribe el código a mano», que es justo lo que el escáner venía a evitar.
 * Volver a poner el atajo —`window.BarcodeDetector ?? null` dentro del
 * componente— es una línea, compila, pasa `next build`, y **el síntoma solo se
 * ve con un teléfono en la mano**, que es exactamente el tipo de fallo que
 * necesita una guarda y no un comentario.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CATALOGO = join(__dirname, '..', '..', '..', 'app', 'negocio', '[token]', 'catalogo');
const lee = (f: string) => readFileSync(join(CATALOGO, f), 'utf8');

const ESCANER = lee('BarcodeScanner.tsx');
const LECTOR = lee('lector-codigos.ts');

describe('el escáner no vuelve a atarse a la API nativa', () => {
  it('el componente NO menciona `BarcodeDetector`: el lector lo elige el módulo', () => {
    // Si vuelve a aparecer aquí, el iPhone se queda sin cámara otra vez.
    expect(ESCANER).not.toMatch(/BarcodeDetector/);
  });

  it('y pide el lector por la única puerta', () => {
    expect(ESCANER).toMatch(/obtenerLector\(\)/);
  });
});

describe('el lector por JavaScript', () => {
  it('va por CDN con la versión FIJADA', () => {
    // Un `@latest` convierte el escáner de la tienda en algo que puede cambiar
    // de comportamiento un martes sin que nadie toque el repo. Mismo criterio
    // que el cargador del QR y el de Leaflet.
    const url = LECTOR.match(/'(https:\/\/cdn\.jsdelivr\.net\/[^']+)'/)?.[1] ?? '';
    expect(url).not.toBe('');
    expect(url).toMatch(/@\d+\.\d+\.\d+\//);
    expect(url).not.toMatch(/@latest/);
  });

  it('se carga una sola vez aunque se abra el escáner diez veces', () => {
    expect(LECTOR).toMatch(/if \(cargando\) return cargando/);
  });

  it('y olvida la promesa fallida, para poder reintentar con mala conexión', () => {
    expect(LECTOR).toMatch(/cargando = null/);
  });
});

describe('las dos reglas que se rompen sin que se note', () => {
  it('el bucle respeta `intervaloMs` del lector', () => {
    // Sin esto, el camino por JavaScript decodifica en el hilo principal a cada
    // fotograma y traba la vista de la cámara justo en el teléfono de gama baja
    // que es el que lo necesita.
    expect(ESCANER).toMatch(/lector\.intervaloMs/);
    expect(ESCANER).toMatch(/setTimeout\(escanear, lector\.intervaloMs\)/);
  });

  it('escribir el código a mano NO depende de que la cámara falle', () => {
    // Un código rayado o arrugado no lo lee ningún lector, así que el camino
    // manual se queda visible siempre. Si alguien lo envuelve en
    // `estado === 'manual' && (…)`, el dueño queda encerrado con un código que
    // la cámara no puede leer.
    const i = ESCANER.indexOf('<form onSubmit={enviarManual}');
    expect(i).toBeGreaterThan(0);
    const antes = ESCANER.slice(Math.max(0, i - 300), i);
    expect(antes).not.toMatch(/estado/);
  });
});
