import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  PAQUETE_APP_CLIENTE,
  appleAppSiteAssociation,
  assetLinks,
  huellasValidas,
} from '../../../app/enlaces-app';

/**
 * Los archivos con los que Android e iPhone verifican que el QR de la mesa
 * puede abrir la APP (`app/.well-known/*`). Viven en el portal y se prueban
 * aquí, donde corre vitest (patrón de `app/moneda.ts`).
 *
 * Lo que rompe sin avisar: una huella mal copiada hace que Android rechace el
 * archivo ENTERO (y el QR abre la web sin que nadie sepa por qué), y un
 * paquete distinto del de la app verifica… otra app.
 */
const HUELLA = Array.from({ length: 32 }, (_, i) => (i + 10).toString(16).padStart(2, '0'))
  .join(':')
  .toUpperCase();

describe('enlaces de la app (App Links / Universal Links)', () => {
  it('sin huella publicada no se autoriza nada: el QR sigue abriendo la web', () => {
    expect(assetLinks(undefined)).toEqual([]);
    expect(assetLinks('')).toEqual([]);
  });

  it('una huella mal escrita se descarta en vez de envenenar el archivo', () => {
    expect(huellasValidas(`${HUELLA}, AB:CD, basura`)).toEqual([HUELLA]);
    expect(huellasValidas(HUELLA.toLowerCase())).toEqual([HUELLA]);
  });

  it('con huella, autoriza a la app del CLIENTE', () => {
    const [d] = assetLinks(HUELLA);
    expect(d?.target.package_name).toBe(PAQUETE_APP_CLIENTE);
    expect(d?.target.sha256_cert_fingerprints).toEqual([HUELLA]);
    expect(d?.relation).toEqual(['delegate_permission/common.handle_all_urls']);
  });

  it('el paquete es el applicationId real de la app cliente', () => {
    const gradle = readFileSync(
      join(__dirname, '../../../AppCliente/android/app/build.gradle.kts'),
      'utf8',
    );
    const id = /applicationId\s*=\s*"([^"]+)"/.exec(gradle)?.[1];
    expect(id).toBe(PAQUETE_APP_CLIENTE);
  });

  it('iPhone: sin Team ID no hay apps; con él, solo /carta/*', () => {
    expect(appleAppSiteAssociation(undefined)).toEqual({ applinks: { details: [] } });
    expect(appleAppSiteAssociation('corto')).toEqual({ applinks: { details: [] } });
    const a = appleAppSiteAssociation('abcde12345');
    expect(a.applinks.details[0]?.appIDs).toEqual([`ABCDE12345.${PAQUETE_APP_CLIENTE}`]);
    expect(a.applinks.details[0]?.components).toEqual([{ '/': '/carta/*' }]);
  });

  it('las rutas de Android y de la app coinciden con las del portal', () => {
    const manifiesto = readFileSync(
      join(__dirname, '../../../AppCliente/android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifiesto).toContain('android:autoVerify="true"');
    expect(manifiesto).toContain('android:pathPrefix="/carta/"');
  });
});
