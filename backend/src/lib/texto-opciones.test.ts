import { describe, expect, it } from 'vitest';
import {
  MAX_OPCIONES_POR_GRUPO,
  etiquetaDeGrupo,
  saneaGrupo,
} from './texto-opciones';

const opc = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Opción ${i + 1}`, priceDelta: 0 }));

/** Atajo: devuelve el grupo saneado o lanza, para leer las pruebas de corrido. */
function sano(g: Parameters<typeof saneaGrupo>[0]) {
  const r = saneaGrupo(g);
  if ('error' in r) throw new Error(`esperaba un grupo válido: ${r.error}`);
  return r.grupo;
}

function motivo(g: Parameters<typeof saneaGrupo>[0]): string {
  const r = saneaGrupo(g);
  if (!('error' in r)) throw new Error('esperaba un rechazo');
  return r.error;
}

describe('un grupo que no se puede pedir, no se guarda', () => {
  it('sin nombre', () => {
    expect(motivo({ name: '  ', options: opc(2) })).toMatch(/nombre/i);
  });

  it('sin opciones', () => {
    expect(motivo({ name: 'Tamaño', options: [] })).toMatch(/ninguna opción/i);
    // Una opción con el nombre en blanco no cuenta: en la carta sería un
    // renglón vacío que el cliente no sabe qué está eligiendo.
    expect(motivo({ name: 'Tamaño', options: [{ name: '   ' }] })).toMatch(/ninguna opción/i);
  });

  it('con dos opciones que se llaman igual', () => {
    expect(
      motivo({ name: 'Tamaño', options: [{ name: 'Grande' }, { name: 'GRANDE' }] }),
    ).toMatch(/se llaman igual/i);
  });

  it('con demasiadas opciones', () => {
    expect(motivo({ name: 'Adiciones', options: opc(MAX_OPCIONES_POR_GRUPO + 1) }))
      .toMatch(/demasiadas/i);
  });
});

describe('los números se corrigen hacia el lado que deja el plato pedible', () => {
  it('EL CASO CARO: un mínimo mayor que las opciones haría imposible pedir', () => {
    // Sin esto el grupo se guarda, la carta se ve bien y el pedido se rechaza
    // en la caja con «elige al menos 3» sobre un grupo de 2. El dueño no lo
    // descubre al guardar: lo descubre cuando un cliente no puede comprar.
    const g = sano({ name: 'Salsas', required: true, minSelect: 3, options: opc(2) });
    expect(g.minSelect).toBe(2);
    expect(g.maxSelect).toBeGreaterThanOrEqual(g.minSelect);
  });

  it('un máximo por debajo del mínimo sube el MÁXIMO, no baja el mínimo', () => {
    // Quien escribió «al menos 2» quiso decir eso; bajarlo a 1 cambiaría su
    // regla en silencio.
    const g = sano({ name: 'Salsas', minSelect: 2, maxSelect: 1, options: opc(4) });
    expect(g.minSelect).toBe(2);
    expect(g.maxSelect).toBe(2);
  });

  it('el máximo nunca pasa del número de opciones', () => {
    // «Elige hasta 10» en un grupo de 3 promete algo que la pantalla no tiene.
    expect(sano({ name: 'Adiciones', maxSelect: 10, options: opc(3) }).maxSelect).toBe(3);
  });

  it('marcar obligatorio YA significa al menos una', () => {
    // Es la misma regla que aplica `resolverOpciones` al cobrar: si aquí se
    // guardara min 0, la pantalla diría «opcional» y la caja lo exigiría.
    expect(sano({ name: 'Tamaño', required: true, minSelect: 0, options: opc(2) }).minSelect)
      .toBe(1);
  });

  it('un grupo normal pasa sin que le toquen nada', () => {
    const g = sano({
      name: ' Adiciones ',
      required: false,
      minSelect: 0,
      maxSelect: 10,
      options: [{ name: 'Queso', priceDelta: 3000 }, ...opc(12)],
    });
    expect(g.name).toBe('Adiciones');
    expect(g.maxSelect).toBe(10);
    expect(g.options[0]).toEqual({ name: 'Queso', priceDelta: 3000, isAvailable: true });
  });
});

describe('la frase que se lee en el portal, la app y el QR', () => {
  const et = (required: boolean, minSelect: number, maxSelect: number) =>
    etiquetaDeGrupo({ required, minSelect, maxSelect });

  it('el caso de McDonald\'s: obligatorio, uno solo', () => {
    expect(et(true, 1, 1)).toBe('Obligatorio · elige 1');
  });

  it('el caso de Rappi: opcional, hasta diez', () => {
    expect(et(false, 0, 10)).toBe('Opcional · hasta 10');
  });

  it('un opcional de una sola opción no dice «hasta 1»', () => {
    // Suena a límite y lo único que hay es añadirlo o no.
    expect(et(false, 0, 1)).toBe('Opcional');
  });

  it('obligatorio con rango', () => {
    expect(et(true, 2, 4)).toBe('Obligatorio · elige entre 2 y 4');
    expect(et(true, 3, 3)).toBe('Obligatorio · elige 3');
    expect(et(true, 1, 3)).toBe('Obligatorio · elige hasta 3');
  });

  it('un mínimo mayor que cero es obligatorio aunque no lleve la marca', () => {
    // El dueño que escribe «al menos 1» sin tocar la casilla está diciendo lo
    // mismo, y la caja ya lo trata así.
    expect(et(false, 1, 2)).toMatch(/^Obligatorio/);
  });
});
