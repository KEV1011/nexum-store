import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OrderStatus } from '@prisma/client';
import { NOMBRE_ESTADO_PEDIDO, nombreEstadoPedido } from './estado-pedido';

describe('el estado que le llega a la app', () => {
  it('todos los estados del enum tienen nombre', () => {
    // El compilador ya lo exige (el mapa es Record<OrderStatus,…>), pero esta
    // prueba lo dice en castellano cuando falla.
    const sinTraducir = Object.values(OrderStatus).filter(
      (e) => !NOMBRE_ESTADO_PEDIDO[e],
    );
    expect(sinTraducir).toEqual([]);
  });

  it('ninguno se queda con el nombre crudo de la base', () => {
    // Este es el fallo real: `IN_INTERCITY_TRANSIT` caía a un respaldo que
    // devolvía `in_intercity_transit`, la app no lo reconocía y el cliente veía
    // «Confirmado» con su paquete ya en el bus. Un nombre con guion bajo o en
    // mayúsculas significa que alguien volvió a olvidarse.
    const crudos = Object.entries(NOMBRE_ESTADO_PEDIDO).filter(
      ([, nombre]) => nombre.includes('_') || /[A-Z]/.test(nombre[0]!),
    );
    expect(crudos).toEqual([]);
  });

  it('el nombre es camelCase, que es como se llama el enum de Dart', () => {
    expect(nombreEstadoPedido('IN_INTERCITY_TRANSIT')).toBe('inIntercityTransit');
    expect(nombreEstadoPedido('AT_DESTINATION_HUB')).toBe('atDestinationHub');
    expect(nombreEstadoPedido('DRIVER_TO_PICKUP')).toBe('driverToPickup');
    expect(nombreEstadoPedido('DELIVERED')).toBe('delivered');
  });

  it('un estado desconocido no revienta', () => {
    expect(nombreEstadoPedido('LO_QUE_SEA')).toBe('lo_que_sea');
  });

  it('cada nombre existe en el enum de la app cliente', () => {
    // La comprobación que de verdad importa: los dos lados tienen que coincidir
    // y viven en repos de lenguajes distintos, así que nada los ata salvo esto.
    const dart = readFileSync(
      join(
        __dirname,
        '../../../AppCliente/lib/features/orders/domain/entities/customer_order_entity.dart',
      ),
      'utf8',
    );
    const bloque = /enum CustomerOrderStatus\s*\{([^}]*)\}/.exec(dart);
    expect(bloque, 'no se encontró el enum en la app cliente').not.toBeNull();

    // Los comentarios se quitan ANTES de partir por comas: un comentario del
    // enum lleva una coma dentro («Distinto de [inTransit], que es…») y al
    // revés el trozo queda partido y el valor siguiente se pierde. Es la misma
    // trampa que ya está anotada para el parser de `copyWith`.
    const valoresDart = new Set(
      bloque![1]!
        .replace(/\/\/.*$/gm, '')
        .split(',')
        .map((l) => l.trim())
        .filter((l) => /^[a-z][A-Za-z]*$/.test(l)),
    );

    const huerfanos = Object.values(NOMBRE_ESTADO_PEDIDO).filter(
      (n) => !valoresDart.has(n),
    );
    expect(
      huerfanos,
      'el backend manda estados que la app no conoce: caerán a su `orElse`',
    ).toEqual([]);
  });
});
