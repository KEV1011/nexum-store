import { describe, expect, it } from 'vitest';
import {
  COMPRA_MAX_KM,
  anclaDeCompra,
  localLejosDeLaEntrega,
  mismoSitio,
  decidirUbicacion,
  kmEntre,
  motivoUbicacionDudosa,
  puntoConfiable,
} from './ubicacion-comercio';

const PAMPLONA = { slug: 'pamplona', lat: 7.3754, lng: -72.6486 };
const EN_PAMPLONA = { lat: 7.379, lng: -72.652 };
// «Calle 5 # 3-40, Colombia» resuelto en Bogotá: el caso que dejaba las
// compras sin repartidor.
const EN_BOGOTA = { lat: 4.6, lng: -74.08 };

describe('qué se guarda del geocodificador', () => {
  it('con la ciudad declarada, un punto dentro de ella se guarda', () => {
    expect(decidirUbicacion(EN_PAMPLONA, PAMPLONA, 'pamplona')).toEqual({
      lat: EN_PAMPLONA.lat, lng: EN_PAMPLONA.lng, citySlug: 'pamplona', descartado: false,
    });
  });

  it('un punto en OTRA ciudad NO se guarda, pero la ciudad sí', () => {
    expect(decidirUbicacion(EN_BOGOTA, PAMPLONA, 'bogota')).toEqual({
      lat: null, lng: null, citySlug: 'pamplona', descartado: true,
    });
  });

  it('sin respuesta del geocodificador queda sin punto y con su ciudad', () => {
    expect(decidirUbicacion(null, PAMPLONA, null)).toEqual({
      lat: null, lng: null, citySlug: 'pamplona', descartado: false,
    });
  });

  it('sin ciudad declarada vale un punto en alguna plaza, y nada fuera de ellas', () => {
    expect(decidirUbicacion(EN_PAMPLONA, null, 'pamplona').lat).toBe(EN_PAMPLONA.lat);
    expect(decidirUbicacion({ lat: 10.4, lng: -75.5 }, null, null)).toMatchObject({ lat: null, descartado: true });
  });

  it('(0,0) es «falta el dato», no un punto en el Golfo de Guinea', () => {
    expect(decidirUbicacion({ lat: 0, lng: 0 }, PAMPLONA, null)).toMatchObject({ lat: null, descartado: false });
  });
});

describe('dónde se busca repartidor para comprar', () => {
  const POR_DEFECTO = { lat: 7.3754, lng: -72.6486 };
  const ENTREGA = { lat: 7.37, lng: -72.64 };

  it('el local, si su punto es de su ciudad', () => {
    expect(anclaDeCompra(EN_PAMPLONA, PAMPLONA, ENTREGA, POR_DEFECTO)).toMatchObject({ origen: 'comercio', ...EN_PAMPLONA });
  });

  it('el local guardado en otra ciudad NO ancla: va al centro de SU ciudad', () => {
    expect(anclaDeCompra(EN_BOGOTA, PAMPLONA, ENTREGA, POR_DEFECTO))
      .toMatchObject({ origen: 'ciudad', lat: PAMPLONA.lat, lng: PAMPLONA.lng });
  });

  it('sin local ni ciudad, la entrega del cliente', () => {
    expect(anclaDeCompra(null, null, ENTREGA, POR_DEFECTO)).toMatchObject({ origen: 'entrega', ...ENTREGA });
  });

  it('sin nada, el valor por defecto, y lo dice', () => {
    expect(anclaDeCompra(null, null, null, POR_DEFECTO)).toMatchObject({ origen: 'desconocido' });
  });

  it('un local sin ciudad declarada pero con punto se da por bueno', () => {
    expect(puntoConfiable(EN_BOGOTA, null)).toBe(true);
    expect(puntoConfiable(EN_BOGOTA, PAMPLONA)).toBe(false);
  });

  // EL HUECO: el local está «bien» contra su propia ciudad —punto en Bogotá,
  // ciudad Bogotá, porque la ciudad se le puso a partir de ese mismo punto— y
  // es un restaurante de Pamplona al que le pide alguien de Pamplona.
  it('local y ciudad en Bogotá, entrega en Pamplona: se busca donde está el cliente', () => {
    const BOGOTA = { lat: 4.711, lng: -74.0721 };
    expect(anclaDeCompra(EN_BOGOTA, BOGOTA, ENTREGA, POR_DEFECTO))
      .toMatchObject({ origen: 'entrega', ...ENTREGA });
  });

  it('local lejos de la entrega y sin ciudad: también la entrega', () => {
    expect(anclaDeCompra(EN_BOGOTA, null, ENTREGA, POR_DEFECTO))
      .toMatchObject({ origen: 'entrega', ...ENTREGA });
  });

  it('un local a distancia de compra sigue anclando en el local', () => {
    const A_8_KM = { lat: ENTREGA.lat + 0.072, lng: ENTREGA.lng };
    expect(kmEntre(A_8_KM, ENTREGA)).toBeLessThan(COMPRA_MAX_KM);
    expect(anclaDeCompra(A_8_KM, PAMPLONA, ENTREGA, POR_DEFECTO)).toMatchObject({ origen: 'comercio' });
  });

  it('sin entrega no hay contra qué medir: se hace lo de antes', () => {
    expect(anclaDeCompra(EN_BOGOTA, null, null, POR_DEFECTO)).toMatchObject({ origen: 'comercio' });
    expect(anclaDeCompra(EN_BOGOTA, PAMPLONA, null, POR_DEFECTO)).toMatchObject({ origen: 'ciudad' });
  });

  it('dice cuándo el punto del local contradice a la entrega', () => {
    expect(localLejosDeLaEntrega(EN_BOGOTA, ENTREGA)).toBe(true);
    expect(localLejosDeLaEntrega(EN_PAMPLONA, ENTREGA)).toBe(false);
    expect(localLejosDeLaEntrega(null, ENTREGA)).toBe(false);
    expect(localLejosDeLaEntrega(EN_BOGOTA, null)).toBe(false);
  });

  it('dos puntos a menos de 300 m son el mismo sitio para el despacho', () => {
    expect(mismoSitio(ENTREGA, { lat: ENTREGA.lat + 0.001, lng: ENTREGA.lng })).toBe(true);
    expect(mismoSitio(ENTREGA, EN_BOGOTA)).toBe(false);
    expect(mismoSitio(ENTREGA, null)).toBe(false);
  });
});

describe('la lista de ubicación dudosa', () => {
  it('nombra el motivo', () => {
    expect(motivoUbicacionDudosa(null, PAMPLONA, 'pamplona')).toBe('sin-punto');
    expect(motivoUbicacionDudosa(EN_PAMPLONA, null, null)).toBe('sin-plaza');
    expect(motivoUbicacionDudosa(EN_BOGOTA, PAMPLONA, 'pamplona')).toBe('lejos-de-su-ciudad');
    expect(motivoUbicacionDudosa(EN_PAMPLONA, PAMPLONA, 'pamplona')).toBeNull();
  });

  it('las distancias tienen sentido (Pamplona–Bogotá ≈ 400 km)', () => {
    const km = kmEntre(PAMPLONA, EN_BOGOTA);
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(450);
  });
});
