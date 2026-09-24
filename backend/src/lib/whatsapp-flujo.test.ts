import { describe, it, expect } from 'vitest';
import {
  siguientePaso,
  estadoTras,
  BOTON_CONFIRMAR,
  BOTON_CANCELAR,
  VIDA_CONVERSACION_MIN,
  type ContextoFlujo,
  type EstadoConversacion,
} from './whatsapp-flujo';

const PUNTO = { lat: 7.3754, lng: -72.6486, etiqueta: null };

function ctx(p: Partial<ContextoFlujo> = {}): ContextoFlujo {
  return {
    estado: 'inicio',
    minutosDesdeUltimo: 1,
    ubicacion: null,
    texto: '',
    botonId: null,
    tieneViajeActivo: false,
    ...p,
  };
}

describe('el pedido por WhatsApp, paso a paso', () => {
  it('quien escribe por primera vez recibe el botón de ubicación', () => {
    expect(siguientePaso(ctx({ texto: 'hola' })).accion).toBe('pedir-origen');
  });

  it('con la ubicación en la mano, se le pregunta a dónde va', () => {
    const p = siguientePaso(ctx({ estado: 'esperando_origen', ubicacion: PUNTO }));
    expect(p).toEqual({ accion: 'pedir-destino', origen: PUNTO });
  });

  it('la dirección escrita se manda a cotizar', () => {
    const p = siguientePaso(ctx({ estado: 'esperando_destino', texto: 'Calle 5 # 3-40' }));
    expect(p).toEqual({ accion: 'cotizar', destinoTexto: 'Calle 5 # 3-40' });
  });

  it('el botón de confirmar crea el viaje', () => {
    const p = siguientePaso(ctx({ estado: 'esperando_confirmacion', botonId: BOTON_CONFIRMAR }));
    expect(p.accion).toBe('pedir-viaje');
  });
});

describe('las reglas que sostienen el orden de las comprobaciones', () => {
  it('una ubicación NUEVA reinicia el origen, esté donde esté la conversación', () => {
    // Es el error más caro y ya se cometió una vez en la versión de dos pasos:
    // quien camina dos cuadras y manda su punto otra vez tendría el taxi donde
    // estuvo, no donde está. Y nada en pantalla lo delataría.
    for (const estado of ['esperando_destino', 'esperando_confirmacion'] as EstadoConversacion[]) {
      const p = siguientePaso(ctx({ estado, ubicacion: PUNTO }));
      expect(p, `desde ${estado}`).toEqual({ accion: 'pedir-destino', origen: PUNTO });
    }
  });

  it('un viaje en curso manda sobre todo lo demás', () => {
    // Quien ya tiene taxi y escribe no quiere pedir otro: quiere saber dónde
    // está el suyo. Ni siquiera una ubicación nueva empieza otro pedido.
    for (const extra of [{ texto: 'hola' }, { ubicacion: PUNTO }, { botonId: BOTON_CONFIRMAR }]) {
      const p = siguientePaso(ctx({ tieneViajeActivo: true, estado: 'esperando_destino', ...extra }));
      expect(p.accion).toBe('recordar-viaje');
    }
  });

  it('cancelar funciona desde cualquier paso', () => {
    for (const estado of ['esperando_origen', 'esperando_destino', 'esperando_confirmacion'] as EstadoConversacion[]) {
      expect(siguientePaso(ctx({ estado, botonId: BOTON_CANCELAR })).accion, estado).toBe('cancelar');
    }
  });

  it('una conversación vieja empieza de cero', () => {
    // Retomar a las tres horas un «¿a dónde vas?» mandaría el taxi al sitio
    // donde la persona estaba. Perder el hilo es barato; el punto equivocado no.
    const p = siguientePaso(ctx({
      estado: 'esperando_destino',
      minutosDesdeUltimo: VIDA_CONVERSACION_MIN + 1,
      texto: 'Calle 5 # 3-40',
    }));
    expect(p.accion).toBe('pedir-origen');
  });

  it('pero cancelar y mandar ubicación siguen valiendo en una vieja', () => {
    const vieja = { minutosDesdeUltimo: VIDA_CONVERSACION_MIN + 60 };
    expect(siguientePaso(ctx({ ...vieja, estado: 'esperando_destino', botonId: BOTON_CANCELAR })).accion)
      .toBe('cancelar');
    expect(siguientePaso(ctx({ ...vieja, estado: 'esperando_destino', ubicacion: PUNTO })).accion)
      .toBe('pedir-destino');
  });
});

describe('lo que no se entiende no se inventa', () => {
  it('un «ok» no es una dirección: se vuelve a preguntar', () => {
    // Mandarlo a geocodificar cotizaría un trayecto inventado, y el pasajero
    // vería un precio de un viaje que no pidió.
    for (const texto of ['ok', 'si', '👍', '  ']) {
      const p = siguientePaso(ctx({ estado: 'esperando_destino', texto }));
      expect(p, texto).toEqual({ accion: 'repetir', estado: 'esperando_destino' });
    }
  });

  it('escribir una dirección con el precio en pantalla es cambiar de idea', () => {
    // Insistir con el botón sería lo que hace un formulario. En una taquilla,
    // si el pasajero dice otro destino, se vuelve a cotizar.
    const p = siguientePaso(ctx({
      estado: 'esperando_confirmacion',
      texto: 'mejor a la Terminal',
    }));
    expect(p).toEqual({ accion: 'cotizar', destinoTexto: 'mejor a la Terminal' });
  });

  it('un monosílabo con el precio en pantalla repite la pregunta', () => {
    const p = siguientePaso(ctx({ estado: 'esperando_confirmacion', texto: 'eh' }));
    expect(p).toEqual({ accion: 'repetir', estado: 'esperando_confirmacion' });
  });
});

describe('a qué estado se pasa', () => {
  it.each([
    ['pedir-origen', 'esperando_origen'],
    ['pedir-destino', 'esperando_destino'],
    ['cotizar', 'esperando_confirmacion'],
    ['pedir-viaje', 'viaje_en_curso'],
    ['cancelar', 'inicio'],
  ])('%s deja la conversación en %s', (accion, esperado) => {
    const paso = { accion, origen: PUNTO, destinoTexto: 'x' } as never;
    expect(estadoTras(paso)).toBe(esperado);
  });

  it('repetir no mueve el estado: se sigue esperando lo mismo', () => {
    expect(estadoTras({ accion: 'repetir', estado: 'esperando_destino' })).toBe('esperando_destino');
  });
});
