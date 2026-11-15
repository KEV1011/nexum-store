/**
 * El acuse de pedidos y mandados tiene DOS mitades que nada más ata: las rutas
 * del servidor y la app del conductor que las llama. Si una se renombra sin la
 * otra, no falla nada — la app recibe un 404, lo toma por «servidor anterior»
 * y vuelve al socket a ciegas, que es exactamente el defecto que esto corrige.
 *
 * El comportamiento se comprueba contra PostgreSQL en
 * `e2e/acuse-pedidos-y-mandados.ts`; aquí se vigila el contrato.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ESTADOS_DE_MANDADO, ESTADOS_DE_PEDIDO } from './estado-por-conductor.service';

const raiz = join(__dirname, '..', '..', '..');
const leer = (...p: string[]) => readFileSync(join(raiz, ...p), 'utf8');

const rutas = leer('backend', 'src', 'routes', 'driver.routes.ts');
const indice = leer('backend', 'src', 'index.ts');
const app = leer('AppTransport', 'lib', 'shared', 'services', 'trip_completion.dart');
const pantalla = leer(
  'AppTransport', 'lib', 'features', 'active_trip', 'presentation', 'screens',
  'active_trip_screen.dart',
);

describe('acuse de pedidos y mandados: servidor y app dicen lo mismo', () => {
  it('las dos rutas existen y la app llama a esas mismas', () => {
    expect(rutas).toContain("router.post('/orders/:id/status'");
    expect(rutas).toContain("router.post('/errands/:id/status'");
    expect(app).toContain("'/driver/orders/$orderId/status'");
    expect(app).toContain("'/driver/errands/$errandId/status'");
  });

  it('el router del conductor se monta en /driver', () => {
    expect(indice).toMatch(/app\.use\('\/driver',/);
  });

  it('la marca del PIN rechazado es la misma en los dos lados', () => {
    expect(rutas).toContain("code: 'custody_pin'");
    expect(app).toContain("codigo == 'custody_pin'");
  });

  it('la app reconoce al servidor sin la ruta por el texto que ese servidor manda', () => {
    expect(indice).toContain("error: 'Route not found'");
    expect(app).toContain("error == 'Route not found'");
  });

  it('los estados que manda la pantalla son de los que el servidor acepta', () => {
    const paso = pantalla.match(/estadoPedido: '([a-z_]+)'/g) ?? [];
    const mandado = pantalla.match(/estadoMandado: '([a-z_]+)'/g) ?? [];
    expect(paso.length).toBeGreaterThan(0);
    expect(mandado.length).toBeGreaterThan(0);
    for (const m of paso) {
      expect(ESTADOS_DE_PEDIDO as readonly string[]).toContain(m.split("'")[1]);
    }
    for (const m of mandado) {
      expect(ESTADOS_DE_MANDADO as readonly string[]).toContain(m.split("'")[1]);
    }
  });

  it('por HTTP el mandadero no puede soltar el mandado', () => {
    // Soltarlo dejaría al cliente sin repartidor y sin que nadie vuelva a
    // buscarle uno: esa decisión es del cliente o del admin.
    expect(ESTADOS_DE_MANDADO as readonly string[]).not.toContain('cancelled');
    expect(ESTADOS_DE_PEDIDO as readonly string[]).not.toContain('cancelled');
  });
});
