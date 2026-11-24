import { describe, expect, it } from 'vitest';
import {
  cuerpoDeAvisoChat,
  PAUSA_ENTRE_AVISOS_MS,
  RitmoDeAvisos,
  tituloDeAvisoChat,
  VISTA_PREVIA_MAX,
} from './aviso-chat';

describe('quién escribió, con la palabra de quien lo lee', () => {
  it('al cliente le escribe su mensajero, su repartidor o su conductor', () => {
    expect(tituloDeAvisoChat('errand', 'driver')).toBe('Tu mensajero te escribió');
    expect(tituloDeAvisoChat('order', 'driver')).toBe('Tu repartidor te escribió');
    expect(tituloDeAvisoChat('envio', 'driver')).toBe('Tu repartidor te escribió');
    expect(tituloDeAvisoChat('trip', 'driver')).toBe('Tu conductor te escribió');
  });

  it('al conductor le escribe su pasajero o el cliente', () => {
    expect(tituloDeAvisoChat('trip', 'client')).toBe('Tu pasajero te escribió');
    expect(tituloDeAvisoChat('errand', 'client')).toBe('El cliente te escribió');
    expect(tituloDeAvisoChat('envio', 'client')).toBe('El cliente te escribió');
  });

  it('en el chat de grupo se dice el nombre del pasajero', () => {
    expect(tituloDeAvisoChat('pooled', 'client', 'Laura')).toBe('Laura escribió en el viaje');
    expect(tituloDeAvisoChat('pooled', 'client', '  ')).toBe('Un pasajero escribió en el viaje');
    expect(tituloDeAvisoChat('pooled', 'driver', 'Pedro')).toBe('El conductor escribió en tu viaje');
  });
});

describe('el cuerpo del aviso', () => {
  it('es el propio mensaje, en una línea', () => {
    expect(cuerpoDeAvisoChat('No hay de esa marca,\n¿cuál llevo?', false))
      .toBe('No hay de esa marca, ¿cuál llevo?');
  });

  it('se recorta sin pasarse del largo de una línea', () => {
    const largo = 'a'.repeat(300);
    const c = cuerpoDeAvisoChat(largo, false);
    expect(c.length).toBe(VISTA_PREVIA_MAX);
    expect(c.endsWith('…')).toBe(true);
  });

  it('una foto sin texto dice que es una foto, nunca va vacío', () => {
    expect(cuerpoDeAvisoChat('', true)).toBe('Te envió una foto');
    expect(cuerpoDeAvisoChat('   ', false)).toBe('Te envió un mensaje');
  });
});

describe('el ritmo de los avisos', () => {
  it('la ráfaga suena una vez; pasada la pausa vuelve a sonar', () => {
    const r = new RitmoDeAvisos();
    expect(r.tocaAvisar('u1', 'chat1', 0)).toBe(true);
    expect(r.tocaAvisar('u1', 'chat1', 5_000)).toBe(false);
    expect(r.tocaAvisar('u1', 'chat1', PAUSA_ENTRE_AVISOS_MS - 1)).toBe(false);
    expect(r.tocaAvisar('u1', 'chat1', PAUSA_ENTRE_AVISOS_MS + 1)).toBe(true);
  });

  it('otra persona u otro chat no comparten la pausa', () => {
    const r = new RitmoDeAvisos();
    expect(r.tocaAvisar('u1', 'chat1', 0)).toBe(true);
    expect(r.tocaAvisar('u2', 'chat1', 1)).toBe(true);
    expect(r.tocaAvisar('u1', 'chat2', 2)).toBe(true);
  });
});
