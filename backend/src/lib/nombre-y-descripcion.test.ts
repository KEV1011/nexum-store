import { describe, it, expect } from 'vitest';
import { separarDescripcion, pareceDescripcion } from './nombre-y-descripcion';

describe('separar el plato de sus ingredientes', () => {
  // Los que trajo el usuario en sus capturas, tal cual estaban en el catálogo.
  describe('los casos reales de BETO y Mi cafetal', () => {
    it('parte el paréntesis de una hamburguesa', () => {
      const r = separarDescripcion(
        'Hamburguesa Camarón (Croqueta de carne, camarón apanado, queso, salsas)',
      );
      expect(r.nombre).toBe('Hamburguesa Camarón');
      expect(r.descripcion).toBe('Croqueta de carne, camarón apanado, queso, salsas');
    });

    it('parte los dos puntos de un omelette', () => {
      const r = separarDescripcion('Omelette americano: Jamón, queso mozzarella, tomate');
      expect(r.nombre).toBe('Omelette americano');
      expect(r.descripcion).toBe('Jamón, queso mozzarella, tomate');
    });

    it('parte el plato más largo de la carta', () => {
      const r = separarDescripcion(
        'Hamburguesa Beto (Dos croquetas de carne, pollo desmechado, tocineta, '
        + 'vegetales, doble jamón, doble queso doble crema, salsas y porción de papas)',
      );
      expect(r.nombre).toBe('Hamburguesa Beto');
      expect(r.descripcion).toContain('Dos croquetas de carne');
      expect(r.descripcion).toContain('porción de papas');
    });

    it('parte aunque el lector se haya comido el paréntesis de cierre', () => {
      // Pasa a menudo: el OCR lee el «(» y pierde el «)», o al revés.
      const r = separarDescripcion(
        'HAMBURGUESA COMBO (Hamburguesa sencilla, papas y gaseosa',
      );
      expect(r.nombre).toBe('HAMBURGUESA COMBO');
      expect(r.descripcion).toBe('Hamburguesa sencilla, papas y gaseosa');
    });

    it('parte una cacerola con marca en el nombre', () => {
      const r = separarDescripcion(
        'Cacerola de chicharrón La Fazenda: Chicharrón, arepa, hogao y papa criolla',
      );
      expect(r.nombre).toBe('Cacerola de chicharrón La Fazenda');
      expect(r.descripcion).toBe('Chicharrón, arepa, hogao y papa criolla');
    });
  });

  // Lo que NO se puede separar. Cada uno rompería algo distinto.
  describe('los calificadores se quedan en el nombre', () => {
    it('no separa cuántas unidades te dan', () => {
      // «Empanadas» y «Empanadas (3)» son productos distintos: separarlo
      // dejaría dos platos llamados igual a precios distintos.
      expect(separarDescripcion('Empanadas (3)').descripcion).toBeUndefined();
      expect(separarDescripcion('Empanadas (3)').nombre).toBe('Empanadas (3)');
    });

    it('no separa una medida', () => {
      expect(separarDescripcion('Jugo de mango (350 ml)').descripcion).toBeUndefined();
      expect(separarDescripcion('Gaseosa (1.5 lt)').descripcion).toBeUndefined();
    });

    it('no separa un tamaño, que es lo que rompería las variantes', () => {
      // Si «Picada (grande)» perdiera el tamaño, quedaría «Picada» igual que
      // «Picada (pequeña)» → dos productos con el mismo nombre, y
      // `carta-variantes` ya no podría proponer agruparlos.
      expect(separarDescripcion('Picada (grande)').nombre).toBe('Picada (grande)');
      expect(separarDescripcion('Picada (familiar)').nombre).toBe('Picada (familiar)');
      expect(separarDescripcion('Jugo (vaso grande)').nombre).toBe('Jugo (vaso grande)');
    });

    it('no separa una hora ni una proporción', () => {
      expect(separarDescripcion('Desayuno 7:30 a 10:00').descripcion).toBeUndefined();
    });

    it('no deja un plato sin nombre', () => {
      // Sin nada delante del separador no hay cómo llamar al producto, así
      // que la línea se devuelve TAL CUAL —con sus paréntesis— y el dueño la
      // ve en la vista previa. La primera versión de esta prueba pedía que
      // además se le quitaran los paréntesis, y eso estaba mal: este módulo
      // separa, no maquilla. Un nombre reescrito a medias es más difícil de
      // detectar en la vista previa que uno que se ve raro entero.
      const r = separarDescripcion('(Croqueta de carne, cebolla, queso)');
      expect(r.nombre).toBe('(Croqueta de carne, cebolla, queso)');
      expect(r.descripcion).toBeUndefined();
    });
  });

  describe('la regla de forma', () => {
    it('una enumeración con comas siempre es descripción', () => {
      expect(pareceDescripcion('pollo, arroz, papa')).toBe(true);
    });

    it('una o dos palabras cortas no lo son', () => {
      expect(pareceDescripcion('grande')).toBe(false);
      expect(pareceDescripcion('vaso grande')).toBe(false);
      expect(pareceDescripcion('x2')).toBe(false);
      expect(pareceDescripcion('3')).toBe(false);
    });

    it('varias palabras sin comas sí lo son', () => {
      expect(pareceDescripcion('con papas y gaseosa incluidas')).toBe(true);
    });

    it('una medida escrita en largo no lo es', () => {
      // Casi todo dígitos: es un tamaño, no una receta.
      expect(pareceDescripcion('1 1/2 350 400 500')).toBe(false);
    });
  });

  describe('no estropea lo que ya está bien', () => {
    it('deja intacto un nombre sin separadores', () => {
      expect(separarDescripcion('Hamburguesa sencilla')).toEqual({
        nombre: 'Hamburguesa sencilla',
      });
    });

    it('es idempotente', () => {
      const una = separarDescripcion('Omelette americano: Jamón, queso, tomate');
      const dos = separarDescripcion(una.nombre);
      expect(dos.nombre).toBe(una.nombre);
      expect(dos.descripcion).toBeUndefined();
    });

    it('se queda con el separador que viene antes', () => {
      const r = separarDescripcion('Combo: hamburguesa, papas (con gaseosa)');
      expect(r.nombre).toBe('Combo');
      expect(r.descripcion).toBe('hamburguesa, papas (con gaseosa)');
    });

    it('aguanta un nombre vacío sin lanzar', () => {
      expect(separarDescripcion('').nombre).toBe('');
      expect(separarDescripcion('   ').nombre).toBe('');
    });
  });
});
