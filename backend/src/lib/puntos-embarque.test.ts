import { describe, it, expect } from 'vitest';
import {
  saneaPuntosEmbarque,
  puntosGuardados,
  horaAbsolutaDePunto,
  minutosTrasLaSalida,
  etiquetaPunto,
  MAX_PUNTOS,
} from './puntos-embarque';

const SALIDA = new Date('2026-03-10T06:00:00');
const NOCTURNO = new Date('2026-03-10T23:40:00');

describe('el cruce de medianoche', () => {
  it('un punto posterior a la salida es del mismo día', () => {
    const abs = horaAbsolutaDePunto(SALIDA, '06:20');
    expect(abs?.getDate()).toBe(10);
    expect(minutosTrasLaSalida(SALIDA, '06:20')).toBe(20);
  });

  it('en un nocturno, «00:05» es del día SIGUIENTE', () => {
    // Sin esta regla la app le diría al pasajero que su recogida pasó hace
    // veintitrés horas, y es el caso más común de las rutas largas.
    const abs = horaAbsolutaDePunto(NOCTURNO, '00:05');
    expect(abs?.getDate()).toBe(11);
    expect(minutosTrasLaSalida(NOCTURNO, '00:05')).toBe(25);
  });

  it('una hora mal escrita no revienta: devuelve null', () => {
    for (const mala of ['25:00', '6:00', 'seis', '', '12:60']) {
      expect(horaAbsolutaDePunto(SALIDA, mala), mala).toBeNull();
    }
  });
});

describe('lo que llega del portal', () => {
  const punto = (name: string, time: string) => ({ name, time });

  it('se ordena por la hora en que pasa el bus', () => {
    const p = saneaPuntosEmbarque(
      [punto('Parque', '06:20'), punto('Terminal', '06:00'), punto('Universidad', '06:10')],
      SALIDA,
    );
    expect(p.map((x) => x.name)).toEqual(['Terminal', 'Universidad', 'Parque']);
  });

  it('en un nocturno, la madrugada va al FINAL y no al principio', () => {
    // Ordenar «00:05» antes que «23:40» pondría el último punto el primero, y
    // el pasajero creería que el bus arranca en la otra punta de la ciudad.
    const p = saneaPuntosEmbarque(
      [punto('Puente', '00:05'), punto('Terminal', '23:40')],
      NOCTURNO,
    );
    expect(p.map((x) => x.name)).toEqual(['Terminal', 'Puente']);
  });

  it('un punto a nueve horas de la salida es un dedo, no un embarque', () => {
    expect(() => saneaPuntosEmbarque([punto('Raro', '15:00')], SALIDA)).toThrow(/revisa la hora/i);
  });

  it('el nombre repetido se rechaza diciendo cuál, sin importar mayúsculas', () => {
    // «Parque» y «parque» son el mismo sitio para quien va a esperar ahí, y
    // dos entradas iguales en la lista solo generan la pregunta de en cuál es.
    expect(() =>
      saneaPuntosEmbarque([punto('Parque', '06:10'), punto('parque', '06:20')], SALIDA),
    ).toThrow(/parque/i);
  });

  it('sin nombre o con hora mal escrita se rechaza, no se descarta', () => {
    // Un punto que desaparece en silencio deja pasajeros esperando en una
    // esquina que la empresa cree haber publicado.
    expect(() => saneaPuntosEmbarque([{ name: '', time: '06:00' }])).toThrow(/nombre/i);
    expect(() => saneaPuntosEmbarque([punto('Parque', '6:00')])).toThrow(/HH:MM/);
  });

  it('más de seis no es una lista de embarque, es un recorrido', () => {
    const muchos = Array.from({ length: MAX_PUNTOS + 1 }, (_, i) =>
      punto(`P${i}`, `06:${String(i).padStart(2, '0')}`));
    expect(() => saneaPuntosEmbarque(muchos, SALIDA)).toThrow(/Máximo/);
  });

  it('conserva dirección y coordenadas, que es lo que evita preguntar', () => {
    const [p] = saneaPuntosEmbarque(
      [{ name: 'Terminal', time: '06:00', address: 'Calle 5 # 3-40', lat: 7.37, lng: -72.64 }],
      SALIDA,
    );
    expect(p).toMatchObject({ address: 'Calle 5 # 3-40', lat: 7.37, lng: -72.64 });
  });

  it('sin lista, lista vacía y no un error', () => {
    expect(saneaPuntosEmbarque(null)).toEqual([]);
    expect(saneaPuntosEmbarque([])).toEqual([]);
  });
});

describe('lo que ya está guardado', () => {
  it('un punto corrupto se salta sin tumbar la salida', () => {
    // Al revés que el formulario: aquí el dato ya está en la base y tirar la
    // búsqueda entera dejaría al pasajero sin ver ninguna salida.
    const p = puntosGuardados([
      { name: 'Terminal', time: '06:00' },
      { name: 'Roto', time: 'ayer' },
      'basura',
    ]);
    expect(p.map((x) => x.name)).toEqual(['Terminal']);
  });
});

describe('la etiqueta', () => {
  const puntos = saneaPuntosEmbarque(
    [{ name: 'Terminal', time: '06:00' }, { name: 'Parque', time: '06:15' }],
    SALIDA,
  );

  it('la etiqueta lleva el nombre y la hora, que es lo que se lee de un vistazo', () => {
    expect(etiquetaPunto(puntos[0]!)).toBe('Terminal · 06:00');
  });
});
