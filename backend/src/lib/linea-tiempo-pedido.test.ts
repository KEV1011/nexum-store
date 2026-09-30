import { describe, it, expect } from 'vitest';
import {
  lineaDeTiempoPedido,
  plantillaDePasos,
  type EstadoPedidoBD,
  type EventoPedido,
  type FormaDelPedido,
} from './linea-tiempo-pedido';

const CREADO = new Date('2026-03-10T14:00:00Z');
const ev = (status: EstadoPedidoBD, min: number): EventoPedido => ({
  status,
  at: new Date(CREADO.getTime() + min * 60_000),
});

const base: FormaDelPedido = {
  status: 'PREPARING',
  dineIn: false,
  intercity: false,
  lastMile: false,
  createdAt: CREADO,
};

const claves = (f: FormaDelPedido, e: EventoPedido[] = []) =>
  lineaDeTiempoPedido(f, e).map((p) => p.clave);

describe('qué pasos tiene cada forma de pedido', () => {
  it('el domicilio urbano pasa por el repartidor', () => {
    expect(plantillaDePasos(base).map((p) => p.clave)).toEqual([
      'realizado', 'confirmado', 'preparando', 'recogiendo', 'reparto', 'entregado',
    ]);
  });

  it('el pedido en mesa NO promete un repartidor que no existe', () => {
    const pasos = plantillaDePasos({ ...base, dineIn: true });
    expect(pasos.map((p) => p.clave)).not.toContain('reparto');
    expect(pasos.at(-1)!.titulo).toContain('mesa');
  });

  it('la encomienda en taquilla termina en la taquilla, sin reparto', () => {
    const pasos = plantillaDePasos({ ...base, intercity: true });
    expect(pasos.map((p) => p.clave)).toContain('en_ruta_ciudad');
    expect(pasos.map((p) => p.clave)).not.toContain('reparto');
  });

  it('la encomienda a la puerta añade el tramo de destino', () => {
    const pasos = plantillaDePasos({ ...base, intercity: true, lastMile: true });
    expect(pasos.map((p) => p.clave)).toEqual([
      'realizado', 'confirmado', 'preparando', 'en_ruta_ciudad',
      'en_destino', 'reparto', 'entregado',
    ]);
  });

  it('la ciudad de destino se nombra cuando se sabe, y si no se dice sin ella', () => {
    const con = plantillaDePasos({
      ...base, intercity: true, ciudadDestino: 'Bucaramanga',
    });
    expect(con.find((p) => p.clave === 'en_ruta_ciudad')!.titulo)
      .toBe('En camino a Bucaramanga');

    // Sin nombre NO se escribe el slug ni se deja el hueco: se dice de otra
    // forma. «En camino a san-jose-de-cucuta» no es el nombre de nada.
    const sin = plantillaDePasos({ ...base, intercity: true });
    expect(sin.find((p) => p.clave === 'en_ruta_ciudad')!.titulo)
      .toBe('En camino a la otra ciudad');
  });
});

describe('las horas', () => {
  it('cada paso lleva la hora de SU evento', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'PREPARING' },
      [ev('PENDING', 0), ev('PREPARING', 4)],
    );
    const preparando = linea.find((p) => p.clave === 'preparando')!;
    expect(preparando.at).toBe(new Date(CREADO.getTime() + 4 * 60_000).toISOString());
    expect(preparando.estado).toBe('actual');
  });

  it('un paso que no ocurrió NO hereda la hora de otro', () => {
    // La regla que impide la mentira más fácil: rellenar el hueco con la
    // hora del paso anterior. El cliente cuenta desde ahí.
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'PREPARING' },
      [ev('PENDING', 0), ev('PREPARING', 4)],
    );
    expect(linea.find((p) => p.clave === 'reparto')!.at).toBeNull();
    expect(linea.find((p) => p.clave === 'entregado')!.at).toBeNull();
  });

  it('se queda con el PRIMER instante de cada estado, no el último', () => {
    // Si un pedido vuelve a un estado, lo que le interesa al cliente es
    // cuándo llegó ahí por primera vez.
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'PREPARING' },
      [ev('PREPARING', 4), ev('PREPARING', 30)],
    );
    expect(linea.find((p) => p.clave === 'preparando')!.at)
      .toBe(new Date(CREADO.getTime() + 4 * 60_000).toISOString());
  });

  it('sin bitácora, solo el primer paso tiene hora — y es la real', () => {
    // Los pedidos anteriores a la tabla de eventos. Se usa `createdAt`, que
    // sí se conoce; los demás quedan sin hora en vez de con una inventada.
    const linea = lineaDeTiempoPedido({ ...base, status: 'DELIVERED' }, []);
    expect(linea.find((p) => p.clave === 'realizado')!.at).toBe(CREADO.toISOString());
    expect(linea.find((p) => p.clave === 'preparando')!.at).toBeNull();
  });
});

describe('qué está cumplido y qué falta', () => {
  it('un paso sin registro pero con uno POSTERIOR registrado está cumplido', () => {
    // Nadie marca `AT_PICKUP` si el repartidor recogió y arrancó en el mismo
    // minuto. Sin esta regla la línea queda con un agujero en medio de un
    // pedido ya entregado, y eso se lee como que algo falló.
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'DELIVERED' },
      [ev('PENDING', 0), ev('DELIVERED', 40)],
    );
    for (const p of linea) {
      expect(p.estado, `${p.clave} debería estar cumplido o ser el actual`)
        .not.toBe('pendiente');
    }
  });

  it('lo que viene después del estado actual queda pendiente', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'PREPARING' },
      [ev('PREPARING', 4)],
    );
    expect(linea.find((p) => p.clave === 'reparto')!.estado).toBe('pendiente');
    expect(linea.find((p) => p.clave === 'entregado')!.estado).toBe('pendiente');
  });

  it('hay exactamente un paso ACTUAL mientras el pedido vive', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'IN_TRANSIT' },
      [ev('PENDING', 0), ev('PREPARING', 4), ev('IN_TRANSIT', 20)],
    );
    expect(linea.filter((p) => p.estado === 'actual')).toHaveLength(1);
    expect(linea.find((p) => p.estado === 'actual')!.clave).toBe('reparto');
  });

  it('recogiendo cubre los dos estados del repartidor en el local', () => {
    for (const s of ['DRIVER_TO_PICKUP', 'AT_PICKUP'] as EstadoPedidoBD[]) {
      const linea = lineaDeTiempoPedido({ ...base, status: s }, [ev(s, 10)]);
      expect(linea.find((p) => p.estado === 'actual')!.clave).toBe('recogiendo');
    }
  });
});

describe('cancelado', () => {
  it('conserva lo que SÍ pasó y añade el final', () => {
    // Vaciar la línea al cancelar deja al cliente sin poder ver que su
    // pedido se preparó antes de caerse.
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'CANCELLED' },
      [ev('PENDING', 0), ev('PREPARING', 4), ev('CANCELLED', 12)],
    );
    expect(linea.map((p) => p.clave)).toEqual([
      'realizado', 'confirmado', 'preparando', 'cancelado',
    ]);
    expect(linea.at(-1)!.at)
      .toBe(new Date(CREADO.getTime() + 12 * 60_000).toISOString());
  });

  it('no deja pasos en gris debajo: sugerirían que todavía van a pasar', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'CANCELLED' },
      [ev('PENDING', 0), ev('CANCELLED', 3)],
    );
    expect(linea.some((p) => p.estado === 'pendiente')).toBe(false);
  });

  it('un cancelado sin bitácora no pierde el primer paso', () => {
    const linea = lineaDeTiempoPedido({ ...base, status: 'CANCELLED' }, []);
    expect(linea.map((p) => p.clave)).toEqual(['realizado', 'cancelado']);
    expect(linea[0]!.at).toBe(CREADO.toISOString());
    expect(linea[1]!.at).toBeNull();
  });
});

describe('robustez', () => {
  it('un estado desconocido no revienta la línea', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'LO_QUE_SEA' as EstadoPedidoBD },
      [],
    );
    expect(linea.length).toBeGreaterThan(0);
  });

  it('los eventos desordenados se ordenan solos', () => {
    const linea = lineaDeTiempoPedido(
      { ...base, status: 'DELIVERED' },
      [ev('DELIVERED', 40), ev('PENDING', 0)],
    );
    expect(linea[0]!.at).toBe(CREADO.toISOString());
  });

  it('la clave de cada paso es única: la app decide el icono con ella', () => {
    for (const forma of [
      base,
      { ...base, dineIn: true },
      { ...base, intercity: true },
      { ...base, intercity: true, lastMile: true },
    ]) {
      const c = claves(forma);
      expect(new Set(c).size).toBe(c.length);
    }
  });
});
