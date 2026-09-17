import { describe, it, expect } from 'vitest';
import {
  mensajesDe,
  telefonoColombiano,
  motivoParaNoResponder,
  MAX_EDAD_MIN,
  TOPE_DIARIO,
} from './whatsapp-payload';

/** Payload real de Meta, recortado a lo que leemos. */
function payloadTexto(over: Record<string, unknown> = {}): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '573000000000', phone_number_id: '999' },
              contacts: [{ profile: { name: 'Kevin' }, wa_id: '573001234567' }],
              messages: [
                {
                  from: '573001234567',
                  id: 'wamid.ABC',
                  timestamp: '1758067200',
                  type: 'text',
                  text: { body: 'taxi' },
                  ...over,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('leer el webhook de WhatsApp', () => {
  it('saca el mensaje, el teléfono con + y el nombre del perfil', () => {
    const [m] = mensajesDe(payloadTexto());
    expect(m?.waMessageId).toBe('wamid.ABC');
    // Meta manda el número SIN el «+»; si se guardara así, el usuario no
    // casaría con su propia cuenta (que vive en E.164).
    expect(m?.telefono).toBe('+573001234567');
    expect(m?.texto).toBe('taxi');
    expect(m?.nombre).toBe('Kevin');
  });

  it('el timestamp son SEGUNDOS: leerlo como milisegundos daría 1970', () => {
    const [m] = mensajesDe(payloadTexto());
    expect(m?.enviadoEn.getUTCFullYear()).toBe(2025);
  });

  it('los acuses de entrega NO son mensajes', () => {
    // Llegan por el mismo webhook y son muchos más que los mensajes. Tratarlos
    // como tales sería mandarle un enlace al pasajero cada vez que su teléfono
    // confirma que recibió algo.
    const acuse = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [{ id: 'wamid.ABC', status: 'delivered', recipient_id: '573001234567' }],
              },
            },
          ],
        },
      ],
    };
    expect(mensajesDe(acuse)).toEqual([]);
  });

  it('lee la respuesta de un botón y la de una fila de lista', () => {
    const boton = mensajesDe(
      payloadTexto({
        type: 'interactive',
        text: undefined,
        interactive: { type: 'button_reply', button_reply: { id: 'pedir', title: 'Pedir taxi' } },
      }),
    );
    expect(boton[0]?.texto).toBe('Pedir taxi');

    const fila = mensajesDe(
      payloadTexto({
        type: 'interactive',
        text: undefined,
        interactive: { type: 'list_reply', list_reply: { id: 'terminal', title: 'Terminal' } },
      }),
    );
    expect(fila[0]?.texto).toBe('Terminal');
  });

  it('una ubicación entra aunque no traiga texto', () => {
    const [m] = mensajesDe(
      payloadTexto({ type: 'location', text: undefined, location: { latitude: 7.37, longitude: -72.64 } }),
    );
    expect(m?.tipo).toBe('location');
    expect(m?.texto).toBe('');
  });

  it('lo malformado devuelve lista vacía y NO lanza', () => {
    // Si el webhook responde 500, Meta lo reintenta durante horas.
    expect(mensajesDe(null)).toEqual([]);
    expect(mensajesDe('hola')).toEqual([]);
    expect(mensajesDe({})).toEqual([]);
    expect(mensajesDe({ entry: 'no-es-lista' })).toEqual([]);
    expect(mensajesDe({ entry: [{ changes: [{ value: { messages: 'x' } }] }] })).toEqual([]);
    expect(mensajesDe({ entry: [{ changes: [{ value: { messages: [null, 3] } }] }] })).toEqual([]);
  });

  it('un mensaje sin id se descarta: sin él no hay defensa contra reintentos', () => {
    expect(mensajesDe(payloadTexto({ id: '' }))).toEqual([]);
  });
});

describe('aceptar solo teléfonos colombianos', () => {
  it('con y sin indicativo', () => {
    expect(telefonoColombiano('573001234567')).toBe('+573001234567');
    expect(telefonoColombiano('+57 300 123 4567')).toBe('+573001234567');
    expect(telefonoColombiano('3001234567')).toBe('+573001234567');
  });

  it('un número extranjero se RECHAZA en vez de deformarlo', () => {
    // Operamos en la frontera y al número de WhatsApp le escribe quien quiera.
    // La normalización del repo le pegaría «+57» delante a un venezolano y
    // crearía una cuenta con un teléfono que no existe.
    expect(telefonoColombiano('584121234567')).toBeNull(); // Venezuela
    expect(telefonoColombiano('12125551234')).toBeNull(); // EE. UU.
    expect(telefonoColombiano('34600123456')).toBeNull(); // España
  });

  it('lo que no es un número, tampoco', () => {
    expect(telefonoColombiano('')).toBeNull();
    expect(telefonoColombiano('hola')).toBeNull();
    expect(telefonoColombiano('57300')).toBeNull();
    // Diez dígitos que no empiezan por 3 ni por 6 no son una línea colombiana.
    expect(telefonoColombiano('5721234567')).toBeNull();
  });
});

describe('decidir si se responde', () => {
  const ahora = new Date('2026-09-17T15:00:00Z');

  it('a un mensaje recién llegado, sí', () => {
    expect(
      motivoParaNoResponder({ enviadoEn: new Date('2026-09-17T14:59:00Z'), ahora, respuestasHoy: 0 }),
    ).toBeNull();
  });

  it('a la cola acumulada tras una caída, no', () => {
    const viejo = new Date(ahora.getTime() - (MAX_EDAD_MIN + 1) * 60000);
    expect(motivoParaNoResponder({ enviadoEn: viejo, ahora, respuestasHoy: 0 })).toMatch(
      /^mensaje-viejo:/,
    );
  });

  it('pasado el tope diario, no: cada saliente se paga', () => {
    expect(
      motivoParaNoResponder({ enviadoEn: ahora, ahora, respuestasHoy: TOPE_DIARIO }),
    ).toMatch(/^tope-diario:/);
    expect(
      motivoParaNoResponder({ enviadoEn: ahora, ahora, respuestasHoy: TOPE_DIARIO - 1 }),
    ).toBeNull();
  });

  it('un reloj adelantado en el móvil no impide responder', () => {
    // Edad negativa: el mensaje «viene del futuro». No es motivo para ignorarlo.
    const futuro = new Date(ahora.getTime() + 5 * 60000);
    expect(motivoParaNoResponder({ enviadoEn: futuro, ahora, respuestasHoy: 0 })).toBeNull();
  });

  it('el motivo dice cuál fue, no solo que no', () => {
    const viejo = new Date(ahora.getTime() - 60 * 60000);
    expect(motivoParaNoResponder({ enviadoEn: viejo, ahora, respuestasHoy: 0 })).toBe(
      'mensaje-viejo:60min',
    );
  });
});
