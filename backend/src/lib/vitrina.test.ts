import { describe, it, expect } from 'vitest';
import {
  porcentajeDescuento,
  saneaPrecioAntes,
  promoDeTienda,
  saneaPromoTienda,
  rankingMasPedido,
  DESCUENTO_MAXIMO_PCT,
} from './vitrina';

describe('la vitrina no puede prometer lo que la caja no cobra', () => {
  describe('precio tachado', () => {
    it('calcula el porcentaje como se enseña, entero', () => {
      expect(porcentajeDescuento(16000, 30000)).toBe(47);
      expect(porcentajeDescuento(18750, 25000)).toBe(25);
    });

    it('sin precio anterior NO hay insignia', () => {
      expect(porcentajeDescuento(16000, null)).toBeNull();
      expect(porcentajeDescuento(16000, undefined)).toBeNull();
    });

    it('un «antes» menor o igual no es descuento, es un error de captura', () => {
      expect(porcentajeDescuento(16000, 16000)).toBeNull();
      expect(porcentajeDescuento(16000, 12000)).toBeNull();
    });

    it('una rebaja que redondea a 0 % se calla', () => {
      // 10.000 → 9.999 no merece una insignia roja gritando «oferta».
      expect(porcentajeDescuento(9999, 10000)).toBeNull();
    });

    describe('lo que el dueño escribe', () => {
      it('acepta el número con puntos y signo de pesos', () => {
        // El punto de «$30.000» es separador de MILES. Leerlo como decimal
        // convierte treinta mil pesos en treinta, y el guard de «tiene que ser
        // mayor» lo rechazaría dejando al dueño sin entender nada.
        expect(saneaPrecioAntes(16000, '$30.000')).toBe(30000);
        expect(saneaPrecioAntes(16000, '30.000')).toBe(30000);
        expect(saneaPrecioAntes(16000, 30000)).toBe(30000);
        expect(saneaPromoTienda('1.250.000', '100.000')).toEqual({
          minimo: 1250000, descuento: 100000,
        });
      });

      it('vacío significa «sin descuento»', () => {
        expect(saneaPrecioAntes(16000, null)).toBeNull();
        expect(saneaPrecioAntes(16000, '')).toBeNull();
      });

      it('RECHAZA el precio anterior al revés, diciendo los dos números', () => {
        // El error típico: escribir el de oferta en la casilla del anterior.
        expect(() => saneaPrecioAntes(30000, 16000)).toThrow(/MAYOR/);
        expect(() => saneaPrecioAntes(30000, 16000)).toThrow(/16.000/);
      });

      it('RECHAZA un descuento increíble, que es publicidad engañosa', () => {
        // Un «-97 %» no es una oferta, es un precio anterior inventado, y eso
        // en Colombia lo sanciona la SIC.
        expect(() => saneaPrecioAntes(1000, 100000)).toThrow(/engañoso/i);
        expect(saneaPrecioAntes(1000, 10000)).toBe(10000); // -90 %, justo el tope
        expect(DESCUENTO_MAXIMO_PCT).toBe(90);
      });
    });
  });

  describe('promoción de la tienda', () => {
    it('mientras falta, dice cuánto falta y no descuenta nada', () => {
      const p = promoDeTienda(24000, 30000, 6000)!;
      expect(p.aplica).toBe(false);
      expect(p.descuento).toBe(0);
      expect(p.falta).toBe(6000);
      expect(p.progreso).toBeCloseTo(0.8);
    });

    it('al alcanzar el mínimo, descuenta', () => {
      const p = promoDeTienda(30000, 30000, 6000)!;
      expect(p.aplica).toBe(true);
      expect(p.descuento).toBe(6000);
      expect(p.falta).toBe(0);
      expect(p.progreso).toBe(1);
    });

    it('sin promoción configurada no hay banner', () => {
      expect(promoDeTienda(50000, null, null)).toBeNull();
      // Media promoción tampoco: un mínimo sin descuento no descuenta.
      expect(promoDeTienda(50000, 30000, null)).toBeNull();
      expect(promoDeTienda(50000, null, 6000)).toBeNull();
    });

    it('una promoción que regala el pedido no se anuncia', () => {
      expect(promoDeTienda(50000, 30000, 30000)).toBeNull();
      expect(promoDeTienda(50000, 30000, 40000)).toBeNull();
    });

    it('el descuento JAMÁS deja el pedido en negativo', () => {
      // Aunque una configuración vieja quedara mal, el cobro tiene que
      // sostenerse: cobrar menos que cero es devolverle plata a alguien.
      for (const sub of [0, 1, 100, 5000, 29999, 30000, 100000]) {
        const p = promoDeTienda(sub, 30000, 6000);
        if (p === null) continue;
        expect(p.descuento).toBeLessThanOrEqual(sub);
        expect(p.descuento).toBeGreaterThanOrEqual(0);
      }
    });

    it('la barra nunca pasa del 100 %', () => {
      expect(promoDeTienda(90000, 30000, 6000)!.progreso).toBe(1);
    });

    describe('lo que el dueño configura', () => {
      it('acepta el número escrito con puntos', () => {
        expect(saneaPromoTienda('30.000', '$6.000')).toEqual({ minimo: 30000, descuento: 6000 });
      });

      it('las dos vacías = quitar la promoción', () => {
        expect(saneaPromoTienda(null, null)).toEqual({ minimo: null, descuento: null });
        expect(saneaPromoTienda('', '')).toEqual({ minimo: null, descuento: null });
      });

      it('RECHAZA media promoción', () => {
        expect(() => saneaPromoTienda(30000, null)).toThrow(/las dos/i);
        expect(() => saneaPromoTienda(null, 6000)).toThrow(/las dos/i);
      });

      it('RECHAZA regalar el pedido', () => {
        expect(() => saneaPromoTienda(30000, 30000)).toThrow(/menor/i);
      });
    });
  });

  describe('lo más pedido', () => {
    const muchos = new Map([['a', 12], ['b', 7], ['c', 3]]);

    it('ordena por unidades y numera los puestos', () => {
      const r = rankingMasPedido(muchos);
      expect(r[0]).toEqual({ productId: 'a', unidades: 12, puesto: 1 });
      expect(r[1]!.productId).toBe('b');
      expect(r[2]!.puesto).toBe(3);
    });

    it('SIN ventas suficientes no rankea nada', () => {
      // Es la misma regla que la retención: un «#1 más pedido» sobre tres
      // unidades solo dice qué compró la última persona que entró.
      expect(rankingMasPedido(new Map([['a', 2], ['b', 1]]))).toEqual([]);
    });

    it('un empate se resuelve igual en cada consulta', () => {
      // Sin desempate estable, dos platos empatados se turnarían el «#1» en
      // cada recarga y el dueño creería que la app está rota.
      const empate = new Map([['zzz', 10], ['aaa', 10]]);
      const uno = rankingMasPedido(empate);
      const dos = rankingMasPedido(empate);
      expect(uno.map((r) => r.productId)).toEqual(dos.map((r) => r.productId));
      expect(uno[0]!.productId).toBe('aaa');
    });

    it('solo los primeros: «#37 más pedido» no es un argumento', () => {
      const carta = new Map(Array.from({ length: 40 }, (_, i) => [`p${i}`, 40 - i]));
      expect(rankingMasPedido(carta).length).toBe(5);
    });

    it('los productos sin ventas no entran', () => {
      const r = rankingMasPedido(new Map([['a', 20], ['b', 0]]));
      expect(r.map((x) => x.productId)).toEqual(['a']);
    });
  });
});
