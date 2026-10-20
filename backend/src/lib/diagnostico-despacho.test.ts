import { describe, expect, it } from 'vitest';

import { motivoDeDiagnostico } from './diagnostico-despacho';

const listo = {
  status: 'ONLINE', enViajeVacio: false, isVerified: true, bloqueado: false,
  acceptsKind: true, tipo: 'order' as const, geoAge: 10, fresh: true, dist: 800, inRadius: true,
};

describe('motivo por el que un conductor no recibiría la oferta', () => {
  it('cumpliéndolo todo, no hay motivo: recibiría la oferta', () => {
    expect(motivoDeDiagnostico(listo)).toBeNull();
  });

  it('el interruptor de encargos apagado SÍ cuenta (antes salía como «recibiría»)', () => {
    expect(motivoDeDiagnostico({ ...listo, acceptsKind: false })).toMatch(/Encargos \(pedidos\)/);
    expect(motivoDeDiagnostico({ ...listo, acceptsKind: false, tipo: 'trip' })).toMatch(/Pasajeros/);
  });

  it('«en viaje» sin nada abierto se distingue de un servicio de verdad', () => {
    expect(motivoDeDiagnostico({ ...listo, status: 'ON_TRIP', enViajeVacio: true }))
      .toMatch(/sin ningún servicio abierto/);
    expect(motivoDeDiagnostico({ ...listo, status: 'ON_TRIP', enViajeVacio: false }))
      .toMatch(/En un servicio/);
  });

  it('dice el PRIMER filtro que falla, en el orden del despacho', () => {
    expect(motivoDeDiagnostico({ ...listo, status: 'OFFLINE', isVerified: false })).toBe('Desconectado');
    expect(motivoDeDiagnostico({ ...listo, isVerified: false, acceptsKind: false })).toBe('No verificado');
    expect(motivoDeDiagnostico({ ...listo, bloqueado: true, fresh: false })).toBe('Documentos vencidos');
  });

  it('GPS viejo y fuera de radio llevan su número', () => {
    expect(motivoDeDiagnostico({ ...listo, fresh: false, geoAge: 600 })).toMatch(/hace 10 min/);
    expect(motivoDeDiagnostico({ ...listo, inRadius: false, dist: 7300 })).toMatch(/7\.3 km/);
    expect(motivoDeDiagnostico({ ...listo, geoAge: null, dist: null, fresh: false, inRadius: false }))
      .toMatch(/Nunca/);
  });
});
