/**
 * Las reglas de la carta del QR, ejercitadas desde aquí.
 *
 * `app/carta/reglas.ts` es TypeScript puro sin JSX, así que se puede importar
 * desde el corredor del backend — mismo patrón que `moneda-portal.test.ts` y
 * `contacto-portal.test.ts`. El portal Next no tiene pruebas propias y estas
 * decisiones se equivocan en silencio: no rompen el build, solo hacen que la
 * carta se vea mal en el teléfono de un comensal.
 */
import { describe, it, expect } from 'vitest';
import { agruparVale, idDeSeccion, seccionConFotos } from '../../../app/carta/reglas';

describe('el ancla de una sección', () => {
  it('sobrevive a tildes, espacios y mayúsculas', () => {
    expect(idDeSeccion('Bebidas frías')).toBe('sec-bebidas-frias');
    expect(idDeSeccion('PLATOS FUERTES')).toBe('sec-platos-fuertes');
  });

  it('un nombre sin letras latinas no deja el id vacío', () => {
    // Con id vacío todos los chips apuntarían al mismo sitio y tocar
    // cualquiera llevaría a la primera sección.
    expect(idDeSeccion('日本料理')).toBe('sec-seccion');
    expect(idDeSeccion('!!!')).toBe('sec-seccion');
  });
});

describe('una sección va con fotos solo si alguna de sus platos la tiene', () => {
  it('con una foto, la sección entera va con fotos', () => {
    expect(seccionConFotos([{ imageUrl: null }, { imageUrl: 'x.jpg' }])).toBe(true);
  });

  it('sin ninguna, va en texto', () => {
    // Una carta cargada por CSV no tiene imágenes, y cincuenta recuadros
    // grises se leen como una carta que no cargó.
    expect(seccionConFotos([{ imageUrl: null }, {}])).toBe(false);
    expect(seccionConFotos([])).toBe(false);
  });
});

describe('agrupar en secciones solo cuando agrupa algo', () => {
  const sec = (n: number) => ({ items: Array.from({ length: n }, () => ({})) });

  it('el caso de la captura: cada plato en su propia sección NO se agrupa', () => {
    // «Caldo de bagre», «Caldo de costilla», «Caldo de huevos», un plato cada
    // una: los chips llevaban a un solo producto y el encabezado repetía el
    // nombre del plato que tenía debajo.
    expect(agruparVale([sec(1), sec(1), sec(1)])).toBe(false);
    expect(agruparVale([sec(1), sec(1), sec(1), sec(1), sec(1)])).toBe(false);
  });

  it('una carta de verdad SÍ se agrupa', () => {
    expect(agruparVale([sec(4), sec(8), sec(5)])).toBe(true);
  });

  it('una sección grande justifica las pequeñas', () => {
    // «Entradas 1 · Fuertes 10 · Bebidas 1»: el promedio es 4 y la sección
    // grande es justo la que hace útil poder saltar.
    expect(agruparVale([sec(1), sec(10), sec(1)])).toBe(true);
  });

  it('diez secciones de uno y una de dos siguen siendo ruido', () => {
    // Por esto la regla es el PROMEDIO y no «¿alguna tiene dos?».
    const muchas = [...Array.from({ length: 10 }, () => sec(1)), sec(2)];
    expect(agruparVale(muchas)).toBe(false);
  });

  it('con una sola sección no hay nada que agrupar', () => {
    expect(agruparVale([sec(20)])).toBe(false);
    expect(agruparVale([])).toBe(false);
  });
});
