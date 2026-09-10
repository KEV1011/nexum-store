import { describe, it, expect } from 'vitest';
import {
  cuentaElogios,
  ELOGIOS_AL_CONDUCTOR,
  etiquetaDeElogio,
  MAX_ELOGIOS_POR_VIAJE,
  saneaElogios,
} from './elogios';

describe('saneaElogios', () => {
  it('acepta los del catálogo', () => {
    expect(saneaElogios(['puntual', 'carro_limpio'])).toEqual(['puntual', 'carro_limpio']);
  });

  it('DESCARTA lo que no está en el catálogo', () => {
    // Si se guardara texto libre, el perfil de un conductor acabaría con
    // etiquetas escritas por un teléfono. Un elogio inventado es tan grave
    // como una verificación falsa.
    expect(saneaElogios(['maneja_volando', 'puntual'])).toEqual(['puntual']);
    expect(saneaElogios(['inventado'])).toBeNull();
  });

  it('no repite el mismo elogio', () => {
    expect(saneaElogios(['puntual', 'puntual', 'puntual'])).toEqual(['puntual']);
  });

  it('corta en el tope: marcar todo no destaca nada', () => {
    const todos = ELOGIOS_AL_CONDUCTOR.map((e) => e.clave);
    expect(saneaElogios(todos)).toHaveLength(MAX_ELOGIOS_POR_VIAJE);
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(saneaElogios([' PUNTUAL '])).toEqual(['puntual']);
  });

  it('sin nada marcado devuelve null, no un array vacío', () => {
    // «No marcó nada» y «marcó cosas que no existen» se guardan igual, que es
    // lo correcto: ninguno de los dos es un elogio.
    expect(saneaElogios([])).toBeNull();
    expect(saneaElogios(null)).toBeNull();
    expect(saneaElogios(undefined)).toBeNull();
    expect(saneaElogios('puntual')).toBeNull();
    expect(saneaElogios([1, 2, 3])).toBeNull();
  });
});

describe('cuentaElogios', () => {
  it('suma las veces de cada uno', () => {
    const r = cuentaElogios([
      ['puntual', 'carro_limpio'],
      ['puntual'],
      ['puntual', 'amable'],
    ]);
    expect(r[0]).toEqual({ clave: 'puntual', etiqueta: 'Puntual', veces: 3 });
  });

  it('ordena de más a menos', () => {
    const r = cuentaElogios([['puntual'], ['puntual'], ['amable']]);
    expect(r.map((e) => e.clave)).toEqual(['puntual', 'amable']);
  });

  it('NO enseña los que nadie marcó', () => {
    // «Buena música · 0» es ruido, y además se lee como un reproche.
    const r = cuentaElogios([['puntual']]);
    expect(r).toHaveLength(1);
    expect(r.every((e) => e.veces > 0)).toBe(true);
  });

  it('sin elogios devuelve una lista vacía', () => {
    expect(cuentaElogios([])).toEqual([]);
    expect(cuentaElogios([null, undefined])).toEqual([]);
  });

  it('limpia lo guardado por versiones anteriores', () => {
    // En la base puede haber una etiqueta que después se retiró del catálogo.
    const r = cuentaElogios([['puntual', 'etiqueta_retirada']]);
    expect(r.map((e) => e.clave)).toEqual(['puntual']);
  });

  it('una clave sin etiqueta se OMITE en vez de reventar', () => {
    // El saneado ya la habría filtrado; esto es la red de abajo. Lo sirve una
    // ruta pública, y un fallo ahí sería un 500 para todo el mundo.
    expect(() => cuentaElogios([['inventada_sin_etiqueta']])).not.toThrow();
    expect(cuentaElogios([['inventada_sin_etiqueta']])).toEqual([]);
  });

  it('un empate se desempata por nombre, no al azar', () => {
    // Si no, el perfil enseñaría los elogios en distinto orden en cada carga.
    const r = cuentaElogios([['puntual', 'amable']]);
    expect(r.map((e) => e.etiqueta)).toEqual(['Amable', 'Puntual']);
  });
});

describe('catálogo', () => {
  it('no repite claves', () => {
    const claves = ELOGIOS_AL_CONDUCTOR.map((e) => e.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('toda clave tiene su etiqueta en español', () => {
    for (const e of ELOGIOS_AL_CONDUCTOR) {
      expect(etiquetaDeElogio(e.clave)).toBe(e.etiqueta);
    }
  });

  it('una clave desconocida no tiene etiqueta', () => {
    expect(etiquetaDeElogio('inventada')).toBeNull();
  });

  it('el tope deja fuera al menos uno: elegir es el punto', () => {
    expect(MAX_ELOGIOS_POR_VIAJE).toBeLessThan(ELOGIOS_AL_CONDUCTOR.length);
  });
});
