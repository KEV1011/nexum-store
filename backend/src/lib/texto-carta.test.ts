/**
 * Las reglas del nombre que lee el comensal.
 *
 * Caso real que las motiva (captura de producción): un renglón del recibo
 * decía «1× $23.000», sin nombre, y otro «⚫ Carne asada». El dueño había
 * escrito emojis y la fuente del sitio no los dibuja.
 */
import { describe, it, expect } from 'vitest';
import {
  limpiarTextoDeCarta,
  nombreDeProducto,
  teniaAdornos,
} from './texto-carta';

describe('el nombre del plato se lee igual en cualquier teléfono', () => {
  it('quita el emoji y deja el nombre', () => {
    expect(limpiarTextoDeCarta('🍖 Carne asada')).toBe('Carne asada');
    expect(limpiarTextoDeCarta('Caldo de costilla 🍲')).toBe('Caldo de costilla');
    expect(limpiarTextoDeCarta('🔥🔥 Picante 🔥')).toBe('Picante');
  });

  it('NO toca los signos que de verdad salen en una carta', () => {
    // Quitarlos sería peor que el adorno: rompe el nombre del plato.
    for (const nombre of [
      'Pollo & papas',
      '½ porción de arroz',
      'Café a 90 °C',
      'Arroz «especial»',
      'Sánduche de jamón y piña',
      'Ñeque — plato del día',
      "Pollo a l'ajillo",
    ]) {
      expect(limpiarTextoDeCarta(nombre)).toBe(nombre);
    }
  });

  it('colapsa los espacios raros, que se ven como espacio y no lo son', () => {
    // Un espacio sin separación dentro de un nombre hace que la búsqueda de la
    // carta no lo encuentre, y nadie entiende por qué.
    expect(limpiarTextoDeCarta('Caldo de   bagre')).toBe('Caldo de bagre');
  });

  it('es idempotente: limpiar dos veces da lo mismo', () => {
    // Se llama al crear Y al editar; si recortara un poco más en cada pasada,
    // el nombre se iría desgastando con cada guardado.
    const una = limpiarTextoDeCarta('🍖  Carne   asada 🔥');
    expect(limpiarTextoDeCarta(una)).toBe(una);
    expect(una).toBe('Carne asada');
  });

  it('teniaAdornos distingue el nombre que se va a ver distinto', () => {
    expect(teniaAdornos('🍖 Carne asada')).toBe(true);
    expect(teniaAdornos('Carne asada')).toBe(false);
    // Solo espacios de sobra no es «adorno», es trim normal.
    expect(teniaAdornos('  Carne asada  ')).toBe(false);
  });
});

describe('un producto sin nombre legible no se guarda', () => {
  it('acepta el nombre limpio', () => {
    expect(nombreDeProducto('  🍲 Caldo de costilla ')).toBe('Caldo de costilla');
  });

  it('un nombre que era SOLO un emoji se rechaza diciendo el motivo', () => {
    // Es el renglón «1× $23.000» de la captura: precio sin plato. Dejarlo
    // pasar deja una carta donde hay algo que nadie puede reconocer ni pedir.
    expect(() => nombreDeProducto('🍖')).toThrow(/solo un emoji/i);
    expect(() => nombreDeProducto('🔥🔥🔥')).toThrow(/solo un emoji/i);
  });

  it('vacío sigue siendo «obligatorio», que es otro error distinto', () => {
    // Dos mensajes porque son dos arreglos distintos: uno es escribir el
    // nombre, el otro es escribirlo con letras.
    expect(() => nombreDeProducto('')).toThrow(/obligatorio/i);
    expect(() => nombreDeProducto(null)).toThrow(/obligatorio/i);
    expect(() => nombreDeProducto('   ')).toThrow(/obligatorio/i);
  });
});
