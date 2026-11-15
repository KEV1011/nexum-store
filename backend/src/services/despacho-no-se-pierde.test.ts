import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { desdeCuandoBusca, esDemasiadoViejo } from './dispatch-recovery.service';

// «HAY SOLICITUDES QUE NO LE LLEGAN A NINGÚN CONDUCTOR».
//
// El comportamiento completo lo recorre `e2e/despacho-no-se-pierde.ts` contra
// PostgreSQL y sockets de verdad, pero esa prueba no corre en el CI. Aquí
// queda lo que sí puede vigilarse en cada push: la regla de la edad, que es
// pura, y que los cuatro arreglos sigan escritos donde tienen que estar. Las
// cuatro roturas son silenciosas: el código compila, nada falla, y un servicio
// se queda sin conductor con conductores en la calle.

const fuente = (ruta: string) => readFileSync(join(__dirname, '..', ruta), 'utf8');
const min = (n: number) => new Date(Date.now() - n * 60_000);

describe('desde cuándo necesita conductor un servicio', () => {
  it('es la fecha MÁS RECIENTE de las que se le pasan', () => {
    const creado = min(50);
    const listo = min(1);
    expect(desdeCuandoBusca(creado, min(48), listo)).toEqual(listo);
  });

  it('las fechas que faltan no cuentan', () => {
    const creado = min(10);
    expect(desdeCuandoBusca(creado, null, undefined)).toEqual(creado);
  });

  it('un pedido de hace 50 min que se marca listo AHORA no es viejo', () => {
    // Era el reporte: con media hora de cocina, el barrido le cortaba la
    // búsqueda que «listo» acababa de arrancar.
    expect(esDemasiadoViejo(min(50))).toBe(true);
    expect(esDemasiadoViejo(desdeCuandoBusca(min(50), min(48), min(0)))).toBe(false);
  });

  it('un viaje reservado ayer para dentro de diez minutos no es viejo', () => {
    const ayer = new Date(Date.now() - 26 * 3600_000);
    const hora = new Date(Date.now() + 10 * 60_000);
    expect(esDemasiadoViejo(desdeCuandoBusca(ayer, hora))).toBe(false);
  });

  it('pero el que lleva 45 min listo sin que nadie lo busque sí', () => {
    expect(esDemasiadoViejo(desdeCuandoBusca(min(90), min(88), min(45)))).toBe(true);
  });
});

describe('los arreglos siguen donde tienen que estar', () => {
  it('el barrido no toca ninguna búsqueda que siga viva en memoria', () => {
    const barrido = fuente('services/dispatch-recovery.service.ts');
    for (const guarda of [
      "busquedaEnCurso('trip', v.id)",
      "busquedaEnCurso('errand', m.id)",
      "busquedaEnCurso('order', p.id)",
      'busquedaIntercityEnCurso(b.id)',
    ]) {
      expect(barrido, guarda).toContain(`if (${guarda}) continue;`);
    }
    // Y ni pedidos ni viajes miden la edad solo por la creación.
    expect(barrido).not.toContain('esDemasiadoViejo(p.createdAt, ahora)');
    expect(barrido).not.toContain('esDemasiadoViejo(v.createdAt, ahora)');
  });

  it('el cierre de un socket VIEJO no desconecta al conductor', () => {
    const ws = fuente('websocket/ws.handler.ts');
    const cierre = ws.slice(ws.indexOf('function onClose('));
    expect(cierre).toContain(
      'if (driverId && eraLaVigente) void getTripService().noteDriverDisconnected(driverId);',
    );
    // Ni una llamada suelta que se salte la comprobación.
    expect(cierre.match(/noteDriverDisconnected\(/g)).toHaveLength(1);
  });

  it('el servidor espera más que la cuenta atrás de la app, en los tres ciclos', () => {
    const m = fuente('services/matching.service.ts');
    expect(m).toContain('const OFFER_ESPERA_MS = OFFER_TIMEOUT_MS + OFFER_GRACE_MS;');
    expect(m.match(/\}, OFFER_ESPERA_MS\);/g)).toHaveLength(3);
    expect(m).not.toContain('}, OFFER_TIMEOUT_MS);');
  });

  it('«ya llevas un mandado» se pregunta a la base, no al mapa en memoria', () => {
    const ws = fuente('websocket/ws.handler.ts');
    expect(ws).toContain('sigue != null && sigue.driverId === driverId && sigue.abierto');
    expect(ws).not.toContain("message: 'Already handling an errand'");
  });

  it('un «Aceptar» rechazado siempre dice a qué servicio se refiere', () => {
    const ws = fuente('websocket/ws.handler.ts');
    for (const viejo of [
      'is no longer available',
      "message: 'El pedido ya no está disponible'",
    ]) {
      expect(ws, viejo).not.toContain(viejo);
    }
    expect(ws.match(/avisarOfertaPerdida\(/g)!.length).toBeGreaterThanOrEqual(6);
  });
});
