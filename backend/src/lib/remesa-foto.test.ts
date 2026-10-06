import { describe, it, expect } from 'vitest';
import {
  numeroDeRemesa,
  fechaDeRemesa,
  destinatarioDeRemesa,
  leerRemesa,
} from './remesa-foto';

const AHORA = new Date('2026-10-06T12:00:00Z');

describe('numeroDeRemesa', () => {
  it('lo saca cuando el papel lo nombra', () => {
    expect(numeroDeRemesa('REMESA No. 066')).toBe('066');
    expect(numeroDeRemesa('Manifiesto de carga N° MC-9981')).toBe('MC-9981');
    expect(numeroDeRemesa('guía 12345')).toBe('12345');
    expect(numeroDeRemesa('CUENTA DE COBRO 066')).toBe('066');
  });

  it('conserva los ceros a la izquierda', () => {
    // «066» no es «66»: es el consecutivo del cliente y va tal cual a la
    // cuenta de cobro.
    expect(numeroDeRemesa('Remesa: 0042')).toBe('0042');
  });

  it('NO coge cualquier número del papel', () => {
    // Sin esta regla se traería el NIT, el teléfono o el valor del flete.
    expect(numeroDeRemesa('NIT 900123456  Tel 3001112233  Valor 1.800.000'))
      .toBeUndefined();
  });

  it('con DOS números distintos no elige ninguno', () => {
    // Es la regla que de verdad protege: elegir por nuestra cuenta manda un
    // número equivocado a la cuenta de cobro, y eso vuelve tres semanas
    // después como una factura devuelta.
    expect(numeroDeRemesa('REMESA 066\nFACTURA No. 1234')).toBeUndefined();
  });

  it('el mismo número repetido sí cuenta como uno', () => {
    expect(numeroDeRemesa('REMESA 066\n…\nRemesa No 066')).toBe('066');
  });

  it('un solo dígito no es un consecutivo', () => {
    // Casi siempre es una viñeta o un número de página mal leído.
    expect(numeroDeRemesa('Remesa 7')).toBeUndefined();
  });
});

describe('fechaDeRemesa', () => {
  it('día primero, SIEMPRE', () => {
    // En Colombia 03/04/2026 es el 3 de abril. Una convención fija y escrita
    // es mejor que una heurística que cambie el mes sin que nadie lo note.
    expect(fechaDeRemesa('Fecha: 03/04/2026', AHORA)).toBe('2026-04-03');
    expect(fechaDeRemesa('12-09-2026', AHORA)).toBe('2026-09-12');
    expect(fechaDeRemesa('05.02.26', AHORA)).toBe('2026-02-05');
  });

  it('una fecha futura se descarta', () => {
    // El papel ya está en la mano: una remesa fechada mañana es un dedazo y
    // no sirve en un retén.
    expect(fechaDeRemesa('01/12/2026', AHORA)).toBeUndefined();
  });

  it('un día que no existe se descarta', () => {
    expect(fechaDeRemesa('31/02/2026', AHORA)).toBeUndefined();
    expect(fechaDeRemesa('45/01/2026', AHORA)).toBeUndefined();
  });

  it('con VARIAS fechas distintas no elige', () => {
    // Emisión, vencimiento y entrega en el mismo papel: no hay forma de
    // saber cuál es la del documento.
    expect(fechaDeRemesa('Emitida 01/09/2026  Entrega 15/09/2026', AHORA))
      .toBeUndefined();
  });

  it('la misma fecha repetida sí cuenta como una', () => {
    expect(fechaDeRemesa('01/09/2026 … 01/09/2026', AHORA)).toBe('2026-09-01');
  });

  it('un año imposible es una lectura mala', () => {
    expect(fechaDeRemesa('03/04/1902', AHORA)).toBeUndefined();
  });
});

describe('destinatarioDeRemesa', () => {
  it('solo con etiqueta y en la misma línea', () => {
    expect(destinatarioDeRemesa('Destinatario: Almacenes La 14 S.A.'))
      .toBe('Almacenes La 14 S.A.');
    expect(destinatarioDeRemesa('SEÑORES  Distribuidora del Norte'))
      .toBe('Distribuidora del Norte');
  });

  it('sin etiqueta no se adivina', () => {
    // «La línea que parece un nombre» traería el remitente, la
    // transportadora o el conductor, y eso manda la carga a otro sitio.
    expect(destinatarioDeRemesa('Almacenes La 14 S.A.\nCalle 5 # 3-40'))
      .toBeUndefined();
  });

  it('una línea absurdamente larga no es un nombre', () => {
    expect(destinatarioDeRemesa(`Cliente: ${'x'.repeat(200)}`)).toBeUndefined();
  });
});

describe('leerRemesa', () => {
  const PAPEL = [
    'TRANSPORTES DEL NORTE S.A.S.',
    'REMESA TERRESTRE DE CARGA No. 066',
    'Fecha: 01/09/2026',
    'Destinatario: Almacenes La 14 S.A.',
    'Origen: CUCUTA   Destino: BUCARAMANGA',
    '131 rollos',
  ].join('\n');

  it('saca los tres campos de un papel normal', () => {
    const r = leerRemesa(PAPEL, AHORA);
    expect(r.numero).toBe('066');
    expect(r.fechaISO).toBe('2026-09-01');
    expect(r.destinatario).toBe('Almacenes La 14 S.A.');
    expect(r.avisos).toEqual([]);
  });

  it('cada campo que falta lleva SU aviso', () => {
    // Sin el aviso, tres campos vacíos se leen como «el lector está roto» y
    // la persona repite la foto en vez de escribirlos.
    const r = leerRemesa('Papel sin nada reconocible', AHORA);
    expect(r.numero).toBeUndefined();
    expect(r.avisos.length).toBe(2);
    expect(r.avisos.join(' ')).toContain('número');
    expect(r.avisos.join(' ')).toContain('fecha');
  });

  it('una foto sin texto lo dice de otra manera', () => {
    // «No encontramos el número» en una foto negra haría repetir el papel;
    // lo que hay que repetir es la FOTO.
    const r = leerRemesa('   ', AHORA);
    expect(r.avisos.length).toBe(1);
    expect(r.avisos[0]).toContain('luz');
  });

  it('nunca devuelve un campo que no estaba', () => {
    // La invariante de toda esta pieza: ante la duda, vacío.
    const r = leerRemesa('REMESA 066\nFACTURA 1234\n01/09/2026\n15/09/2026', AHORA);
    expect(r.numero).toBeUndefined();
    expect(r.fechaISO).toBeUndefined();
  });
});
