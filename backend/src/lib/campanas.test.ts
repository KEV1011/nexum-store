import { describe, expect, it } from 'vitest';
import {
  CampanaError,
  campanaVigente,
  estadoCampana,
  fechaColombia,
  filtroProductosVisibles,
  finDelDiaColombia,
  inicioDelDiaColombia,
  ordenarItemsDeCampana,
  productoVisible,
  saneaCampana,
} from './campanas';

// Burger Show: del 27 de noviembre al 3 de diciembre, en Pamplona.
const BURGER = {
  active: true,
  startsAt: inicioDelDiaColombia('2026-11-27'),
  endsAt: finDelDiaColombia('2026-12-03'),
};
const en = (iso: string) => new Date(iso);

describe('vigencia de la campaña (hora de Colombia)', () => {
  it('abre a las 00:00 del 27 en Pamplona, no a las 7 p. m. del 26', () => {
    expect(campanaVigente(BURGER, en('2026-11-26T23:30:00-05:00'))).toBe(false);
    expect(campanaVigente(BURGER, en('2026-11-27T00:00:00-05:00'))).toBe(true);
  });

  it('el último día cuenta entero: a las 9 p. m. del 3 sigue vigente', () => {
    expect(campanaVigente(BURGER, en('2026-12-03T21:00:00-05:00'))).toBe(true);
    expect(campanaVigente(BURGER, en('2026-12-04T00:00:01-05:00'))).toBe(false);
  });

  it('distingue próxima, vigente, terminada y apagada', () => {
    expect(estadoCampana(BURGER, en('2026-11-20T12:00:00Z'))).toBe('proxima');
    expect(estadoCampana(BURGER, en('2026-11-30T12:00:00Z'))).toBe('vigente');
    expect(estadoCampana(BURGER, en('2026-12-10T12:00:00Z'))).toBe('terminada');
    expect(estadoCampana({ ...BURGER, active: false }, en('2026-11-30T12:00:00Z'))).toBe('apagada');
  });

  it('la fecha que se le enseña al admin es la de Colombia', () => {
    expect(fechaColombia(BURGER.startsAt)).toBe('2026-11-27');
    expect(fechaColombia(BURGER.endsAt)).toBe('2026-12-03');
  });
});

describe('qué productos existen para el cliente', () => {
  const dentro = en('2026-11-30T20:00:00-05:00');
  const despues = en('2026-12-10T20:00:00-05:00');

  it('un producto sin campaña existe siempre', () => {
    expect(productoVisible({ campaignOnly: true, campaign: null }, despues)).toBe(true);
  });

  it('la hamburguesa especial solo existe durante el evento', () => {
    const especial = { campaignOnly: true, campaign: BURGER };
    expect(productoVisible(especial, dentro)).toBe(true);
    expect(productoVisible(especial, despues)).toBe(false);
    expect(productoVisible(especial, en('2026-11-20T12:00:00Z'))).toBe(false);
  });

  it('un producto de siempre inscrito en la campaña no desaparece al terminar', () => {
    expect(productoVisible({ campaignOnly: false, campaign: BURGER }, despues)).toBe(true);
  });

  it('apagar la campaña esconde lo especial aunque esté en fechas', () => {
    expect(productoVisible({ campaignOnly: true, campaign: { ...BURGER, active: false } }, dentro))
      .toBe(false);
  });

  it('el filtro de la consulta dice lo mismo que la regla', () => {
    // Evalúa el filtro de Prisma a mano sobre los mismos casos: si alguien
    // cambia uno y no el otro, la carta y la caja dejarían de coincidir.
    const casos = [
      { campaignId: null, campaignOnly: true, campaign: null },
      { campaignId: 'c', campaignOnly: false, campaign: BURGER },
      { campaignId: 'c', campaignOnly: true, campaign: BURGER },
      { campaignId: 'c', campaignOnly: true, campaign: { ...BURGER, active: false } },
    ];
    for (const ahora of [dentro, despues]) {
      const f = filtroProductosVisibles(ahora);
      for (const p of casos) {
        const pasa = f.OR.some((cond) => {
          if ('campaignId' in cond) return p.campaignId === cond.campaignId;
          if ('campaignOnly' in cond) return p.campaignOnly === cond.campaignOnly;
          const c = p.campaign;
          return !!c && c.active === cond.campaign.active
            && c.startsAt <= cond.campaign.startsAt.lte
            && c.endsAt >= cond.campaign.endsAt.gte;
        });
        expect(pasa).toBe(productoVisible(p, ahora));
      }
    }
  });
});

describe('lo que escribe el admin', () => {
  const ok = { title: 'Burger Show', desde: '2026-11-27', hasta: '2026-12-03', citySlug: 'Pamplona' };

  it('acepta el Burger Show y corta los días en hora de Colombia', () => {
    const s = saneaCampana(ok);
    expect(s.title).toBe('Burger Show');
    expect(s.citySlug).toBe('pamplona');
    expect(s.startsAt.toISOString()).toBe('2026-11-27T05:00:00.000Z');
    expect(s.endsAt.toISOString()).toBe('2026-12-04T04:59:59.999Z');
    expect(s.active).toBe(true);
  });

  it('un evento de un solo día es válido', () => {
    expect(() => saneaCampana({ ...ok, hasta: ok.desde })).not.toThrow();
  });

  it('rechaza fechas al revés, ilegibles o una duración absurda', () => {
    expect(() => saneaCampana({ ...ok, hasta: '2026-11-26' })).toThrow(CampanaError);
    expect(() => saneaCampana({ ...ok, desde: '27/11/2026' })).toThrow(/inicio/);
    expect(() => saneaCampana({ ...ok, hasta: '2026-02-30' })).toThrow(/fin/);
    expect(() => saneaCampana({ ...ok, hasta: '2027-12-03' })).toThrow(/62 días/);
  });

  it('rechaza nombre vacío y color mal escrito', () => {
    expect(() => saneaCampana({ ...ok, title: ' ' })).toThrow(/nombre/);
    expect(() => saneaCampana({ ...ok, color: 'rojo' })).toThrow(/color/);
    expect(saneaCampana({ ...ok, color: '#e53935' }).color).toBe('#E53935');
  });
});

describe('orden de la sección', () => {
  it('primero lo que se puede pedir, luego la promoción, luego el precio', () => {
    const items = [
      { nombre: 'Cerrada en promo', recibiendo: false, descuentoPct: 40, precio: 10000 },
      { nombre: 'Normal barata', recibiendo: true, precio: 15000 },
      { nombre: 'Promo 20', recibiendo: true, descuentoPct: 20, precio: 25000 },
      { nombre: 'Promo 30', recibiendo: true, descuentoPct: 30, precio: 30000 },
      { nombre: 'Normal cara', recibiendo: true, precio: 28000 },
    ];
    expect(ordenarItemsDeCampana(items).map((i) => i.nombre)).toEqual([
      'Promo 30', 'Promo 20', 'Normal barata', 'Normal cara', 'Cerrada en promo',
    ]);
  });
});
