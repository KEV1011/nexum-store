import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prisma mockeado (vi.hoisted para que esté listo antes del vi.mock hoisteado).
const mockPrisma = vi.hoisted(() => ({
  municipality: { findMany: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { plazaDeCoordenadas, invalidarCacheMunicipios } from './municipality.service';

/**
 * La plaza es una ETIQUETA, no un requisito.
 *
 * Resolverla consulta la tabla de municipios, y esa consulta se metió en dos
 * sitios donde antes no había nada de eso: el latido del GPS del conductor y la
 * creación del viaje. Si al fallar la consulta se propagara el error:
 *
 *  - el latido moriría ANTES de escribir la posición ⇒ el conductor
 *    desaparecería del despacho (el filtro de frescura lo saca a los 120 s) y
 *    el pasajero dejaría de ver su coche moverse;
 *  - la solicitud de viaje reventaría entera.
 *
 * Cambiar una avería del panel por una avería del despacho sería un pésimo
 * negocio. Sin plaza el sistema ya sabe funcionar: `null` significa «no se
 * sabe» en todo el diseño, y el panel escribe «—».
 */
describe('resolver la plaza nunca puede tumbar lo que la usa', () => {
  beforeEach(() => {
    invalidarCacheMunicipios();
    mockPrisma.municipality.findMany.mockReset();
  });

  it('si la base falla, devuelve null en vez de lanzar', async () => {
    mockPrisma.municipality.findMany.mockRejectedValue(new Error('conexión caída'));
    await expect(plazaDeCoordenadas(7.3754, -72.6486)).resolves.toBeNull();
  });

  it('con la base sana sí resuelve la plaza', async () => {
    // La otra mitad: que el «no lanza» no se haya conseguido devolviendo
    // siempre null, que pasaría la prueba de arriba sin servir para nada.
    mockPrisma.municipality.findMany.mockResolvedValue([
      { slug: 'pamplona', name: 'Pamplona', department: 'NS', lat: 7.3754, lng: -72.6486, zone: null, commissionRate: null, isActive: true },
    ]);
    await expect(plazaDeCoordenadas(7.3754, -72.6486)).resolves.toBe('pamplona');
  });

  it('unas coordenadas imposibles tampoco lanzan', async () => {
    mockPrisma.municipality.findMany.mockResolvedValue([]);
    await expect(plazaDeCoordenadas(Number.NaN, 0)).resolves.toBeNull();
    await expect(plazaDeCoordenadas(null, null)).resolves.toBeNull();
  });
});
