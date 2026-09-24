/**
 * E2E del canal de contacto legal y de la publicación de versiones.
 *
 * Los dos agujeros que cierra, y que valen distinto:
 *
 *  1. **La política no se podía corregir.** `getActiveLegalDoc` solo sembraba
 *     la v1 si no había ninguna, y no existía ninguna función para publicar
 *     otra. En cuanto producción sembró la suya, cambiar el texto en el código
 *     dejó de tener efecto: un documento legal congelado para siempre.
 *  2. **Decía «Contacto: el canal de soporte dentro de la app».** Circular:
 *     quien la desinstaló no puede pedir que borremos sus datos. Play lo exige
 *     accesible sin instalar y la Ley 1581 obliga a publicar un canal.
 *
 * Y la invariante que sostiene la constancia de consentimiento: **nunca puede
 * haber dos versiones activas del mismo documento**. Si las hubiera, dos
 * usuarios aceptarían textos distintos bajo la misma etiqueta.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/legal-contacto.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

async function rechaza(nombre: string, fn: () => Promise<unknown>, patron: RegExp): Promise<void> {
  try {
    await fn();
    comprobar(nombre, false, 'no lanzó');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    comprobar(nombre, patron.test(msg), `mensaje: ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log('\n═══ E2E: contacto legal y versionado ═══\n');

  // Base limpia de documentos: este E2E crea versiones y hay que poder
  // repetirlo. Los consentimientos apuntan a versiones por texto, no por FK.
  await prisma.legalDocument.deleteMany({ where: { version: { startsWith: 'e2e-' } } });
  await prisma.legalDocument.updateMany({ data: { active: false } });
  await prisma.legalDocument.deleteMany({});

  // ── 1. Sin variables de entorno ────────────────────────────────────────
  // Antes esto publicaba una política SIN canal de atención, y era el caso que
  // de verdad se desplegaba: nadie se acordaba de poner la variable en los dos
  // servicios. Ahora hay un buzón real por defecto, así que lo que se comprueba
  // es que el documento salga completo igualmente — sin inventar nada.
  console.log('1. Sin variables, se publica el buzón real de ZIPA');
  delete process.env['SUPPORT_EMAIL'];
  delete process.env['PRIVACY_EMAIL'];
  delete process.env['LEGAL_EMAIL'];

  let legal = await import('../src/services/legal.service');
  const { contactoLegalConfigurado, BUZON_ZIPA } = await import('../src/lib/contacto');

  comprobar('el diagnóstico lo da por publicado', contactoLegalConfigurado() === true);

  const v1 = await legal.getActiveLegalDoc('PRIVACY');
  comprobar('se siembra la v1 sola', Boolean(v1.version), v1.version);
  comprobar(
    'con el buzón real dentro del texto',
    v1.body.includes(BUZON_ZIPA),
    (v1.body.match(/\S+@\S+/) ?? ['—'])[0],
  );
  comprobar(
    'y ya no dice que el canal está pendiente',
    !/pendiente de publicar/i.test(v1.body),
  );

  // ── 2. Con correo configurado ──────────────────────────────────────────
  console.log('\n2. Con canal configurado, la política lo publica');
  process.env['SUPPORT_EMAIL'] = 'soporte@zipa-prueba.co';
  process.env['PRIVACY_EMAIL'] = 'privacidad@zipa-prueba.co';

  // Los contactos se leen en cada llamada, pero el módulo de textos se importó
  // ya: se recarga para reflejar el entorno como haría un proceso nuevo.
  legal = await import('../src/services/legal.service');

  const v2 = await legal.publishLegalDoc('PRIVACY', { version: 'e2e-v2' });
  comprobar('publica una versión nueva', v2.version === 'e2e-v2', v2.version);

  const vigente = await legal.getActiveLegalDoc('PRIVACY');
  comprobar('y pasa a ser la vigente', vigente.version === 'e2e-v2', vigente.version);
  comprobar(
    'con el correo de privacidad dentro del texto',
    vigente.body.includes('privacidad@zipa-prueba.co'),
  );
  comprobar(
    'y citando la ley que lo respalda',
    vigente.body.includes('1581'),
  );
  comprobar(
    'ya no dice que el contacto está dentro de la app',
    !/canal de soporte dentro de la app/i.test(vigente.body),
  );

  // ── 3. La invariante: una sola activa ──────────────────────────────────
  console.log('\n3. Nunca dos versiones activas del mismo documento');
  await legal.publishLegalDoc('PRIVACY', { version: 'e2e-v3' });
  const activas = await prisma.legalDocument.count({
    where: { kind: 'PRIVACY', active: true },
  });
  comprobar('solo una activa tras publicar dos veces', activas === 1, String(activas));

  const historial = await prisma.legalDocument.count({ where: { kind: 'PRIVACY' } });
  comprobar(
    'y las anteriores se conservan como historial',
    historial >= 3,
    String(historial),
  );

  // ── 4. Guards ──────────────────────────────────────────────────────────
  console.log('\n4. Lo que no se deja hacer');
  await rechaza(
    'reutilizar una etiqueta de versión',
    // Dos textos distintos bajo la misma etiqueta y nadie sabría cuál aceptó
    // cada quien: la constancia de consentimiento dejaría de probar nada.
    () => legal.publishLegalDoc('PRIVACY', { version: 'e2e-v3' }),
    /Ya existe una versión/i,
  );
  await rechaza(
    'publicar un texto que no es un documento',
    () => legal.publishLegalDoc('PRIVACY', { version: 'e2e-v4', body: 'corto' }),
    /demasiado corto/i,
  );
  await rechaza(
    'publicar sin etiqueta',
    () => legal.publishLegalDoc('PRIVACY', { version: '   ' }),
    /vacía/i,
  );

  // ── 5. El consentimiento se invalida con la versión ────────────────────
  console.log('\n5. Publicar obliga a volver a aceptar');
  const usuario = await prisma.user.create({
    data: { name: 'Titular', phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}` },
  });
  await legal.recordConsent('user', usuario.id);
  comprobar(
    'tras aceptar, el consentimiento está vigente',
    (await legal.hasCurrentConsent('user', usuario.id)) === true,
  );

  await legal.publishLegalDoc('PRIVACY', { version: 'e2e-v5' });
  comprobar(
    'y deja de estarlo al publicar una versión nueva',
    (await legal.hasCurrentConsent('user', usuario.id)) === false,
    'el consentimiento sobrevivió al cambio de versión',
  );

  await prisma.$disconnect();
  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLO(S)`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
