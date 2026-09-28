import { describe, it, expect } from 'vitest';
import { tokenMuerto } from './token-muerto';

function fcm(code: string, message = 'algo'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe('cuándo un token de push está muerto', () => {
  it('reconoce el código de token no registrado', () => {
    expect(tokenMuerto(fcm('messaging/registration-token-not-registered'))).toBe(true);
  });

  it('reconoce el código de token inválido', () => {
    expect(tokenMuerto(fcm('messaging/invalid-registration-token'))).toBe(true);
  });

  it('reconoce el detalle crudo que manda FCM', () => {
    // Es lo que se vio en el log de producción: el mensaje era literalmente
    // «NotRegistered», sin código.
    expect(tokenMuerto(new Error('NotRegistered'))).toBe(true);
    expect(tokenMuerto(new Error('UNREGISTERED'))).toBe(true);
  });

  it('NO borra el token ante un error pasajero de Google', () => {
    // Borrar aquí deja sin avisos a alguien que sí tiene la app puesta, y no
    // hay forma de enterarse hasta que vuelva a abrirla.
    expect(tokenMuerto(fcm('messaging/server-unavailable'))).toBe(false);
    expect(tokenMuerto(fcm('messaging/internal-error'))).toBe(false);
    expect(tokenMuerto(fcm('messaging/quota-exceeded'))).toBe(false);
  });

  it('NO borra el token si el problema es el payload', () => {
    // 'invalid-argument' lo devuelve también un mensaje mal formado: culpar al
    // token sería borrar a todo el mundo el día que alguien rompa un aviso.
    expect(tokenMuerto(fcm('messaging/invalid-argument'))).toBe(false);
    expect(tokenMuerto(fcm('messaging/payload-size-limit-exceeded'))).toBe(false);
  });

  it('no se deja llevar por una subcadena', () => {
    // Un texto explicativo que mencione el término no es un veredicto.
    expect(tokenMuerto(new Error('el token aparece como NotRegistered en el informe'))).toBe(false);
  });

  it('con basura no lanza y no borra nada', () => {
    expect(tokenMuerto(null)).toBe(false);
    expect(tokenMuerto(undefined)).toBe(false);
    expect(tokenMuerto('NotRegistered')).toBe(false);
    expect(tokenMuerto({})).toBe(false);
    expect(tokenMuerto({ code: 42 })).toBe(false);
  });
});
