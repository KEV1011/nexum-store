import { describe, it, expect } from 'vitest';
import {
  esEfectivo,
  efectivoDelTurno,
  electronicoDelTurno,
  esperadoEnCaja,
  diferenciaDeCaja,
  veredictoDeCaja,
  motivoParaNoAbrir,
  motivoParaNoCerrar,
  avisosAlCerrar,
} from './caja';
import { MODOS, seDespacha, etiquetaDeModo } from './modo-pedido';

describe('la caja del turno', () => {
  describe('qué entra al cajón', () => {
    it('el efectivo sí', () => {
      expect(esEfectivo('efectivo')).toBe(true);
      expect(esEfectivo('EFECTIVO')).toBe(true);
      expect(esEfectivo(' efectivo ')).toBe(true);
    });

    it('lo electrónico NO: esa plata no está en el cajón', () => {
      // Es LA regla. Meterlo daría un faltante enorme todos los días y a la
      // semana nadie miraría el arqueo.
      expect(esEfectivo('nequi')).toBe(false);
      expect(esEfectivo('tarjeta')).toBe(false);
      expect(esEfectivo('en_linea')).toBe(false);
      expect(esEfectivo('bre_b')).toBe(false);
    });

    it('sin método declarado se asume efectivo', () => {
      // En un restaurante lo que no se anota es lo que se pagó en la mano.
      // Darlo por electrónico haría que la caja esperara menos de lo que
      // tiene y el sobrante parecería un error del cajero.
      expect(esEfectivo(null)).toBe(true);
    });

    it('un método nuevo y desconocido NO se da por efectivo', () => {
      // Si se tratara «lo que no reconozco» como efectivo, un medio nuevo
      // empezaría a sumar al esperado sin que nadie lo decidiera.
      expect(esEfectivo('qr-banco-nuevo')).toBe(false);
    });

    it('separa los dos totales', () => {
      const cobros = [
        { monto: 50000, metodo: 'efectivo' },
        { monto: 30000, metodo: 'nequi' },
        { monto: 20000, metodo: null },
      ];
      expect(efectivoDelTurno(cobros)).toBe(70000);
      expect(electronicoDelTurno(cobros)).toBe(30000);
    });
  });

  describe('el esperado', () => {
    it('es la base más lo cobrado en efectivo', () => {
      const cobros = [{ monto: 86000, metodo: 'efectivo' }, { monto: 40000, metodo: 'tarjeta' }];
      expect(esperadoEnCaja(100000, cobros)).toBe(186000);
    });

    it('sin ventas es solo la base', () => {
      expect(esperadoEnCaja(100000, [])).toBe(100000);
    });
  });

  describe('la diferencia', () => {
    it('cuadra cuando coincide', () => {
      expect(diferenciaDeCaja(186000, 186000)).toBe(0);
      expect(veredictoDeCaja(0).estado).toBe('cuadra');
    });

    it('un faltante se dice con su palabra, no con un signo', () => {
      const d = diferenciaDeCaja(166000, 186000);
      expect(d).toBe(-20000);
      const v = veredictoDeCaja(d);
      expect(v.estado).toBe('falta');
      expect(v.texto).toMatch(/faltan/i);
    });

    it('un sobrante también se dice', () => {
      expect(veredictoDeCaja(diferenciaDeCaja(190000, 186000)).estado).toBe('sobra');
    });

    it('se redondea al peso', () => {
      // El cajero cuenta billetes, no céntimos. Un 0,3 arrastrado de un
      // cálculo haría que NINGÚN arqueo cuadrara nunca.
      expect(diferenciaDeCaja(186000.3, 186000)).toBe(0);
    });
  });

  describe('abrir y cerrar', () => {
    it('no se abren dos cajas', () => {
      // Dos abiertas reparten las ventas entre dos arqueos: ninguno cuadra,
      // y el faltante de una es el sobrante de la otra.
      expect(motivoParaNoAbrir(false)).toBeNull();
      expect(motivoParaNoAbrir(true)).toMatch(/ya hay una caja abierta/i);
    });

    it('no se cierra sin contar', () => {
      // Cerrar «a ojo» daría una diferencia inventada, peor que no tener la
      // función.
      expect(motivoParaNoCerrar({ cerrada: false, contado: null })).toMatch(/cuenta el efectivo/i);
      expect(motivoParaNoCerrar({ cerrada: false, contado: -5 })).toMatch(/cuenta el efectivo/i);
      expect(motivoParaNoCerrar({ cerrada: false, contado: 0 })).toBeNull();
    });

    it('no se cierra dos veces', () => {
      expect(motivoParaNoCerrar({ cerrada: true, contado: 1000 })).toMatch(/ya está cerrada/i);
    });

    it('las mesas abiertas AVISAN pero no bloquean', () => {
      // El turno de la mañana deja mesas al de la tarde todos los días; el
      // cajero no puede quedarse hasta que el último cliente pague.
      expect(avisosAlCerrar(0)).toEqual([]);
      expect(avisosAlCerrar(1)[0]).toMatch(/1 mesa sin cobrar/i);
      expect(avisosAlCerrar(3)[0]).toMatch(/3 mesas sin cobrar/i);
      // Y no son un motivo para no cerrar.
      expect(motivoParaNoCerrar({ cerrada: false, contado: 100 })).toBeNull();
    });
  });
});

describe('los modos de pedido', () => {
  it('solo el domicilio se despacha a un repartidor', () => {
    // La trampa que esto evita: con la guarda vieja (`mode !== 'DINE_IN'`),
    // añadir «para llevar» habría hecho que el local pagara una carrera por
    // un pedido que el cliente viene a recoger al mostrador.
    expect(seDespacha('DELIVERY')).toBe(true);
    expect(seDespacha('DINE_IN')).toBe(false);
    expect(seDespacha('TAKEAWAY')).toBe(false);
  });

  it('solo el domicilio cobra domicilio', () => {
    expect(MODOS.DELIVERY.cobraDomicilio).toBe(true);
    expect(MODOS.DINE_IN.cobraDomicilio).toBe(false);
    expect(MODOS.TAKEAWAY.cobraDomicilio).toBe(false);
  });

  it('para llevar NO usa mesa: se paga y se va, no acumula rondas', () => {
    expect(MODOS.TAKEAWAY.usaMesa).toBe(false);
    expect(MODOS.DINE_IN.usaMesa).toBe(true);
  });

  it('la cocina lo nombra por lo que es', () => {
    expect(etiquetaDeModo('TAKEAWAY')).toBe('Para llevar');
    expect(etiquetaDeModo('DELIVERY')).toBe('Domicilio');
    expect(etiquetaDeModo('DINE_IN', 'Terraza 2')).toBe('Mesa Terraza 2');
  });

  it('sin mesa sellada no se inventa un número', () => {
    expect(etiquetaDeModo('DINE_IN', null)).toBe('En el local');
  });

  it('la tabla cubre TODOS los modos', () => {
    // Si alguien añade un modo al enum sin decidir sus rasgos, el
    // `Record<OrderMode, …>` no compila. Esto comprueba que siguen los tres.
    expect(Object.keys(MODOS).sort()).toEqual(['DELIVERY', 'DINE_IN', 'TAKEAWAY']);
  });
});
