import { describe, it, expect } from 'vitest';
import {
  HOLGURA_MINIMA_COP,
  PRESUPUESTO_MAXIMO_COP,
  listaDeCompra,
  motivoParaNoComprar,
  motivoParaNoPedirDirecto,
  presupuestoSugerido,
  sumaReferencial,
  type LineaDeCompra,
} from './comercio-no-reclamado';

const linea = (
  nombre: string, cantidad: number, precioRef: number, notas?: string,
): LineaDeCompra => ({ nombre, cantidad, precioRef, ...(notas ? { notas } : {}) });

describe('qué se puede pedir a un comercio que no es cliente', () => {
  it('a uno reclamado se le pide normal', () => {
    expect(motivoParaNoPedirDirecto({ name: 'Pampero', claimed: true })).toBeNull();
  });

  it('a uno listado por nosotros NO, y se dice qué se puede hacer en su lugar', () => {
    const m = motivoParaNoPedirDirecto({ name: 'Pampero', claimed: false });
    expect(m).not.toBeNull();
    // Lo que no puede faltar: el nombre (para que sepa de cuál habla), que
    // alguien va a ir a comprarlo, y que se cobra lo del recibo. Un «no
    // disponible» a secas deja al cliente sin salida con el carro lleno.
    expect(m).toContain('Pampero');
    expect(m).toMatch(/comprarlo por ti/i);
    expect(m).toMatch(/recibo/i);
  });
});

describe('el presupuesto que se le autoriza al repartidor', () => {
  it('suma la lista a precios de referencia', () => {
    expect(sumaReferencial([linea('Bandeja', 2, 25000), linea('Jugo', 1, 5000)]))
      .toBe(55000);
  });

  it('SIEMPRE queda por encima de la suma', () => {
    // Si fuera exacto, cualquier subida de precio deja al repartidor sin
    // poder pagar, parado en el mostrador con el pedido a medias.
    for (const base of [3000, 12000, 48000, 230000]) {
      expect(presupuestoSugerido([linea('X', 1, base)])).toBeGreaterThan(base);
    }
  });

  it('en una compra pequeña manda el piso en pesos, no el porcentaje', () => {
    // El 12 % de $4.000 son $480 y un pan sube $500: el porcentaje solo no
    // cubre el caso que más se repite.
    const p = presupuestoSugerido([linea('Pan', 1, 4000)]);
    expect(p).toBeGreaterThanOrEqual(4000 + HOLGURA_MINIMA_COP);
  });

  it('en una compra grande manda el porcentaje', () => {
    const base = 200000;
    const p = presupuestoSugerido([linea('Mercado', 1, base)]);
    expect(p).toBeGreaterThan(base + HOLGURA_MINIMA_COP);
  });

  it('se redondea hacia ARRIBA a 500', () => {
    // Hacia abajo sería dejarlo corto justo en la caja; y un presupuesto de
    // $23.480 no se maneja con billetes.
    const p = presupuestoSugerido([linea('Algo', 1, 20970)]);
    expect(p % 500).toBe(0);
    expect(p).toBeGreaterThan(20970);
  });

  it('una lista vacía no estrena un presupuesto', () => {
    expect(presupuestoSugerido([])).toBe(0);
  });
});

describe('lo que se rechaza antes de mandar a nadie a comprar', () => {
  it('una lista vacía', () => {
    expect(motivoParaNoComprar([])).toMatch(/al menos un producto/i);
  });

  it('una cantidad que no es un número', () => {
    expect(motivoParaNoComprar([linea('X', Number.NaN, 1000)])).not.toBeNull();
    expect(motivoParaNoComprar([linea('X', 0, 1000)])).not.toBeNull();
  });

  it('una cantidad que no cabe en una moto', () => {
    const m = motivoParaNoComprar([linea('Gaseosa', 80, 3000)]);
    expect(m).toMatch(/50/);
  });

  it('un presupuesto por encima del tope, DICIENDO el número', () => {
    const m = motivoParaNoComprar([linea('Televisor', 1, PRESUPUESTO_MAXIMO_COP)]);
    expect(m).not.toBeNull();
    // Decir «supera el máximo» sin el número obliga a adivinar cuánto quitar.
    expect(m).toMatch(/1\.500\.000/);
  });

  it('y una lista normal pasa', () => {
    expect(motivoParaNoComprar([linea('Bandeja', 2, 25000)])).toBeNull();
  });
});

describe('la lista que lee el repartidor en el mostrador', () => {
  const texto = listaDeCompra('Sabor Pampero', [
    linea('Bandeja paisa', 2, 25000, 'sin cebolla'),
    linea('Jugo de mora', 1, 5000),
  ]);

  it('nombra el local y cada producto con su cantidad', () => {
    expect(texto).toContain('Sabor Pampero');
    expect(texto).toContain('2 × Bandeja paisa');
    expect(texto).toContain('1 × Jugo de mora');
  });

  it('lleva la nota del cliente: «sin cebolla» es media queja evitada', () => {
    expect(texto).toContain('sin cebolla');
  });

  it('dice que los precios son APROXIMADOS y que mande el recibo', () => {
    // Sin esto, el repartidor discute con el cajero un número que no salió
    // del local sino de una foto de su carta.
    expect(texto).toMatch(/aproximad/i);
    expect(texto).toMatch(/recibo/i);
  });

  it('los pesos van con punto de miles, como en todo el resto', () => {
    expect(texto).toContain('$50.000');
  });
});
