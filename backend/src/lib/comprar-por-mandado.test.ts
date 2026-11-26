/**
 * El pedido a un local que no es aliado sale SOLO como compra por mandado.
 *
 * La app no le enseña al cliente «no está recibiendo pedidos» (lee eso, cierra
 * y no vuelve): con el código del rechazo, o con la marca de la cotización,
 * convierte el mismo carrito en la compra. Son tres piezas en tres sitios que
 * nada ata entre sí —el error del servicio, la ruta que lo devuelve y la app
 * que lo lee—, y si una se separa el cliente vuelve a ver el rechazo sin que
 * ninguna prueba de unidad lo note.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  CODIGO_COMPRAR_POR_MANDADO,
  ComercioSinPortalError,
} from './comercio-no-reclamado';

const raiz = join(__dirname, '..', '..', '..');
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');

describe('comprar por mandado', () => {
  it('el rechazo de la caja lleva el código', () => {
    expect(new ComercioSinPortalError('x').code).toBe(CODIGO_COMPRAR_POR_MANDADO);
    expect(leer('backend/src/services/client.service.ts'))
      .toContain('throw new ComercioSinPortalError(motivo)');
  });

  it('la ruta de pedidos devuelve el código y la cotización la marca', () => {
    const rutas = leer('backend/src/routes/client.routes.ts');
    expect(rutas).toMatch(/\.\.\.\(typeof code === 'string' \? \{ code \} : \{\}\)/);
    expect(rutas).toContain('comprarPorMandado: biz.claimed === false');
  });

  it('la app espera el MISMO código y la misma marca', () => {
    expect(leer('AppCliente/lib/features/cart/data/compra_api.dart'))
      .toContain(`kCodigoComprarPorMandado = '${CODIGO_COMPRAR_POR_MANDADO}'`);
    expect(leer('AppCliente/lib/features/cart/data/envio_api.dart'))
      .toContain("j['comprarPorMandado']");
    const checkout = leer('AppCliente/lib/features/cart/presentation/screens/checkout_screen.dart');
    expect(checkout).toContain('on ComprarPorMandado');
    expect(checkout).toContain('if (_porMandado)');
  });
});
