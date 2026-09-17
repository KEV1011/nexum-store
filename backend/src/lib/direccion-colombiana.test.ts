import { describe, it, expect } from 'vitest';
import { normalizaDireccion, pareceDireccion } from './direccion-colombiana';

describe('normalizar la dirección como la escribe la gente', () => {
  it('el caso que reportó el usuario: sin espacios alrededor del #', () => {
    // «carrera 4a#10-53» es como está en el recibo de la luz, y así Places no
    // la predice nunca.
    expect(normalizaDireccion('carrera 4a#10-53')).toBe('Carrera 4A # 10-53');
  });

  it('expande las abreviaturas que de verdad se escriben', () => {
    expect(normalizaDireccion('cra 6 # 5-20')).toBe('Carrera 6 # 5-20');
    expect(normalizaDireccion('kra 6 #5-20')).toBe('Carrera 6 # 5-20');
    expect(normalizaDireccion('cl 5 # 3-40')).toBe('Calle 5 # 3-40');
    expect(normalizaDireccion('cll 5 #3-40')).toBe('Calle 5 # 3-40');
    expect(normalizaDireccion('av 0 # 12-30')).toBe('Avenida 0 # 12-30');
    expect(normalizaDireccion('dg 45 # 20-11')).toBe('Diagonal 45 # 20-11');
    expect(normalizaDireccion('tv 9 # 2-15')).toBe('Transversal 9 # 2-15');
  });

  it('acepta «No.», «Nro» y «N°» como marcador de número', () => {
    expect(normalizaDireccion('Calle 5 No. 3-40')).toBe('Calle 5 # 3-40');
    expect(normalizaDireccion('Calle 5 Nro 3-40')).toBe('Calle 5 # 3-40');
    expect(normalizaDireccion('Calle 5 N° 3-40')).toBe('Calle 5 # 3-40');
    expect(normalizaDireccion('Calle 5 numero 3-40')).toBe('Calle 5 # 3-40');
  });

  it('pone el marcador cuando falta del todo', () => {
    // «Carrera 4A 10-53» aparece en letreros; sin el # Google la lee peor.
    expect(normalizaDireccion('Carrera 4A 10-53')).toBe('Carrera 4A # 10-53');
  });

  it('pega el guion de la placa', () => {
    expect(normalizaDireccion('Calle 5 # 3 - 40')).toBe('Calle 5 # 3-40');
  });

  it('la letra de la vía va en mayúscula', () => {
    expect(normalizaDireccion('carrera 4a # 10-53')).toBe('Carrera 4A # 10-53');
    expect(normalizaDireccion('calle 12b # 7-09')).toBe('Calle 12B # 7-09');
  });

  it('es idempotente: lo ya normalizado no cambia', () => {
    const buena = 'Carrera 4A # 10-53';
    expect(normalizaDireccion(buena)).toBe(buena);
    expect(normalizaDireccion(normalizaDireccion('cra 4a#10-53'))).toBe(buena);
  });

  it('conserva lo que va después de la placa', () => {
    expect(normalizaDireccion('cra 4a#10-53 local 2'))
      .toBe('Carrera 4A # 10-53 local 2');
  });

  it('NO toca lo que no parece una dirección: no se inventa una calle', () => {
    // Es mejor que Google no encuentre algo a que nosotros le cambiemos la
    // dirección al negocio.
    expect(normalizaDireccion('Centro Comercial Ventura')).toBe('Centro Comercial Ventura');
    expect(normalizaDireccion('Panadería La Espiga')).toBe('Panadería La Espiga');
  });

  it('el vacío es vacío, no revienta', () => {
    expect(normalizaDireccion('')).toBe('');
    expect(normalizaDireccion('   ')).toBe('');
  });

  it('colapsa los espacios de más', () => {
    expect(normalizaDireccion('  carrera   4a  #  10-53 ')).toBe('Carrera 4A # 10-53');
  });
});

describe('distinguir una dirección del nombre de un sitio', () => {
  it('con vía y número, sí', () => {
    expect(pareceDireccion('carrera 4a#10-53')).toBe(true);
    expect(pareceDireccion('Calle 5 # 3-40')).toBe(true);
    expect(pareceDireccion('cra 6 5-20')).toBe(true);
  });

  it('el nombre de un sitio, no: ahí geocodificar no ayudaría', () => {
    expect(pareceDireccion('Centro Comercial Ventura')).toBe(false);
    expect(pareceDireccion('Panadería La Espiga')).toBe(false);
  });

  it('una vía sin número, no: no hay dónde ir', () => {
    expect(pareceDireccion('carrera cuarta')).toBe(false);
  });

  it('texto demasiado corto, no', () => {
    expect(pareceDireccion('cra')).toBe(false);
    expect(pareceDireccion('')).toBe(false);
  });
});
