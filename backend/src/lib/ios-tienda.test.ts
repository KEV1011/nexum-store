import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que una app de iOS necesita para pasar por TestFlight y que NADA avisa
// cuando falta.
//
// No hay Xcode en este entorno ni en el CI de cada push (el build de iOS es
// manual porque los runners macOS cuestan diez veces más). Así que estas cosas,
// si se rompen, se descubren con la app ya subida — o en la revisión de Apple:
//
//   · Un ícono que es el de Flutter, o con canal alfa (App Store Connect
//     rechaza el de 1024 con alfa). Pasó: el repo tenía el de Flutter y el
//     workflow lo pisaba con un pin dibujado en Python.
//   · Un entitlements que existe pero nadie enlaza, o que se enlaza y le falta
//     la capacidad: los avisos no llegan, «Continuar con Apple» falla al
//     tocarlo, y el QR de la mesa abre Safari. Compila igual.
//   · Un dato que la app lee por --dart-define y el workflow no pasa: queda
//     vacío y la función se apaga sin un error.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8');

const APPS = [
  { dir: 'AppCliente', bundle: 'com.zipa.cliente', opciones: 'lib/core/services/opciones_firebase.dart' },
  { dir: 'AppTransport', bundle: 'com.zipa.conductor', opciones: 'lib/shared/services/opciones_firebase.dart' },
] as const;

const WORKFLOW = leer('.github', 'workflows', 'build-ios.yml');

/** El ícono de Flutter que había antes (sha256 del PNG de 1024). */
const ICONO_DE_FLUTTER = '7770183009e914112de7d8ef1d235a6a30c5834424858e0d2f8253f6b8d31926';

/** Tipo de color de un PNG (byte 25 de la cabecera IHDR). 4 y 6 llevan alfa. */
function tipoDeColorPng(buf: Buffer): number {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return buf[25]!;
}

describe.each(APPS)('$dir en iPhone', ({ dir, bundle, opciones }) => {
  const pbx = leer(dir, 'ios', 'Runner.xcodeproj', 'project.pbxproj');

  it('el ícono de 1024 es el de la marca y no lleva canal alfa', () => {
    const png = readFileSync(join(
      RAIZ, dir, 'ios', 'Runner', 'Assets.xcassets', 'AppIcon.appiconset', 'Icon-App-1024x1024@1x.png',
    ));
    expect(createHash('sha256').update(png).digest('hex')).not.toBe(ICONO_DE_FLUTTER);
    expect([4, 6]).not.toContain(tipoDeColorPng(png));
    // Y del tamaño que pide la tienda.
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
  });

  it('el identificador del proyecto es el que el workflow espera', () => {
    expect(pbx).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${bundle};`);
    expect(WORKFLOW).toContain(`bundle: ${bundle}`);
  });

  it('el entitlements existe y lo enlazan las tres configuraciones del Runner', () => {
    expect(existsSync(join(RAIZ, dir, 'ios', 'Runner', 'Runner.entitlements'))).toBe(true);
    const enlaces = pbx.match(/CODE_SIGN_ENTITLEMENTS = Runner\/Runner\.entitlements;/g) ?? [];
    expect(enlaces).toHaveLength(3);
  });

  it('pide el permiso de avisos (sin él iOS no da token y no llega ningún push)', () => {
    expect(leer(dir, 'ios', 'Runner', 'Runner.entitlements')).toMatch(
      /<key>aps-environment<\/key>\s*<string>development<\/string>/,
    );
  });

  it('solo iPhone: con iPad, Apple exige capturas de iPad y la revisa en iPad', () => {
    expect(pbx).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(pbx).toMatch(/TARGETED_DEVICE_FAMILY = 1;/);
  });

  it('el workflow pasa TODOS los datos que la app lee por --dart-define', () => {
    const dart = leer(dir, opciones);
    const nombres = [...dart.matchAll(/String\.fromEnvironment\('([A-Z_]+)'\)/g)].map((m) => m[1]!);
    expect(nombres.length).toBe(5);
    for (const n of nombres) expect(WORKFLOW).toContain(`--dart-define=${n}=`);
  });
});

describe('AppCliente: Apple, Google y el QR de la mesa', () => {
  const ent = leer('AppCliente', 'ios', 'Runner', 'Runner.entitlements');

  it('trae «Continuar con Apple» (la app lo ofrece nativo en iPhone)', () => {
    expect(ent).toContain('com.apple.developer.applesignin');
  });

  it('los dominios del QR son los MISMOS que los de Android', () => {
    const manifiesto = leer('AppCliente', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const android = [...manifiesto.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1]!).sort();
    const ios = [...ent.matchAll(/applinks:([^<\s]+)/g)].map((m) => m[1]!).sort();
    expect(android.length).toBeGreaterThan(0);
    expect(ios).toEqual(android);
  });

  it('Google en iPhone: el workflow le pone su esquema y la app recibe su id', () => {
    // Sin el esquema la librería nativa cierra la app al tocar el botón; sin
    // el id, la app no lo pinta. Tienen que viajar juntos.
    expect(WORKFLOW).toContain('CFBundleURLSchemes');
    expect(WORKFLOW).toContain('--dart-define=GOOGLE_IOS_CLIENT_ID=');
    const dart = leer('AppCliente', 'lib', 'features', 'auth', 'presentation', 'widgets', 'acceso_social.dart');
    expect(dart).toContain("String.fromEnvironment('GOOGLE_IOS_CLIENT_ID')");
  });
});

describe('el workflow de iOS', () => {
  it('no genera íconos: usa los del repo', () => {
    // Era el paso que dibujaba un pin con Python encima del logo real.
    expect(WORKFLOW).not.toContain('assets/icons');
    // Lo que se EJECUTA, no lo que se comenta: la cabecera lo menciona.
    expect(WORKFLOW).not.toMatch(/dart run flutter_launcher_icons/);
  });

  it('rechaza un GoogleService-Info.plist de la otra app', () => {
    expect(WORKFLOW).toMatch(/"\$BUNDLE" != "\$ESPERADO"/);
  });

  it('no usa mapfile (el bash de macOS es el 3.2 y no lo tiene)', () => {
    expect(WORKFLOW).not.toMatch(/^\s*mapfile\b/m);
  });
});
