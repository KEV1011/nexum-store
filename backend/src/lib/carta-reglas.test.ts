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
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  agruparVale, idDeSeccion, partirNombrePlato, precioDesde, seccionConFotos,
} from '../../../app/carta/reglas';

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

describe('«Desde» cuando el precio de la lista no es el que se paga', () => {
  const tamano = {
    required: true,
    options: [{ priceDelta: 0 }, { priceDelta: 41000 }],
  };
  const adiciones = { required: false, options: [{ priceDelta: 3000 }] };

  it('una variante OBLIGATORIA que cuesta más: sí', () => {
    // El caso del dueño: la misma picada a 39.000 / 46.000 / 80.000.
    expect(precioDesde({ optionGroups: [tamano] })).toBe(true);
  });

  it('un grupo OPCIONAL no lo cambia', () => {
    // Quien no añade nada paga el precio de la lista: poner «Desde» ahí haría
    // dudar de un precio que es exacto.
    expect(precioDesde({ optionGroups: [adiciones] })).toBe(false);
  });

  it('un grupo obligatorio SIN recargo tampoco', () => {
    // «Elige la salsa» es obligatorio y todas cuestan igual.
    expect(precioDesde({
      optionGroups: [{ required: true, options: [{ priceDelta: 0 }, { priceDelta: 0 }] }],
    })).toBe(false);
  });

  it('un plato sin opciones, nunca', () => {
    expect(precioDesde({ optionGroups: [] })).toBe(false);
  });

  it('basta UN grupo obligatorio con recargo entre varios', () => {
    expect(precioDesde({ optionGroups: [adiciones, tamano] })).toBe(true);
  });
});

/**
 * La MISMA regla en la app del cliente.
 *
 * No se puede compartir código entre Dart y TypeScript, y esto no es una
 * duplicación cualquiera: el comensal sentado con el QR y el que pide desde el
 * teléfono están mirando el mismo plato del mismo local. Que uno vea «Desde
 * $39.000» y el otro «$39.000» es la clase de contradicción que se descubre
 * discutiendo el precio en la mesa.
 *
 * LO QUE ESTO NO PUEDE CAZAR, y queda escrito para que nadie se confíe: es una
 * comprobación sobre el TEXTO del getter de Dart, no sobre lo que hace. Pilla
 * las dos derivas realistas —que alguien quite el `required` (y entonces unas
 * adiciones opcionales pondrían «Desde») o cambie el `> 0` por `>= 0` (y lo
 * pondría en todo plato con variantes)—, no una reescritura entera.
 */
describe('la app del cliente decide igual', () => {
  const DART = join(
    __dirname, '..', '..', '..', 'AppCliente', 'lib', 'features', 'businesses',
    'domain', 'entities', 'business_entity.dart',
  );

  it('el getter `precioDesde` existe en la entidad del producto', () => {
    expect(readFileSync(DART, 'utf8')).toContain('bool get precioDesde');
  });

  it('y exige lo mismo: grupo obligatorio y alguna opción que cuesta más', () => {
    const fuente = readFileSync(DART, 'utf8');
    const desde = fuente.indexOf('bool get precioDesde');
    // El cuerpo acaba en el primer `;` de nivel: es una expresión `=>`.
    const cuerpo = fuente.slice(desde, fuente.indexOf(';', desde));
    expect(cuerpo).toMatch(/\.required\b/);
    expect(cuerpo).toMatch(/priceDelta\s*>\s*0/);
    expect(cuerpo).not.toMatch(/priceDelta\s*>=\s*0/);
  });
});

describe('el nombre del plato, separado de lo que trae', () => {
  // La MISMA tabla la prueba la app (`nombre_plato_test.dart`): si una de
  // las dos reglas cambia sola, el QR y la app partirían distinto el mismo
  // plato.
  const casos = JSON.parse(
    readFileSync(join(__dirname, '../../../app/carta/nombre-plato-casos.json'), 'utf8'),
  ) as { nombre: string; descripcion: string; titulo: string; detalle: string }[];

  it.each(casos)('$nombre', (c) => {
    expect(partirNombrePlato(c.nombre, c.descripcion)).toEqual({ titulo: c.titulo, detalle: c.detalle });
  });
});
