/**
 * Las reglas de la marca del local.
 *
 * La que de verdad sostiene esto es la última: la GARANTÍA de contraste
 * barriendo el espectro. Sin ella, dejar que cada dueño elija su color es
 * dejar que elija uno con el que el texto no se lee — y nadie lo revisaría,
 * porque desde el portal el dueño ve un cuadrito de color, no la pantalla del
 * comensal.
 */
import { describe, it, expect } from 'vitest';
import {
  COLOR_ZIPA,
  contraste,
  luminancia,
  paletaDeLocal,
  saneaColorMarca,
  textoSobre,
  tonoSuave,
} from './marca-local';

describe('el color que escribe el dueño', () => {
  it('acepta las formas en que de verdad se escribe un color', () => {
    // El selector del navegador devuelve `#RRGGBB`; quien lo pega a mano
    // escribe de todo. Dos formas del mismo color no pueden guardarse como
    // dos colores distintos.
    expect(saneaColorMarca('#E11D48')).toBe('#e11d48');
    expect(saneaColorMarca('e11d48')).toBe('#e11d48');
    expect(saneaColorMarca('  #ABC ')).toBe('#aabbcc');
    expect(saneaColorMarca('abc')).toBe('#aabbcc');
  });

  it('lo que no es un color se rechaza, no se adivina', () => {
    expect(saneaColorMarca('rojo')).toBeNull();
    expect(saneaColorMarca('#12345')).toBeNull();
    expect(saneaColorMarca('rgb(1,2,3)')).toBeNull();
    expect(saneaColorMarca('')).toBeNull();
    expect(saneaColorMarca(null)).toBeNull();
  });
});

describe('la luminancia mira el ojo, no el promedio', () => {
  it('el verde pesa mucho más que el azul', () => {
    // Si se usara el promedio de los canales, un azul intenso se tomaría por
    // «claro» y acabaría con texto negro encima, ilegible. Los tres tienen el
    // mismo promedio (85) y luminancias muy distintas.
    expect(luminancia('#00ff00')).toBeGreaterThan(luminancia('#ff0000'));
    expect(luminancia('#ff0000')).toBeGreaterThan(luminancia('#0000ff'));
  });

  it('los extremos son los extremos', () => {
    expect(luminancia('#000000')).toBeCloseTo(0, 5);
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5);
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});

describe('el texto encima del color de marca', () => {
  it('va blanco sobre un color oscuro y negro sobre uno claro', () => {
    expect(textoSobre('#0f172a')).toBe('#ffffff'); // azul muy oscuro
    expect(textoSobre('#facc15')).toBe('#000000'); // amarillo
    expect(textoSobre('#ffffff')).toBe('#000000');
    expect(textoSobre('#000000')).toBe('#ffffff');
  });

  it('EL AZUL INTENSO lleva texto blanco, que es donde falla el promedio', () => {
    // `#0000ff` tiene un promedio de canal de 85 —«medio»— pero una
    // luminancia de 0,07: oscurísimo. Con el promedio se le habría puesto
    // texto negro encima.
    expect(textoSobre('#0000ff')).toBe('#ffffff');
  });

  it('GARANTÍA: nunca baja de 4,5:1 sobre ningún color', () => {
    // Es la regla que hace seguro dejar elegir el color. El peor caso teórico
    // —donde blanco y negro empatan— da 4,58:1. Se barre el espectro en vez
    // de probar cuatro colores a mano porque el fallo estaría justo en los
    // tonos medios, que son los que más dueños van a elegir.
    let peor = { color: '', razon: Infinity };
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          const razon = contraste(hex, textoSobre(hex));
          if (razon < peor.razon) peor = { color: hex, razon };
        }
      }
    }
    expect(
      peor.razon,
      `el peor color del barrido fue ${peor.color} con ${peor.razon.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('el tinte suave para velos y fondos', () => {
  it('es casi blanco pero se nota de qué color es', () => {
    const suave = tonoSuave('#e11d48');
    expect(luminancia(suave)).toBeGreaterThan(0.8);
    expect(suave).not.toBe('#ffffff');
  });

  it('sobre él se lee texto oscuro, sea cual sea la marca', () => {
    // Si no, el velo de un local con marca oscura dejaría su propio texto
    // ilegible y nadie lo vería hasta tener la carta delante.
    for (const c of ['#000000', '#0000ff', '#e11d48', '#facc15', '#059669']) {
      expect(contraste(tonoSuave(c), '#0f172a')).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('la paleta del local', () => {
  it('sin color declarado se usa el de ZIPA y se DICE', () => {
    // «propia: false» es lo que permite que la carta no finja una identidad
    // que el local no declaró.
    const p = paletaDeLocal(null);
    expect(p.marca).toBe(COLOR_ZIPA);
    expect(p.propia).toBe(false);
  });

  it('un color inválido se trata como si no hubiera', () => {
    // Mejor una carta con el verde de ZIPA que una con el texto ilegible
    // porque alguien pegó algo que no era un color.
    expect(paletaDeLocal('granate').marca).toBe(COLOR_ZIPA);
    expect(paletaDeLocal('granate').propia).toBe(false);
  });

  it('con color propio, la paleta entera sale de él', () => {
    const p = paletaDeLocal('#E11D48');
    expect(p.marca).toBe('#e11d48');
    expect(p.propia).toBe(true);
    expect(p.sobreMarca).toBe('#ffffff');
    expect(contraste(p.marca, p.sobreMarca)).toBeGreaterThanOrEqual(4.5);
  });
});
