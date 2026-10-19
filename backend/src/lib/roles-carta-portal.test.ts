/**
 * El portal y el servidor nombran IGUAL el grupo de cada adicional.
 *
 * El portal pinta los grupos mientras el dueño cambia tipos, antes de enviar;
 * el servidor los crea. Si cada uno decidiera distinto, la vista previa diría
 * «Adiciones» y en la biblioteca aparecería «Adicionales», o un adicional que
 * el dueño vio en un grupo acabaría en otro. Mismo patrón que `moneda-portal`.
 */
import { describe, it, expect } from 'vitest';

import {
  agruparAdicionales as agruparServidor,
  agruparGuarniciones as guarnicionesServidor,
  destinoPorDefecto as destinoServidor,
  grupoDeAdicional as delServidor,
  GRUPO_ADICIONALES as delServidorNombre,
  GRUPO_GUARNICION as guarnicionServidorNombre,
  nombreDeAdicional as nombreServidor,
  ROLES_CARTA as rolesServidor,
} from './carta-rol';
import {
  agruparAdicionales as agruparPortal,
  agruparGuarniciones as guarnicionesPortal,
  destinoPorDefecto as destinoPortal,
  grupoDeAdicional as delPortal,
  GRUPO_ADICIONALES as delPortalNombre,
  GRUPO_GUARNICION as guarnicionPortalNombre,
  nombreDeAdicional as nombrePortal,
  ROLES_CARTA as rolesPortal,
} from '../../../app/roles-carta';

type Rol = 'plato' | 'adicional' | 'acompanamiento' | 'guarnicion';
const fila = (seccion: string, rol: Rol) => ({ seccion, rol });

const CASOS: Array<{ seccion: string; filas: Array<{ seccion: string; rol: Rol }> }> = [
  { seccion: 'ADICIONALES', filas: [fila('ADICIONALES', 'adicional'), fila('ADICIONALES', 'adicional')] },
  { seccion: 'Hamburguesas', filas: [fila('Hamburguesas', 'adicional'), fila('Hamburguesas', 'plato')] },
  { seccion: '', filas: [fila('', 'adicional')] },
  { seccion: '  Extras  ', filas: [fila('Extras', 'adicional')] },
  { seccion: 'Salsas', filas: [fila('Salsas', 'adicional'), fila('Salsas', 'acompanamiento')] },
  { seccion: 'Sin filas', filas: [] },
];

describe('portal y servidor deciden el mismo grupo', () => {
  it('el nombre por defecto es el mismo', () => {
    expect(delPortalNombre).toBe(delServidorNombre);
  });

  it.each(CASOS.map((c, i) => [i, c] as const))('caso %i', (_i, c) => {
    expect(delPortal(c.seccion, c.filas)).toBe(delServidor(c.seccion, c.filas));
  });
});

describe('portal y servidor agrupan IGUAL los adicionales', () => {
  const ad = (nombre: string, precio: number | null, seccion: string, rol: Rol = 'adicional') =>
    ({ nombre, precio, seccion, rol });
  const CARTAS = [
    // La sección «ADICIONALES» y un «+ Tocineta» suelto: UN solo grupo.
    [ad('Queso', 3000, 'ADICIONALES'), ad('+ Tocineta', 4000, 'Hamburguesas'), ad('Hamburguesa', 25000, 'Hamburguesas', 'plato')],
    // Dos listas distintas.
    [ad('Queso', 3000, 'Adiciones arepas'), ad('Tocineta', 4000, 'Adiciones hamburguesas')],
    // Repetidos y sin precio.
    [ad('Queso', 3000, 'Extras'), ad('+ queso', 3500, 'Extras'), ad('Huevo', null, 'Extras')],
    // Tildes y mayúsculas en el nombre del grupo.
    [ad('Queso', 3000, 'Adiciónes'), ad('Huevo', 2000, ''), ad('Arepa', 8000, '', 'plato')],
  ];

  it.each(CARTAS.map((c, i) => [i, c] as const))('carta %i', (_i, filas) => {
    expect(agruparPortal(filas)).toEqual(agruparServidor(filas).grupos);
  });

  it.each(['+ queso', '+queso', 'Adición de huevo', 'Extra tocineta', 'agregado de maíz', 'Aguacate', '+'])(
    'el nombre de la opción «%s»',
    (n) => {
      expect(nombrePortal(n)).toBe(nombreServidor(n));
    },
  );
});

describe('portal y servidor tratan IGUAL lo que viene con el plato', () => {
  it('los dos conocen los mismos tipos de fila', () => {
    // Un tipo que el portal ofrezca y el servidor no conozca se importaría
    // como plato sin decir nada (`sanearRol`).
    expect(rolesPortal.map((r) => r.valor).sort()).toEqual([...rolesServidor].sort());
    expect(guarnicionPortalNombre).toBe(guarnicionServidorNombre);
  });

  const g = (nombre: string, precio: number | null, seccion: string, rol: Rol = 'guarnicion') =>
    ({ nombre, precio, seccion, rol });
  const CARTAS = [
    // Lista en un renglón dentro de una sección de platos.
    [g('Bandeja', 28000, 'Platos fuertes', 'plato'), g('Papa a la francesa', null, 'Platos fuertes'), g('Arroz', null, 'Platos fuertes')],
    // Sección propia, con un recargo y un repetido.
    [g('Papa criolla', null, 'Escoge tu acompañamiento'), g('papa criolla', null, 'Escoge tu acompañamiento'), g('Yuca', 2000, 'Escoge tu acompañamiento')],
    // Dos secciones de platos con su lista cada una: dos grupos.
    [
      g('Sandwich', 19000, 'Sándwiches', 'plato'), g('Papa', null, 'Sándwiches'),
      g('Churrasco', 32000, 'Carnes', 'plato'), g('Arroz', null, 'Carnes'),
    ],
    // Un precio imposible no entra.
    [g('Papa', -1, 'Acompañamientos'), g('Arroz', null, 'Acompañamientos')],
  ];

  it.each(CARTAS.map((c, i) => [i, c] as const))('carta %i', (_i, filas) => {
    expect(guarnicionesPortal(filas)).toEqual(guarnicionesServidor(filas));
  });

  it.each([
    [['Platos fuertes'], ['Sándwiches', 'Platos fuertes']],
    [['Acompañamientos'], ['Sándwiches', 'Platos fuertes']],
    [[''], ['Arepas']],
    [['Carnes', 'Acompañamientos'], ['Carnes', 'Sopas']],
    [['Nada'], []],
  ])('el destino por defecto de %j', (origen, platos) => {
    expect(destinoPortal(origen, platos)).toEqual(destinoServidor(origen, platos));
  });
});
