import { describe, it, expect } from 'vitest';
import {
  faseDePrueba,
  nombreDeFirmante,
  LARGO_MAX_FIRMANTE,
} from './prueba-de-entrega';

describe('faseDePrueba', () => {
  it('reconoce las tres fases', () => {
    expect(faseDePrueba('pickup')).toBe('pickup');
    expect(faseDePrueba('delivery')).toBe('delivery');
    expect(faseDePrueba('signature')).toBe('signature');
  });

  it('una app vieja que no manda fase sigue entregando', () => {
    // Esta es la que de verdad vigila la prueba: el repartidor con el APK de
    // hace dos meses manda la foto de entrega SIN el campo `phase`. Si eso
    // dejara de caer en 'delivery', sus entregas se guardarían en otra
    // columna o se rechazarían, y nadie se enteraría hasta que un cliente
    // reclamara una entrega sin prueba.
    expect(faseDePrueba(undefined)).toBe('delivery');
    expect(faseDePrueba(null)).toBe('delivery');
    expect(faseDePrueba('')).toBe('delivery');
  });

  it('un valor inventado no se toma por firma', () => {
    // Lo desconocido cae en 'delivery', NUNCA en 'signature': escribir
    // `signedAt` sobre algo que no era una firma deja una constancia
    // diciendo que alguien firmó cuando nadie firmó.
    expect(faseDePrueba('firma')).toBe('delivery');
    expect(faseDePrueba('SIGNATURE')).toBe('delivery');
    expect(faseDePrueba(' signature ')).toBe('delivery');
    expect(faseDePrueba(42)).toBe('delivery');
    expect(faseDePrueba({ phase: 'signature' })).toBe('delivery');
  });
});

describe('nombreDeFirmante', () => {
  it('toma el nombre y le quita los espacios de los bordes', () => {
    expect(nombreDeFirmante('  María Pérez  ')).toBe('María Pérez');
  });

  it('sin nombre devuelve null, no cadena vacía', () => {
    // Un `''` guardado se pinta como un nombre en blanco bajo el trazo y se
    // lee como un fallo de la app, no como «no lo dijo».
    expect(nombreDeFirmante(undefined)).toBeNull();
    expect(nombreDeFirmante('')).toBeNull();
    expect(nombreDeFirmante('   ')).toBeNull();
    expect(nombreDeFirmante(null)).toBeNull();
    expect(nombreDeFirmante(123)).toBeNull();
  });

  it('un pegado accidental no entra entero', () => {
    const largo = 'a'.repeat(500);
    const r = nombreDeFirmante(largo);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(LARGO_MAX_FIRMANTE);
  });

  it('recortar no deja un espacio colgando al final', () => {
    // Cortar en seco puede dejar el nombre terminado en espacio; se limpia
    // otra vez DESPUÉS del corte.
    const v = `${'a'.repeat(LARGO_MAX_FIRMANTE - 1)} bbbb`;
    expect(nombreDeFirmante(v)).toBe('a'.repeat(LARGO_MAX_FIRMANTE - 1));
  });
});
