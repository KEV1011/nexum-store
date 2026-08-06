import { describe, it, expect } from 'vitest';
import { nuevaCuota, registrarMensaje } from './ws-throttle';

const T0 = 1_000_000;

/** Manda n mensajes del mismo tipo en el mismo instante y devuelve el último veredicto. */
function ráfaga(cuota: ReturnType<typeof nuevaCuota>, tipo: string, n: number, t = T0) {
  let ultimo = registrarMensaje(cuota, tipo, t);
  for (let i = 1; i < n; i++) ultimo = registrarMensaje(cuota, tipo, t);
  return ultimo;
}

describe('cuota de mensajes por socket', () => {
  it('el tráfico normal de un conductor pasa sin rozarla', () => {
    const cuota = nuevaCuota();
    // Heartbeat cada 4 s durante 10 minutos: 150 fixes, nunca más de 3 por ventana.
    let t = T0;
    for (let i = 0; i < 150; i++) {
      expect(registrarMensaje(cuota, 'location_update', t).permitido).toBe(true);
      t += 4000;
    }
  });

  it('frena el exceso de lecturas sin cortar la conexión', () => {
    const cuota = nuevaCuota();
    const v = ráfaga(cuota, 'ping', 130);
    expect(v.permitido).toBe(false);
    expect(!v.permitido && v.cortar).toBe(false);
  });

  it('quien insiste tras el aviso pierde el socket', () => {
    const cuota = nuevaCuota();
    const v = ráfaga(cuota, 'ping', 300);
    expect(v.permitido).toBe(false);
    expect(!v.permitido && v.cortar).toBe(true);
  });

  it('las escrituras tienen la cuota corta: ahí es donde un bucle hace daño', () => {
    const cuota = nuevaCuota();
    // 31 aceptaciones seguidas están muy por debajo del límite general (120) y
    // aun así deben frenarse: cada una toca la base y mueve dinero.
    const v = ráfaga(cuota, 'accept', 31);
    expect(v.permitido).toBe(false);
  });

  it('la ventana se olvida: pasado el tiempo, se vuelve a poder', () => {
    const cuota = nuevaCuota();
    expect(ráfaga(cuota, 'ping', 130).permitido).toBe(false);
    expect(registrarMensaje(cuota, 'ping', T0 + 11_000).permitido).toBe(true);
  });

  it('un tipo desconocido cuenta en el general pero no en el de escrituras', () => {
    const cuota = nuevaCuota();
    expect(ráfaga(cuota, 'inventado', 40).permitido).toBe(true);
    expect(cuota.sellosEscritura).toHaveLength(0);
  });
});
