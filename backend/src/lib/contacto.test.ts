import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  contactos,
  contactoLegalConfigurado,
  canalDelTitular,
  canalDeSoporte,
  canalDeRetiros,
  BUZON_ZIPA,
} from './contacto';

const VARS = ['SUPPORT_EMAIL', 'PRIVACY_EMAIL', 'LEGAL_EMAIL'];
const guardado: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) {
    guardado[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(() => {
  for (const v of VARS) {
    if (guardado[v] === undefined) delete process.env[v];
    else process.env[v] = guardado[v];
  }
});

describe('las tres direcciones', () => {
  it('sin variables, el buzón real de ZIPA — nunca un hueco', () => {
    // Antes esto devolvía null y la política de privacidad salía sin canal de
    // atención. No hace falta: hay un buzón de verdad, así que el documento se
    // publica completo aunque nadie se acuerde de poner la variable en los dos
    // servicios. Lo que sigue prohibido es imprimir una dirección inventada.
    expect(contactos()).toEqual({
      soporte: BUZON_ZIPA,
      privacidad: BUZON_ZIPA,
      legal: BUZON_ZIPA,
    });
    expect(contactoLegalConfigurado()).toBe(true);
  });

  it('con un solo buzón, las otras dos lo heredan', () => {
    // Es lo razonable con una persona detrás, y evita huecos en los documentos.
    process.env['SUPPORT_EMAIL'] = 'soporte@zipa.co';
    expect(contactos()).toEqual({
      soporte: 'soporte@zipa.co',
      privacidad: 'soporte@zipa.co',
      legal: 'soporte@zipa.co',
    });
    expect(contactoLegalConfigurado()).toBe(true);
  });

  it('las específicas mandan sobre la heredada', () => {
    process.env['SUPPORT_EMAIL'] = 'soporte@zipa.co';
    process.env['PRIVACY_EMAIL'] = 'privacidad@zipa.co';
    process.env['LEGAL_EMAIL'] = 'legal@zipa.co';
    const c = contactos();
    expect(c.privacidad).toBe('privacidad@zipa.co');
    expect(c.legal).toBe('legal@zipa.co');
  });

  it('normaliza espacios y mayúsculas', () => {
    process.env['SUPPORT_EMAIL'] = '  Soporte@ZIPA.co  ';
    expect(contactos().soporte).toBe('soporte@zipa.co');
  });

  it('un valor mal escrito se DESCARTA, no se publica', () => {
    // Una dirección rota dentro de un documento legal es peor que ninguna: el
    // titular escribe, rebota, y queda constancia de que el canal no sirve. Con
    // el valor roto fuera, queda el buzón real en vez de un hueco.
    for (const roto of ['soporte@zipa', 'no es un correo', '@zipa.co']) {
      process.env['SUPPORT_EMAIL'] = roto;
      expect(contactos().soporte, roto).toBe(BUZON_ZIPA);
    }
  });

  it('una dirección específica rota no arrastra a la heredada', () => {
    process.env['SUPPORT_EMAIL'] = 'soporte@zipa.co';
    process.env['PRIVACY_EMAIL'] = 'roto@';
    expect(contactos().privacidad).toBe('soporte@zipa.co');
  });
});

describe('lo que se imprime en los documentos', () => {
  it('con correo, el canal real y la ley que lo respalda', () => {
    process.env['PRIVACY_EMAIL'] = 'privacidad@zipa.co';
    const t = canalDelTitular();
    expect(t).toContain('privacidad@zipa.co');
    expect(t).toContain('1581');
    expect(t).toMatch(/suprimir/i);
  });

  it('sin variables, el buzón real y la ley igualmente', () => {
    // El caso que de verdad se despliega hoy: nadie definió nada y la política
    // tiene que salir con un canal al que se pueda escribir.
    const t = canalDelTitular();
    expect(t).toContain(BUZON_ZIPA);
    expect(t).toContain('1581');
  });

  it('el soporte y los retiros siguen la misma regla', () => {
    expect(canalDeSoporte()).toContain(BUZON_ZIPA);
    expect(canalDeRetiros()).toContain('/legal/takedown');
    expect(canalDeRetiros()).toContain(BUZON_ZIPA);

    process.env['SUPPORT_EMAIL'] = 'soporte@zipa.co';
    expect(canalDeSoporte()).toContain('soporte@zipa.co');
    expect(canalDeRetiros()).toContain('soporte@zipa.co');
  });

  it('nunca aparece un dominio inventado por nosotros', () => {
    // `docs/DMCA_AGENTE.md` llegó a traer un legal@zipa.app que nadie había
    // registrado. Que no vuelva a colarse por aquí.
    for (const f of [canalDelTitular, canalDeSoporte, canalDeRetiros]) {
      expect(f()).not.toContain('zipa.app');
    }
  });
});
