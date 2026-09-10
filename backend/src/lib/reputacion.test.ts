import { describe, it, expect } from 'vitest';
import {
  saneaEstrellas,
  saneaComentario,
  promedioReputacion,
} from './reputacion';

describe('las estrellas que manda la app', () => {
  it('acepta de 1 a 5', () => {
    expect(saneaEstrellas(1)).toBe(1);
    expect(saneaEstrellas(5)).toBe(5);
    expect(saneaEstrellas('4')).toBe(4);
  });

  it('RECHAZA lo que está fuera de la escala', () => {
    // Un 6 o un 0 desvían el promedio de todos los demás locales.
    expect(() => saneaEstrellas(6)).toThrow(/1 a 5/);
    expect(() => saneaEstrellas(0)).toThrow(/1 a 5/);
    expect(() => saneaEstrellas(-3)).toThrow(/1 a 5/);
  });

  it('RECHAZA medias estrellas y basura', () => {
    expect(() => saneaEstrellas(4.5)).toThrow(/entero/);
    expect(() => saneaEstrellas('muy bueno')).toThrow(/entero/);
    expect(() => saneaEstrellas(null)).toThrow(/entero/);
  });
});

describe('el comentario', () => {
  it('vacío es null, no una cadena vacía', () => {
    expect(saneaComentario('')).toBeNull();
    expect(saneaComentario('   ')).toBeNull();
    expect(saneaComentario(undefined)).toBeNull();
  });

  it('se recorta', () => {
    expect(saneaComentario('  llegó frío  ')).toBe('llegó frío');
    expect(saneaComentario('a'.repeat(500))!.length).toBe(300);
  });
});

describe('el promedio del negocio', () => {
  it('SIN calificaciones devuelve null, no un 5,0 de regalo', () => {
    // Este era el defecto: `Business.rating` nacía en 5.0 y nadie lo tocaba,
    // así que todos los locales enseñaban la misma nota sin haberla ganado.
    expect(promedioReputacion([])).toEqual({ rating: null, ratingCount: 0 });
  });

  it('ni un cero, que parece pésimo', () => {
    expect(promedioReputacion([]).rating).not.toBe(0);
  });

  it('promedia y redondea a un decimal', () => {
    expect(promedioReputacion([5, 4, 5])).toEqual({ rating: 4.7, ratingCount: 3 });
    expect(promedioReputacion([5])).toEqual({ rating: 5, ratingCount: 1 });
    expect(promedioReputacion([1, 2])).toEqual({ rating: 1.5, ratingCount: 2 });
  });

  it('descarta valores imposibles en vez de dejarlos desviar el promedio', () => {
    // Si una fila vieja tuviera un 0 o un 9, arrastraría la nota de todo el
    // local. Se ignora y el conteo lo dice.
    expect(promedioReputacion([5, 5, 0, 9])).toEqual({ rating: 5, ratingCount: 2 });
  });
});
