import { describe, it, expect } from 'vitest';
import { veredictoPush, type EntradaVeredictoPush } from './veredicto-push';

const base: EntradaVeredictoPush = {
  activo: true,
  conductoresTotal: 10,
  conductoresConToken: 10,
  enviados: 50,
  fallidos: 0,
  ultimoError: null,
};

describe('el veredicto del push', () => {
  it('con todo en orden lo dice', () => {
    expect(veredictoPush(base)).toMatch(/operativo/i);
  });

  it('sin credenciales explica la CONSECUENCIA, no solo el estado', () => {
    // «apagado» a secas no le dice al operador qué pierde.
    const v = veredictoPush({ ...base, activo: false });
    expect(v).toMatch(/app abierta/i);
  });

  it('CERO tokens NO se reporta como operativo', () => {
    // Este es el caso que justifica todo el sondeo: /health diría "firebase"
    // y no llegaría un solo aviso.
    const v = veredictoPush({ ...base, conductoresConToken: 0 });
    expect(v).not.toMatch(/operativo/i);
    expect(v).toMatch(/NINGÚN conductor/);
    // Y dice qué mirar, que es lo que convierte el diagnóstico en acción.
    expect(v).toMatch(/google-services\.json/);
  });

  it('cobertura parcial: dice CUÁNTOS faltan', () => {
    const v = veredictoPush({ ...base, conductoresTotal: 10, conductoresConToken: 6 });
    expect(v).toContain('4 conductor');
    expect(v).not.toMatch(/operativo/i);
  });

  it('con la base vacía no acusa a nadie', () => {
    // «Ningún conductor tiene token» es cierto pero inútil si no hay ninguno.
    const v = veredictoPush({ ...base, conductoresTotal: 0, conductoresConToken: 0 });
    expect(v).not.toMatch(/NINGÚN conductor/);
    expect(v).toMatch(/todavía no hay conductores/i);
  });

  it('si TODO falla, eso manda sobre la cobertura', () => {
    // Credenciales o proyecto equivocado afecta también a los que sí tienen
    // token, así que es lo primero que hay que leer.
    const v = veredictoPush({
      ...base, enviados: 0, fallidos: 12, ultimoError: 'SenderId mismatch',
    });
    expect(v).toContain('SenderId mismatch');
  });

  it('y sin detalle del error no se inventa uno', () => {
    const v = veredictoPush({ ...base, enviados: 0, fallidos: 3, ultimoError: null });
    expect(v).toContain('sin detalle');
    expect(v).not.toContain('null');
  });
});
