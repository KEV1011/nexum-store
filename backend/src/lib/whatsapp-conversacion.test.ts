import { describe, it, expect } from 'vitest';
import {
  siguientePaso,
  textoPedirUbicacion,
  textoEnlaceConOrigen,
  textoEnlaceSinOrigen,
  textoFueraDeCobertura,
  esFueraDeCobertura,
  MEMORIA_PETICION_MIN,
} from './whatsapp-conversacion';

const PUNTO = { lat: 7.3754, lng: -72.6486, etiqueta: null };

describe('el paso siguiente', () => {
  it('con ubicación, el enlace lleva el punto', () => {
    const p = siguientePaso({ ubicacion: PUNTO, ubicacionYaPedida: false });
    expect(p).toEqual({ accion: 'enlace', origen: PUNTO });
  });

  it('sin ubicación y sin habérsela pedido, se pide', () => {
    expect(siguientePaso({ ubicacion: null, ubicacionYaPedida: false })).toEqual({
      accion: 'pedir-ubicacion',
    });
  });

  it('sin ubicación pero YA pedida, enlace seco: nadie se queda encerrado', () => {
    // Quien no quiere o no puede mandar su ubicación —GPS apagado, no sabe
    // cómo, prefiere escribir la dirección— no puede recibir la misma petición
    // en bucle. Se le manda el enlace y la escribe en la app, que tiene
    // buscador de direcciones y mapa.
    expect(siguientePaso({ ubicacion: null, ubicacionYaPedida: true })).toEqual({
      accion: 'enlace',
      origen: null,
    });
  });

  it('la ubicación manda aunque ya se hubiera pedido', () => {
    // El caso normal: le pedimos el punto y nos lo manda. Si «ya pedida»
    // ganara, la respuesta a nuestra propia petición se iría sin origen.
    const p = siguientePaso({ ubicacion: PUNTO, ubicacionYaPedida: true });
    expect(p).toEqual({ accion: 'enlace', origen: PUNTO });
  });

  it('la memoria de la petición es más corta que un día', () => {
    // Si escribe mañana es una carrera nueva y toca volver a preguntarle dónde
    // está. Una memoria larga le mandaría el enlace seco sin darle el botón.
    expect(MEMORIA_PETICION_MIN).toBeLessThanOrEqual(60);
    expect(MEMORIA_PETICION_MIN).toBeGreaterThan(0);
  });
});

describe('cobertura: cuándo se le dice que no operamos ahí', () => {
  it('con plazas cargadas y el punto en ninguna, se bloquea', () => {
    expect(esFueraDeCobertura(true, null)).toBe(true);
  });

  it('con plazas cargadas y el punto en una, pasa', () => {
    expect(esFueraDeCobertura(true, 'pamplona')).toBe(false);
  });

  it('SIN plazas cargadas NO se bloquea a nadie', () => {
    // Es la regla que evita un apagón: con la tabla vacía —despliegue nuevo, o
    // un fallo al leerla— el resolutor devuelve null para TODO el mundo. Si eso
    // bloqueara, la ciudad entera se quedaría sin poder pedir por un problema
    // nuestro, y en el chat parecería que no damos servicio en ninguna parte.
    expect(esFueraDeCobertura(false, null)).toBe(false);
  });
});

describe('lo que lee el pasajero', () => {
  it('la petición dice para qué es el punto', () => {
    const t = textoPedirUbicacion('Kevin');
    expect(t).toContain('Kevin');
    expect(t).toMatch(/recogemos|recogida/i);
  });

  it('sin nombre no queda un saludo cojo', () => {
    expect(textoPedirUbicacion(null)).not.toContain('undefined');
    expect(textoPedirUbicacion(null)).not.toContain('null');
    expect(textoPedirUbicacion(null).startsWith('Hola.')).toBe(true);
  });

  it('el enlace con origen dice qué falta: el destino', () => {
    const t = textoEnlaceConOrigen('https://z/#/entrar?c=abc', 15, null);
    expect(t).toContain('https://z/#/entrar?c=abc');
    expect(t).toMatch(/a dónde vas/i);
    expect(t).toContain('15');
  });

  it('y nombra el sitio solo si WhatsApp lo mandó', () => {
    expect(textoEnlaceConOrigen('https://z/x', 15, 'Parque Águeda')).toContain('Parque Águeda');
    // Sin etiqueta no puede quedar un paréntesis vacío colgando.
    expect(textoEnlaceConOrigen('https://z/x', 15, null)).not.toContain('()');
  });

  it('el enlace sin origen pide las dos direcciones', () => {
    const t = textoEnlaceSinOrigen(null, 'https://z/x', 15);
    expect(t).toMatch(/recogida/i);
    expect(t).toContain('https://z/x');
  });

  it('fuera de cobertura NO lleva enlace', () => {
    // Es el punto del mensaje: entrar a la app para descubrir que no hay nadie
    // es peor que saberlo en el chat, y nos ahorra el mensaje del enlace.
    const t = textoFueraDeCobertura('Ana');
    expect(t).not.toContain('http');
    expect(t).toMatch(/no tiene servicio|no opera/i);
  });
});
