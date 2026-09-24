import { describe, it, expect } from 'vitest';
import {
  AMENIDADES,
  ORDEN_AMENIDADES,
  saneaAmenidades,
  amenidadesGuardadas,
  amenidadesDeSalida,
  etiquetaAmenidad,
} from './amenidades';

describe('el catálogo', () => {
  it('el orden cubre todas las claves, sin sobrar ni faltar', () => {
    // Si alguien añade una comodidad y olvida ordenarla, no se pintaría nunca
    // —`ORDEN_AMENIDADES.filter` es quien construye la lista— y el fallo sería
    // una casilla del portal que no hace nada.
    expect([...ORDEN_AMENIDADES].sort()).toEqual(Object.keys(AMENIDADES).sort());
  });

  it('cada clave tiene su etiqueta en español', () => {
    for (const a of ORDEN_AMENIDADES) {
      expect(etiquetaAmenidad(a).length, a).toBeGreaterThan(3);
    }
  });
});

describe('lo que llega del formulario', () => {
  it('se ordena igual siempre, venga como venga', () => {
    // Dos salidas de la misma empresa tienen que leerse igual: con el orden
    // del formulario, una diría «wifi · aire» y otra «aire · wifi».
    expect(saneaAmenidades(['wifi', 'aire'])).toEqual(['aire', 'wifi']);
    expect(saneaAmenidades(['aire', 'wifi'])).toEqual(['aire', 'wifi']);
  });

  it('no repite', () => {
    expect(saneaAmenidades(['usb', 'usb', 'usb'])).toEqual(['usb']);
  });

  it('una clave desconocida se RECHAZA diciendo cuál', () => {
    // Descartarla en silencio escondería el error hasta que una empresa
    // preguntara por qué su comodidad no sale.
    expect(() => saneaAmenidades(['aire', 'jacuzzi'])).toThrow(/jacuzzi/);
  });

  it('sin nada, lista vacía y no un error', () => {
    expect(saneaAmenidades(null)).toEqual([]);
    expect(saneaAmenidades(undefined)).toEqual([]);
    expect(saneaAmenidades([])).toEqual([]);
  });

  it('lo que no es una lista se rechaza', () => {
    expect(() => saneaAmenidades('aire')).toThrow(/lista/i);
  });

  it('el baño NO entra por aquí aunque lo marquen', () => {
    // Lo pone el plano. Si el formulario pudiera añadirlo, habría dos fuentes
    // y acabarían contradiciéndose.
    expect(saneaAmenidades(['aire', 'bano'])).toEqual(['aire']);
  });
});

describe('el baño sale del plano, en las dos direcciones', () => {
  it('con baño dibujado se anuncia aunque no lo declararan', () => {
    expect(amenidadesDeSalida(['aire'], true)).toEqual(['aire', 'bano']);
  });

  it('sin baño en el plano NO se anuncia aunque esté guardado', () => {
    // Es la promesa más cara de incumplir: quien compra un nocturno de nueve
    // horas lo elige por eso, y el reclamo sería a bordo.
    expect(amenidadesDeSalida(['aire', 'bano'], false)).toEqual(['aire']);
  });

  it('sin plano manda lo guardado', () => {
    // La salida del conductor particular se vende por cupos y no tiene plano
    // del que derivar nada.
    expect(amenidadesDeSalida(['bano', 'usb'], null)).toEqual(['bano', 'usb']);
  });
});

describe('lo que ya está en la base', () => {
  it('una clave que dejó de existir se ignora sin romper la salida', () => {
    // Al revés que el formulario: aquí el dato ya está guardado y tirar la
    // consulta entera por una clave vieja dejaría la salida sin pintarse.
    expect(amenidadesGuardadas(['aire', 'minibar'])).toEqual(['aire']);
  });

  it('un valor que no es lista no revienta', () => {
    expect(amenidadesGuardadas('aire')).toEqual([]);
    expect(amenidadesGuardadas(null)).toEqual([]);
  });
});
