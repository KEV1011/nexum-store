import { describe, it, expect } from 'vitest';
import {
  motivoParaNoDespachar,
  motivoParaNoAdmitir,
  itemsDeRemito,
  totalBultos,
} from './encomiendas';

const listo = {
  status: 'PREPARING',
  isIntercity: true,
  originCitySlug: 'cucuta',
  destCitySlug: 'bucaramanga',
  tieneRemito: false,
};

describe('qué pedido puede subir a un despacho', () => {
  it('uno intermunicipal y listo, sí', () => {
    expect(motivoParaNoDespachar(listo)).toBeNull();
    expect(motivoParaNoDespachar({ ...listo, status: 'CONFIRMED' })).toBeNull();
  });

  it('un pedido local NO es una encomienda', () => {
    expect(motivoParaNoDespachar({ ...listo, isIntercity: false }))
      .toMatch(/dentro de la ciudad/i);
  });

  it('el que ya va en otro despacho no se sube dos veces', () => {
    // Si se pudiera, dos empresas cobrarían el mismo envío y el cliente
    // recibiría —o no— una caja que nadie sabe en qué bus iba.
    expect(motivoParaNoDespachar({ ...listo, tieneRemito: true }))
      .toMatch(/ya va en otro despacho/i);
  });

  it('el negocio tiene que haberlo aceptado primero', () => {
    // Con PENDING el negocio aún puede rechazarlo por no tener existencias, y
    // el despacho habría comprometido una mercancía que no existe.
    expect(motivoParaNoDespachar({ ...listo, status: 'PENDING' }))
      .toMatch(/todavía no ha aceptado/i);
  });

  it('cancelado y entregado se distinguen en el mensaje', () => {
    expect(motivoParaNoDespachar({ ...listo, status: 'CANCELLED' })).toMatch(/cancelado/i);
    expect(motivoParaNoDespachar({ ...listo, status: 'DELIVERED' })).toMatch(/ya se entregó/i);
  });

  it('sin ciudad de destino resuelta, no', () => {
    expect(motivoParaNoDespachar({ ...listo, destCitySlug: null }))
      .toMatch(/ciudad de destino/i);
  });

  it('un estado de reparto urbano se nombra en vez de aceptarse', () => {
    expect(motivoParaNoDespachar({ ...listo, status: 'IN_TRANSIT' }))
      .toMatch(/IN_TRANSIT/);
  });
});

describe('qué despacho puede llevarlo', () => {
  const despacho = { origen: 'cucuta', destino: 'bucaramanga', editable: true };

  it('mismo origen y mismo destino, sí', () => {
    expect(motivoParaNoAdmitir(listo, despacho)).toBeNull();
  });

  it('NO sube al bus que va a otra ciudad', () => {
    // Es el error caro: el destinatario se entera un día después y en la
    // ciudad equivocada.
    expect(motivoParaNoAdmitir(listo, { ...despacho, destino: 'bogota' }))
      .toMatch(/va a bogota.*bucaramanga/i);
  });

  it('NO sube a un bus que sale de otra ciudad', () => {
    expect(motivoParaNoAdmitir(listo, { ...despacho, origen: 'bogota' }))
      .toMatch(/sale de bogota/i);
  });

  it('un despacho ya salido o facturado no admite carga', () => {
    expect(motivoParaNoAdmitir(listo, { ...despacho, editable: false }))
      .toMatch(/ya salió o ya se facturó/i);
  });

  it('un despacho SIN destino declarado no se rechaza', () => {
    // Hay flotas que declaran el destino después de llenar el bus. Solo se
    // exige coincidencia de lo que se sabe.
    expect(motivoParaNoAdmitir(listo, { origen: null, destino: null, editable: true }))
      .toBeNull();
  });
});

describe('los bultos del remito', () => {
  it('un renglón por producto, con la cantidad como medida', () => {
    // Un renglón por producto es lo que permite conciliar «me llegaron 2 de 3».
    expect(itemsDeRemito([
      { productName: 'Camiseta negra', quantity: 3, sku: 'CAM-001' },
      { productName: 'Gorra', quantity: 1 },
    ])).toEqual([
      { position: 1, measure: 3, code: 'CAM-001', note: 'Camiseta negra' },
      { position: 2, measure: 1, code: null, note: 'Gorra' },
    ]);
  });

  it('un bulto nunca mide cero, porque sería inconciliable', () => {
    expect(itemsDeRemito([{ productName: 'X', quantity: 0 }])[0].measure).toBe(1);
    expect(itemsDeRemito([{ productName: 'X', quantity: -4 }])[0].measure).toBe(1);
  });

  it('el código vacío se guarda como ausente, no como cadena vacía', () => {
    expect(itemsDeRemito([{ productName: 'X', quantity: 1, sku: '  ' }])[0].code)
      .toBeNull();
  });

  it('suma los bultos para sellarlos al despachar', () => {
    expect(totalBultos(itemsDeRemito([
      { productName: 'A', quantity: 3 },
      { productName: 'B', quantity: 2 },
    ]))).toBe(5);
  });

  it('sin líneas, cero', () => {
    expect(totalBultos([])).toBe(0);
  });
});
