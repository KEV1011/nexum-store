import { describe, it, expect } from 'vitest';
import {
  faltantesParaRndc,
  listoParaRndc,
  saneaConstanciaRndc,
  exigirRndcParaDespachar,
  RndcInvalido,
  type DatosDespacho,
} from './rndc';

const COMPLETO: DatosDespacho = {
  nitEmpresa: '900123456',
  placa: 'WXY123',
  documentoConductor: '1090123456',
  licenciaConductor: 'LIC-7788',
  daneOrigen: '54001',
  daneDestino: '68001',
  remitente: 'Jorge Bodeguero',
  destinatario: 'Almacenes La 14 S.A.',
  pesoKg: 18000,
  descripcionCarga: 'Rollos de tela',
  valorFlete: 2_500_000,
  valorPagoConductor: 1_900_000,
};

describe('faltantesParaRndc', () => {
  it('un despacho completo no tiene faltantes', () => {
    expect(faltantesParaRndc(COMPLETO)).toEqual([]);
    expect(listoParaRndc(COMPLETO)).toBe(true);
  });

  it('un despacho vacío los lista TODOS', () => {
    // Importa que los diga todos de una vez: arreglar uno, volver a pulsar y
    // que aparezca el siguiente es el formulario que la gente abandona.
    const f = faltantesParaRndc({});
    expect(f.length).toBeGreaterThanOrEqual(10);
    expect(listoParaRndc({})).toBe(false);
  });

  it('cada faltante dice DÓNDE se arregla, no el nombre del campo', () => {
    // Quien lee esto es un despachador con el camión cargado: «falta
    // documentoConductor» no le dice a qué pantalla ir.
    //
    // Se prohíbe el nombre TÉCNICO, no la palabra: «Añade el destinatario»
    // es castellano correcto aunque el campo se llame igual. Lo que no
    // puede salir es el camelCase.
    for (const x of faltantesParaRndc({})) {
      expect(x.queHacer.length).toBeGreaterThan(15);
      if (/[a-z][A-Z]/.test(x.campo)) {
        expect(x.queHacer).not.toContain(x.campo);
      }
      // Una frase, no una etiqueta: empieza en mayúscula y termina en punto.
      expect(x.queHacer[0]).toBe(x.queHacer[0]!.toUpperCase());
      expect(x.queHacer.endsWith('.')).toBe(true);
    }
  });

  it('el código DANE se pide a ZIPA, no al despachador', () => {
    // Es nuestro pendiente: mandarlo a buscar un código que el portal
    // debería saber sería echarle encima un trabajo que no es suyo.
    const f = faltantesParaRndc({ ...COMPLETO, daneOrigen: null });
    expect(f).toHaveLength(1);
    expect(f[0]!.queHacer.toLowerCase()).toContain('avísanos');
  });

  it('un cero no es un valor declarado', () => {
    // Un flete en cero pasa cualquier comprobación de «campo presente» y el
    // RNDC lo rechaza; aquí se caza antes.
    expect(faltantesParaRndc({ ...COMPLETO, valorFlete: 0 })).toHaveLength(1);
    expect(faltantesParaRndc({ ...COMPLETO, pesoKg: 0 })).toHaveLength(1);
    expect(faltantesParaRndc({ ...COMPLETO, valorPagoConductor: 0 })).toHaveLength(1);
  });

  it('una cadena de espacios tampoco', () => {
    expect(faltantesParaRndc({ ...COMPLETO, placa: '   ' })).toHaveLength(1);
  });

  it('se pide lo que se le paga al CONDUCTOR, aparte del flete', () => {
    // Son dos cifras distintas y el RNDC pide las dos: el flete es lo que
    // cobra la empresa, el pago es lo que recibe quien maneja.
    const f = faltantesParaRndc({ ...COMPLETO, valorPagoConductor: null });
    expect(f.map((x) => x.campo)).toEqual(['valorPagoConductor']);
  });
});

describe('saneaConstanciaRndc', () => {
  it('guarda los dos números tal cual', () => {
    const c = saneaConstanciaRndc({ remesa: ' R-0099 ', manifiesto: 'M-114455' });
    expect(c).toEqual({ remesa: 'R-0099', manifiesto: 'M-114455' });
  });

  it('medio reporte NO es una constancia', () => {
    // Guardar solo uno haría que el viaje figurara como reportado cuando no
    // lo está, y esa es justo la constancia que falla el día que la piden.
    expect(() => saneaConstanciaRndc({ remesa: 'R-1' })).toThrow(RndcInvalido);
    expect(() => saneaConstanciaRndc({ manifiesto: 'M-1' })).toThrow(RndcInvalido);
    expect(() => saneaConstanciaRndc({})).toThrow(RndcInvalido);
    expect(() => saneaConstanciaRndc(null)).toThrow(RndcInvalido);
  });

  it('el mismo número dos veces es un pegado por error', () => {
    expect(() => saneaConstanciaRndc({ remesa: 'X-9', manifiesto: 'X-9' }))
      .toThrow(RndcInvalido);
  });

  it('un pegado accidental no entra entero', () => {
    const c = saneaConstanciaRndc({
      remesa: 'R'.repeat(200), manifiesto: 'M'.repeat(200),
    });
    expect(c.remesa.length).toBe(40);
  });
});

describe('exigirRndcParaDespachar', () => {
  it('apagado por defecto', () => {
    // Encenderlo hoy pararía camiones cargados de empresas que reportan en
    // el portal del Ministerio y anotan el número después.
    const antes = process.env['RNDC_EXIGIR'];
    delete process.env['RNDC_EXIGIR'];
    expect(exigirRndcParaDespachar()).toBe(false);
    process.env['RNDC_EXIGIR'] = 'true';
    expect(exigirRndcParaDespachar()).toBe(true);
    process.env['RNDC_EXIGIR'] = 'si';
    expect(exigirRndcParaDespachar()).toBe(false);
    if (antes === undefined) delete process.env['RNDC_EXIGIR'];
    else process.env['RNDC_EXIGIR'] = antes;
  });
});
