import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Que NINGUNA ruta del panel nazca abierta.
 *
 * La protección era una lista de rutas a proteger, así que cada ruta nueva
 * quedaba pública hasta que alguien se acordara de apuntarla. No nos acordamos
 * dos veces, y una de las dos era grave: `POST /municipalities/:slug/commission`
 * permitía a cualquiera —sin identificarse— fijar la comisión de una plaza al
 * máximo, cambiando en silencio lo que cobra cada conductor de esa ciudad.
 * `/diagnostics` llevaba además un comentario afirmando que estaba protegida.
 *
 * Ahora se falla cerrado y esto lo vigila: el guard debe ser una sola función
 * que cubre TODO menos una lista explícita de excepciones, y esa lista no puede
 * crecer sin que alguien lo vea aquí.
 */
const FUENTE = readFileSync(join(__dirname, 'admin.routes.ts'), 'utf8');

// Lo único que puede estar abierto: el login (con su propio límite de intentos)
// y el HTML del panel, que no lleva datos dentro.
const EXCEPCIONES_ESPERADAS = ['/', '/auth/send-otp', '/auth/verify-otp'];

describe('el panel de administración falla cerrado', () => {
  it('el guard cubre todo el router, no una lista de rutas', () => {
    // La forma vieja: `router.use([...rutas], requireAdmin)`. Si alguien la
    // reintroduce, el panel vuelve a nacer abierto ruta a ruta.
    expect(FUENTE).not.toMatch(/router\.use\(\s*\[/);
    expect(FUENTE).toMatch(/router\.use\(\s*\(req[\s\S]{0,200}requireAdmin\(req, res, next\)/);
  });

  it('las excepciones son exactamente el login y el HTML', () => {
    const bloque = /const RUTAS_PUBLICAS = new Set\(\[([^\]]*)\]\)/.exec(FUENTE);
    expect(bloque, 'la lista de excepciones cambió de forma').not.toBeNull();
    const rutas = [...bloque![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    // Igualdad, no «incluye»: añadir una excepción tiene que romper esto para
    // que sea una decisión y no un descuido.
    expect(rutas.sort()).toEqual([...EXCEPCIONES_ESPERADAS].sort());
  });

  it('el guard se declara ANTES que las rutas que protege', () => {
    // Express recorre en orden: una ruta declarada por encima del guard no
    // pasa por él nunca.
    const guard = FUENTE.indexOf('const RUTAS_PUBLICAS');
    expect(guard).toBeGreaterThan(-1);
    const despues = FUENTE.slice(guard);
    // Todas las rutas de datos viven debajo. Se comprueban las que ya se
    // colaron una vez, más una muestra de las de siempre.
    for (const ruta of ['/municipalities', '/me', '/diagnostics', '/metrics', '/drivers', '/operators']) {
      expect(despues, `${ruta} quedó por encima del guard`).toContain(`'${ruta}`);
    }
    // Y el login, arriba: si cayera debajo, nadie podría pedir su código.
    const arriba = FUENTE.slice(0, guard);
    expect(arriba).toContain("'/auth/send-otp'");
    expect(arriba).toContain("'/auth/verify-otp'");
  });
});
