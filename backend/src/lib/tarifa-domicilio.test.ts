import { describe, expect, it } from 'vitest';
import {
  DOMICILIO_FIJO_POR_DEFECTO,
  domicilioDeTienda,
  domicilioFijo,
  modoDomicilio,
} from './tarifa-domicilio';

describe('el domicilio lo fija ZIPA', () => {
  it('sin configurar nada son 4.000, aunque el local haya puesto otro', () => {
    expect(DOMICILIO_FIJO_POR_DEFECTO).toBe(4000);
    expect(domicilioDeTienda(2500, undefined)).toBe(4000);
    expect(domicilioDeTienda(9000, '')).toBe(4000);
    expect(modoDomicilio(undefined)).toBe('fijo-4000');
  });

  it('se cambia con la variable, con o sin puntos y signo', () => {
    expect(domicilioDeTienda(2500, '3500')).toBe(3500);
    expect(domicilioDeTienda(2500, '$5.000')).toBe(5000);
    expect(domicilioDeTienda(2500, '0')).toBe(0);
  });

  it('«comercio» devuelve el mando a cada local', () => {
    expect(domicilioFijo('comercio')).toBeNull();
    expect(domicilioDeTienda(2500, 'comercio')).toBe(2500);
    expect(domicilioDeTienda(null, 'comercio')).toBe(0);
    expect(modoDomicilio('comercio')).toBe('por-comercio');
  });

  it('un valor ilegible o absurdo NO apaga el fijo', () => {
    // Dejar que cada local volviera a poner el suyo por un error de escritura
    // cambiaría el precio en toda la app sin que nadie lo decidiera.
    expect(domicilioDeTienda(2500, 'cuatro mil')).toBe(4000);
    expect(domicilioDeTienda(2500, '400000')).toBe(4000);
    expect(domicilioDeTienda(2500, '-100')).toBe(4000);
  });
});
