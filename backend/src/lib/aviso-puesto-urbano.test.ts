import { describe, it, expect } from 'vitest';
import {
  MINUTOS_PARA_DECIR_YA,
  TITULO_PUESTO_PUBLICADO,
  cuandoSale,
  cuerpoDePuestoPublicado,
} from './aviso-puesto-urbano';

describe('cuandoSale', () => {
  it('lo inmediato se dice «ya», no con una hora', () => {
    // A tres minutos, «sale a las 18:42» obliga a mirar el reloj para
    // entender que es ahora.
    expect(cuandoSale(0)).toBe('Sale ya');
    expect(cuandoSale(3)).toBe('Sale ya');
    expect(cuandoSale(MINUTOS_PARA_DECIR_YA)).toBe('Sale ya');
  });

  it('una salida que ya pasó sigue diciendo «ya», no un negativo', () => {
    // Pasa de verdad: el taxista abre el aviso dos minutos después. «Sale en
    // -2 min» se lee como un fallo de la app.
    expect(cuandoSale(-2)).toBe('Sale ya');
  });

  it('minutos mientras sean minutos, y horas cuando son horas', () => {
    expect(cuandoSale(20)).toBe('Sale en 20 min');
    expect(cuandoSale(59)).toBe('Sale en 59 min');
    expect(cuandoSale(60)).toBe('Sale en 1 hora');
    expect(cuandoSale(180)).toBe('Sale en 3 horas');
  });

  it('un dato roto no deja el aviso a medias', () => {
    expect(cuandoSale(NaN)).toBe('Sale ya');
  });
});

describe('cuerpoDePuestoPublicado', () => {
  const base = {
    origen: 'Terminal de transportes',
    destino: 'Universidad de Pamplona',
    precioPorPuesto: 2000,
    puestos: 4,
    minutosHastaSalida: 25,
  };

  it('dice trayecto, cuándo y lo que deja el carro lleno', () => {
    expect(cuerpoDePuestoPublicado(base)).toBe(
      'Terminal de transportes → Universidad de Pamplona · Sale en 25 min · hasta $8.000 por 4 puestos',
    );
  });

  it('el dinero va en TOTAL, no por silla', () => {
    // Un taxista decide con lo que se lleva por el viaje: «$2.000 el puesto»
    // suena a nada al lado de una carrera mínima de $5.000, aunque sean
    // cuatro sillas.
    const c = cuerpoDePuestoPublicado(base);
    expect(c).toContain('$8.000');
    expect(c).not.toContain('$2.000');
  });

  it('dice «hasta», porque llenarse no está garantizado', () => {
    // Quien publica compró UNA silla; las otras pueden quedar vacías.
    // Prometer el total como seguro sería la primera queja.
    expect(cuerpoDePuestoPublicado(base)).toContain('hasta');
  });

  it('sin precio no se inventa una cifra', () => {
    const c = cuerpoDePuestoPublicado({ ...base, precioPorPuesto: 0 });
    expect(c).not.toContain('$');
    expect(c).toContain('Sale en 25 min');
  });

  it('sin los textos del trayecto no deja huecos', () => {
    const c = cuerpoDePuestoPublicado({ ...base, origen: '  ', destino: '' });
    expect(c).toContain('un punto de la ciudad');
    expect(c).not.toContain('→ ·');
  });

  it('el título es corto: la barra de notificaciones lo corta', () => {
    expect(TITULO_PUESTO_PUBLICADO.length).toBeLessThanOrEqual(40);
  });
});
