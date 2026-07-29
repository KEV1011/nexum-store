import { describe, it, expect } from 'vitest';

/**
 * Reglas de precio y stock que protegen el pedido. Se prueban como funciones
 * puras porque son la parte del cálculo que decide cuánto se cobra y cuándo se
 * bloquea una venta — lo que no puede fallar aunque el resto cambie.
 *
 * Replican exactamente lo que hace `placeClientOrder`.
 */

/** El precio del catálogo es el suelo; el techo evita totales inflados. */
function precioUnitarioSeguro(precioCatalogo: number, enviadoPorCliente: number): number {
  const enviado = Number(enviadoPorCliente) || 0;
  return Math.min(Math.max(precioCatalogo, enviado), precioCatalogo * 3);
}

/** null = el negocio no controla inventario (restaurante). */
function alcanzaStock(stock: number | null, cantidad: number): boolean {
  if (stock === null) return true;
  return stock >= cantidad;
}

describe('precio del pedido — el servidor manda', () => {
  it('ignora un precio manipulado hacia abajo (el agujero que se cerró)', () => {
    // Un cliente enviando unitPrice:1 para un producto de $50.000.
    expect(precioUnitarioSeguro(50000, 1)).toBe(50000);
  });

  it('ignora el cero y los valores basura', () => {
    expect(precioUnitarioSeguro(18000, 0)).toBe(18000);
    expect(precioUnitarioSeguro(18000, -500)).toBe(18000);
    expect(precioUnitarioSeguro(18000, Number.NaN)).toBe(18000);
  });

  it('respeta el recargo de las opciones elegidas', () => {
    // Hamburguesa $18.000 + queso extra $2.000: el cliente manda el total.
    expect(precioUnitarioSeguro(18000, 20000)).toBe(20000);
  });

  it('acota un recargo desorbitado para que tampoco se infle el total', () => {
    expect(precioUnitarioSeguro(10000, 999999)).toBe(30000);
  });

  it('cobra el precio actual aunque el carrito tenga uno viejo más bajo', () => {
    // El negocio subió de $10.000 a $12.000 con el carrito ya armado.
    expect(precioUnitarioSeguro(12000, 10000)).toBe(12000);
  });
});

describe('stock — cuándo se puede vender', () => {
  it('un restaurante (stock null) vende siempre', () => {
    expect(alcanzaStock(null, 1)).toBe(true);
    expect(alcanzaStock(null, 99)).toBe(true);
  });

  it('con inventario, solo si alcanza', () => {
    expect(alcanzaStock(5, 3)).toBe(true);
    expect(alcanzaStock(5, 5)).toBe(true);
    expect(alcanzaStock(5, 6)).toBe(false);
  });

  it('agotado bloquea la venta', () => {
    expect(alcanzaStock(0, 1)).toBe(false);
  });
});
