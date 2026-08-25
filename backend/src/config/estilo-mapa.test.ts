import { describe, it, expect } from 'vitest';
import { ESTILO_MAPA_OSCURO } from './estilo-mapa';

/**
 * El estilo del mapa es un JSON que viaja a Google al abrir la sesión de
 * teselas. Si algo ahí está mal, Google rechaza la sesión, `/geo/tile` falla y
 * las apps caen a OpenStreetMap **sin decir nada**: el mapa se ve, solo que
 * claro y sin que nadie sepa por qué. Estas pruebas cubren esa clase de fallo,
 * y de paso fijan las decisiones de legibilidad para que un retoque futuro no
 * las deshaga sin darse cuenta.
 */

type Styler = Record<string, unknown>;

function colorDe(
  filtro: (e: Record<string, unknown>) => boolean,
): string | undefined {
  const entrada = ESTILO_MAPA_OSCURO.find(filtro);
  const stylers = entrada?.['stylers'] as Styler[] | undefined;
  return stylers?.map((s) => s['color']).find((c): c is string => typeof c === 'string');
}

/** Luminosidad percibida 0-255 (fórmula de Rec. 601). */
function brillo(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

describe('estilo oscuro del mapa', () => {
  it('es JSON serializable sin pérdidas', () => {
    const texto = JSON.stringify(ESTILO_MAPA_OSCURO);
    expect(JSON.parse(texto)).toEqual(JSON.parse(JSON.stringify(ESTILO_MAPA_OSCURO)));
  });

  it('toda entrada lleva stylers y al menos un selector', () => {
    for (const e of ESTILO_MAPA_OSCURO) {
      expect(Array.isArray(e['stylers']), JSON.stringify(e)).toBe(true);
      expect((e['stylers'] as unknown[]).length, JSON.stringify(e)).toBeGreaterThan(0);
      const tieneSelector = 'featureType' in e || 'elementType' in e;
      expect(tieneSelector, JSON.stringify(e)).toBe(true);
    }
  });

  it('todos los colores son #rrggbb', () => {
    for (const e of ESTILO_MAPA_OSCURO) {
      for (const s of e['stylers'] as Styler[]) {
        const c = s['color'];
        if (c === undefined) continue;
        expect(typeof c).toBe('string');
        expect(c as string).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('solo usa stylers que Google entiende', () => {
    const validos = new Set([
      'color', 'visibility', 'weight', 'saturation', 'lightness', 'gamma',
      'hue', 'invert_lightness',
    ]);
    for (const e of ESTILO_MAPA_OSCURO) {
      for (const s of e['stylers'] as Styler[]) {
        for (const k of Object.keys(s)) {
          expect(validos.has(k), `styler desconocido: ${k}`).toBe(true);
        }
      }
    }
  });

  // ── Las decisiones de legibilidad, fijadas ──────────────────────────────────

  it('el suelo es oscuro pero no negro puro', () => {
    const suelo = colorDe((e) => e['elementType'] === 'geometry' && !e['featureType']);
    expect(suelo).toBeDefined();
    const b = brillo(suelo!);
    // Sobre negro puro no se distingue la sombra del vehículo ni la ruta.
    expect(b).toBeGreaterThan(10);
    expect(b).toBeLessThan(80);
  });

  it('las vías son MÁS CLARAS que el suelo, y en tres niveles', () => {
    const suelo = brillo(colorDe((e) => e['elementType'] === 'geometry' && !e['featureType'])!);
    const via = (tipo: string) =>
      brillo(colorDe((e) => e['featureType'] === tipo && e['elementType'] === 'geometry')!);

    const autopista = via('road.highway');
    const arteria = via('road.arterial');
    const local = via('road.local');

    expect(local).toBeGreaterThan(suelo);
    expect(arteria).toBeGreaterThan(local);
    expect(autopista).toBeGreaterThan(arteria);
  });

  it('el agua es más oscura que el suelo', () => {
    const suelo = brillo(colorDe((e) => e['elementType'] === 'geometry' && !e['featureType'])!);
    const agua = brillo(
      colorDe((e) => e['featureType'] === 'water' && e['elementType'] === 'geometry')!,
    );
    expect(agua).toBeLessThan(suelo);
  });

  it('el texto contrasta contra el suelo', () => {
    const suelo = brillo(colorDe((e) => e['elementType'] === 'geometry' && !e['featureType'])!);
    const texto = brillo(colorDe((e) => e['elementType'] === 'labels.text.fill')!);
    // Un mapa oscuro con nombres ilegibles es bonito y no sirve para llegar.
    expect(texto - suelo).toBeGreaterThan(60);
  });

  it('no apaga las etiquetas de texto', () => {
    const apagaTexto = ESTILO_MAPA_OSCURO.some(
      (e) =>
        String(e['elementType'] ?? '').startsWith('labels.text') &&
        (e['stylers'] as Styler[]).some((s) => s['visibility'] === 'off'),
    );
    expect(apagaTexto).toBe(false);
  });
});
