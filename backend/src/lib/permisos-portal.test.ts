import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  casaRuta,
  PERMISOS_PERSONAL,
  recibeAviso,
  reglaDe,
  ROLES_PERSONAL,
  rutaPermitida,
  SOLO_DEL_DUENO,
  type RolPortal,
} from './permisos-portal';
import {
  ACCIONES,
  PANTALLAS,
  PANTALLAS_DEL_ROL,
  ROLES_PERSONAL as ROLES_DEL_PORTAL,
  type Pantalla,
} from '../../../app/negocio/acceso';

/** Las rutas `/:token/...` tal como están declaradas en el router. */
function rutasDelPortal(): Array<{ metodo: string; ruta: string }> {
  const fuente = readFileSync(join(__dirname, '../routes/business.routes.ts'), 'utf8');
  const out: Array<{ metodo: string; ruta: string }> = [];
  for (const m of fuente.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    if (!m[2]!.startsWith('/:token')) continue;
    out.push({ metodo: m[1]!.toUpperCase(), ruta: m[2]!.slice('/:token'.length) || '/' });
  }
  return out;
}

/** Una petición de ejemplo para la ruta: cada parámetro por un valor. */
function ejemplo(ruta: string): string {
  return ruta
    .split('/')
    .map((s) => (s.startsWith(':') ? (s.endsWith('?') ? 'opt1' : 'abc123') : s))
    .join('/');
}

const clave = (r: { metodo: string; ruta: string }) => `${r.metodo} ${r.ruta}`;

describe('cada ruta del portal está clasificada (falla cerrada)', () => {
  const rutas = rutasDelPortal();
  const declaradas = new Set(rutas.map(clave));
  const abiertas = new Set(PERMISOS_PERSONAL.map(clave));
  const delDueno = new Set(SOLO_DEL_DUENO.map(clave));

  it('se encontraron las rutas', () => {
    // Un cambio en cómo se declaran las rutas dejaría esta prueba sin nada
    // que mirar — y en verde.
    expect(rutas.length).toBeGreaterThan(60);
  });

  it('ninguna ruta queda sin decidir', () => {
    const sinClasificar = [...declaradas].filter((r) => !abiertas.has(r) && !delDueno.has(r));
    expect(sinClasificar).toEqual([]);
  });

  it('ninguna regla apunta a una ruta que ya no existe', () => {
    expect([...abiertas].filter((r) => !declaradas.has(r))).toEqual([]);
    expect([...delDueno].filter((r) => !declaradas.has(r))).toEqual([]);
  });

  it('ninguna ruta está en las dos listas', () => {
    expect([...abiertas].filter((r) => delDueno.has(r))).toEqual([]);
  });

  it('cada ruta casa con SU regla y no con la de otra (sin solapes)', () => {
    for (const r of rutas) {
      const regla = reglaDe(r.metodo, ejemplo(r.ruta));
      if (delDueno.has(clave(r))) {
        expect(regla, clave(r)).toBeNull();
      } else {
        expect(regla && clave(regla), clave(r)).toBe(clave(r));
      }
    }
  });
});

describe('qué puede cada rol', () => {
  const casos: Array<[RolPortal, string, string, boolean]> = [
    // La cocina: su tablero y marcar listo. Nada más.
    ['COCINA', 'GET', '/cocina', true],
    ['COCINA', 'POST', '/client-orders/o1/ready', true],
    ['COCINA', 'DELETE', '/cocina/o1/listo', true],
    ['COCINA', 'GET', '/orders', false],
    ['COCINA', 'GET', '/ventas', false],
    ['COCINA', 'POST', '/client-orders/o1/accept', false],
    // El mesero: mesas y cuentas, servir; cobrar NO.
    ['MESERO', 'GET', '/cuentas', true],
    ['MESERO', 'GET', '/mesas', true],
    ['MESERO', 'POST', '/client-orders/o1/servido', true],
    ['MESERO', 'POST', '/cuentas/t1/cerrar', false],
    ['MESERO', 'GET', '/caja', false],
    ['MESERO', 'PUT', '/mesas', false],
    // La caja: caja, cobrar y los pedidos del día.
    ['CAJA', 'POST', '/caja/abrir', true],
    ['CAJA', 'POST', '/cuentas/t1/cerrar', true],
    ['CAJA', 'GET', '/orders', true],
    ['CAJA', 'POST', '/client-orders/o1/accept', true],
    ['CAJA', 'GET', '/products', false],
    ['CAJA', 'GET', '/ventas', false],
    // El encargado: todo menos lo que es del dueño.
    ['ENCARGADO', 'PATCH', '/products/p1', true],
    ['ENCARGADO', 'PUT', '/settings', true],
    ['ENCARGADO', 'GET', '/ventas.csv', true],
    ['ENCARGADO', 'GET', '/giros', false],
    ['ENCARGADO', 'PUT', '/clave', false],
    ['ENCARGADO', 'GET', '/equipo', false],
    ['ENCARGADO', 'DELETE', '/equipo/s1', false],
    // El dueño, todo.
    ['DUENO', 'GET', '/giros', true],
    ['DUENO', 'POST', '/equipo', true],
  ];
  for (const [rol, metodo, ruta, esperado] of casos) {
    it(`${rol} ${metodo} ${ruta} → ${esperado ? 'sí' : 'no'}`, () => {
      expect(rutaPermitida(rol, metodo, ruta)).toBe(esperado);
    });
  }

  it('una ruta que nadie clasificó es solo del dueño', () => {
    for (const rol of ROLES_PERSONAL) {
      expect(rutaPermitida(rol, 'POST', '/ruta-nueva-que-nadie-pensó')).toBe(false);
      // El método cuenta: GET de /cocina no abre un DELETE de /cocina.
      expect(rutaPermitida(rol, 'DELETE', '/cocina')).toBe(false);
    }
    expect(rutaPermitida('DUENO', 'POST', '/ruta-nueva-que-nadie-pensó')).toBe(true);
  });

  it('HEAD vale lo que vale el GET', () => {
    expect(rutaPermitida('COCINA', 'HEAD', '/cocina')).toBe(true);
    expect(rutaPermitida('COCINA', 'HEAD', '/ventas')).toBe(false);
  });

  it('un segmento de más no abre la ruta corta', () => {
    expect(casaRuta('/cuentas/:tabId', '/cuentas/t1/cerrar')).toBe(false);
    expect(rutaPermitida('MESERO', 'GET', '/cuentas/t1/algo')).toBe(false);
  });

  it('el parámetro opcional casa con y sin él', () => {
    expect(casaRuta('/option-groups/:groupId?', '/option-groups')).toBe(true);
    expect(casaRuta('/option-groups/:groupId?', '/option-groups/g1')).toBe(true);
    expect(casaRuta('/option-groups/:groupId?', '/option-groups/g1/x')).toBe(false);
  });

  it('los avisos en vivo: los giros solo al dueño', () => {
    expect(recibeAviso('DUENO', 'giro')).toBe(true);
    for (const rol of ROLES_PERSONAL) expect(recibeAviso(rol, 'giro')).toBe(false);
    expect(recibeAviso('COCINA', 'sin_repartidor')).toBe(false);
    expect(recibeAviso('CAJA', 'sin_repartidor')).toBe(true);
    for (const rol of ROLES_PERSONAL) expect(recibeAviso(rol, 'pedido')).toBe(true);
  });
});

describe('el portal enseña lo mismo que el servidor abre', () => {
  it('los mismos roles en los dos lados', () => {
    expect([...ROLES_DEL_PORTAL]).toEqual([...ROLES_PERSONAL]);
  });

  it('cada pantalla que ve un rol carga sin «sin permiso»', () => {
    const todos: RolPortal[] = ['DUENO', ...ROLES_PERSONAL];
    for (const rol of todos) {
      for (const pantalla of PANTALLAS_DEL_ROL[rol]) {
        for (const peticion of PANTALLAS[pantalla].carga) {
          const [m, r] = peticion.split(' ');
          expect(rutaPermitida(rol, m!, ejemplo(r!)), `${rol} → ${pantalla}: ${peticion}`).toBe(true);
        }
      }
    }
  });

  it('y la que NO ve, el servidor tampoco se la abre', () => {
    // Si el servidor abriera la pantalla, esconderla sería quitarle al rol algo
    // que sí puede hacer — un error tan real como el contrario.
    for (const rol of ROLES_PERSONAL) {
      const ve = new Set<Pantalla>(PANTALLAS_DEL_ROL[rol]);
      for (const pantalla of Object.keys(PANTALLAS) as Pantalla[]) {
        if (ve.has(pantalla)) continue;
        const abre = PANTALLAS[pantalla].carga.every((p) => {
          const [m, r] = p.split(' ');
          return rutaPermitida(rol, m!, ejemplo(r!));
        });
        expect(abre, `${rol} no ve «${pantalla}» pero el servidor se la abriría`).toBe(false);
      }
    }
  });

  it('los botones por rol coinciden con lo que deja el servidor', () => {
    const todos: RolPortal[] = ['DUENO', ...ROLES_PERSONAL];
    for (const [nombre, a] of Object.entries(ACCIONES)) {
      const [m, r] = a.peticion.split(' ');
      for (const rol of todos) {
        const enseña = (a.roles as readonly string[]).includes(rol);
        expect(enseña, `${nombre} para ${rol}`).toBe(rutaPermitida(rol, m!, ejemplo(r!)));
      }
    }
  });

  it('cada pantalla pide de verdad lo que dice que pide', () => {
    // Si la lista de `carga` fuera inventada, las dos pruebas de arriba no
    // probarían nada. Se busca cada petición en el archivo de su pantalla.
    const archivo: Record<Pantalla, string> = {
      pedidos: 'page.tsx',
      pedido: 'pedido/[id]/page.tsx',
      cocina: 'cocina/page.tsx',
      cuentas: 'cuentas/page.tsx',
      cuenta: 'cuenta/[tabId]/page.tsx',
      caja: 'caja/page.tsx',
      ventas: 'ventas/page.tsx',
      catalogo: 'catalogo/page.tsx',
      ajustes: 'ajustes/page.tsx',
    };
    const raiz = join(__dirname, '../../../app/negocio/[token]');
    for (const [pantalla, ruta] of Object.entries(archivo) as Array<[Pantalla, string]>) {
      const fuente = readFileSync(join(raiz, ruta), 'utf8').replace(/\$\{[^}]+\}/g, ':p');
      for (const peticion of PANTALLAS[pantalla].carga) {
        const camino = peticion.split(' ')[1]!.replace(/:[a-zA-Z]+/g, ':p');
        expect(fuente.includes(`business/:p${camino}`), `${pantalla} pide ${peticion}`).toBe(true);
      }
    }
  });
});
