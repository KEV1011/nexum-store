import { describe, expect, it } from 'vitest';
import { TransportType } from '@prisma/client';
import {
  SERVICIOS_PROGRAMABLES,
  serviciosQuePuedeTomar,
  tiposVehiculoParaServicio,
} from './reservas.service';

/**
 * La misma regla, leída en dos direcciones.
 *
 * El TABLERO pregunta «dado este conductor, qué reservas ve»
 * (`serviciosQuePuedeTomar`). El AVISO pregunta «dada esta reserva, a quién se
 * le dice» (`tiposVehiculoParaServicio`). Si cada una tuviera su propia tabla,
 * acabarían discrepando en el caso raro: a un conductor se le avisaría de una
 * reserva que su tablero no le muestra —toca el aviso y no encuentra nada— o al
 * revés, una reserva visible de la que nunca se le avisó. Las dos cosas se ven
 * como que la función está rota, y ninguna la cazaría el compilador.
 */
const TIPOS_DE_FLOTA = [
  'TAXI', 'PARTICULAR', 'MOTO', 'TURBO', 'CAMION', 'MULA', 'VAN', 'BUSETA',
];

describe('el tablero y el aviso dicen lo mismo', () => {
  it('un vehículo atiende un servicio si y solo si el servicio lo lista a él', () => {
    for (const tipo of TIPOS_DE_FLOTA) {
      const puedeTomar = serviciosQuePuedeTomar(tipo);
      for (const servicio of SERVICIOS_PROGRAMABLES) {
        const loListan = tiposVehiculoParaServicio(servicio).includes(tipo);
        expect(
          puedeTomar.includes(servicio),
          `${tipo} ↔ ${servicio}: el tablero dice ${puedeTomar.includes(servicio)} `
          + `y el aviso ${loListan}`,
        ).toBe(loListan);
      }
    }
  });

  it('un taxi atiende taxi y envíos, no las otras categorías', () => {
    const s = serviciosQuePuedeTomar('TAXI');
    expect(s).toContain(TransportType.TAXI);
    expect(s).toContain(TransportType.ENVIOS);
    expect(s).not.toContain(TransportType.PARTICULAR);
    expect(s).not.toContain(TransportType.MOTO);
  });

  it('los envíos los puede hacer cualquier vehículo', () => {
    // No tienen categoría de tarifa declarada, así que no hay nada que
    // prometerle al pasajero sobre en qué llega su paquete — igual que en el
    // despacho, que tampoco filtra.
    for (const tipo of TIPOS_DE_FLOTA) {
      expect(serviciosQuePuedeTomar(tipo)).toContain(TransportType.ENVIOS);
      expect(tiposVehiculoParaServicio(TransportType.ENVIOS)).toContain(tipo);
    }
  });

  it('sin vehículo activo no se atiende nada', () => {
    // Es lo que hace que el tablero devuelva su aviso («Registra tu vehículo»)
    // en vez de una lista vacía que se lee como «no hay trabajo».
    expect(serviciosQuePuedeTomar(null)).toEqual([]);
  });

  it('un tipo de vehículo desconocido no atiende categorías', () => {
    // Si mañana entra un tipo nuevo a la flota, no hereda por descuido las
    // categorías de pasajeros: hay que declararlo en su tarifa.
    const s = serviciosQuePuedeTomar('SUBMARINO');
    expect(s).not.toContain(TransportType.TAXI);
    expect(s).not.toContain(TransportType.MOTO);
  });
});
