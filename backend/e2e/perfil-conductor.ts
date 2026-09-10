/**
 * E2E del perfil público del conductor.
 *
 * El endpoint existía y ninguna pantalla lo abría: los datos que dan confianza
 * llevaban meses guardados sin verlos nadie. Al sacarlos a la luz aparece un
 * riesgo nuevo, y es el que vigila esta prueba: **una marca de verificación es
 * una promesa**. Si dice «SOAT vigente» y el seguro está vencido, alguien se
 * sube confiando en algo que no comprobamos.
 *
 * Corre contra PostgreSQL real porque las fechas de vencimiento se guardan como
 * texto y el criterio es una comparación sobre esos datos.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/perfil-conductor.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const enDias = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function main(): Promise<void> {
  const { getDriverPublicProfile } = await import(
    '../src/services/driver-profile.service'
  );

  const conductor = await prisma.driver.create({
    data: {
      phone: `+5731${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: 'Nelson Prueba Perfil',
    },
  });

  const marca = async (clave: string): Promise<boolean> => {
    const p = await getDriverPublicProfile(conductor.id);
    return p!.verificaciones!.find((v) => v.clave === clave)!.verificada;
  };

  console.log('\n═══ Un conductor recién registrado no verifica nada ═══');
  {
    const p = await getDriverPublicProfile(conductor.id);
    comprobar('el perfil existe', p !== null);
    comprobar('cero verificaciones', p!.verificacionesCumplidas === 0,
      String(p!.verificacionesCumplidas));
    comprobar('pero se enseñan las seis, no se esconden las que faltan',
      p!.verificacionesTotal === 6 && p!.verificaciones!.length === 6);
    comprobar('sin calificaciones la nota va en null, NO en 5,0',
      p!.rating === null, String(p!.rating));
    comprobar('y el conteo en cero', p!.ratingCount === 0, String(p!.ratingCount));
  }

  console.log('\n═══ Los antecedentes sin consultar no son "limpios" ═══');
  {
    comprobar('UNCHECKED no verifica', (await marca('antecedentes')) === false);
    await prisma.driver.update({
      where: { id: conductor.id }, data: { backgroundStatus: 'HIT' },
    });
    comprobar('un HALLAZGO tampoco', (await marca('antecedentes')) === false);
    await prisma.driver.update({
      where: { id: conductor.id }, data: { backgroundStatus: 'CLEAR' },
    });
    comprobar('CLEAR sí verifica', (await marca('antecedentes')) === true);
  }

  console.log('\n═══ La identidad en revisión todavía no está verificada ═══');
  {
    await prisma.driver.update({
      where: { id: conductor.id }, data: { kycStatus: 'IN_REVIEW' },
    });
    comprobar('IN_REVIEW no verifica', (await marca('identidad')) === false);
    await prisma.driver.update({
      where: { id: conductor.id }, data: { kycStatus: 'VERIFIED' },
    });
    comprobar('VERIFIED sí', (await marca('identidad')) === true);
  }

  console.log('\n═══ UN SOAT VENCIDO NO ES «SOAT VIGENTE» ═══');
  {
    // La comprobación que sostiene la pantalla. El seguro del año pasado no
    // cubre al pasajero de hoy, por muy aprobado que esté en la base.
    await prisma.driverDocument.create({
      data: {
        driverId: conductor.id, type: 'SOAT', fileUrl: '/uploads/soat.png',
        status: 'APPROVED', expiresAt: enDias(-1),
      },
    });
    comprobar('aprobado pero vencido → NO verifica', (await marca('soat')) === false);

    await prisma.driverDocument.update({
      where: { driverId_type: { driverId: conductor.id, type: 'SOAT' } },
      data: { expiresAt: enDias(30) },
    });
    comprobar('renovado → sí verifica', (await marca('soat')) === true);

    await prisma.driverDocument.update({
      where: { driverId_type: { driverId: conductor.id, type: 'SOAT' } },
      data: { status: 'PENDING' },
    });
    comprobar('vigente pero sin aprobar → NO verifica', (await marca('soat')) === false);
  }

  console.log('\n═══ El conteo refleja lo que hay ═══');
  {
    await prisma.driverDocument.update({
      where: { driverId_type: { driverId: conductor.id, type: 'SOAT' } },
      data: { status: 'APPROVED' },
    });
    await prisma.driver.update({
      where: { id: conductor.id }, data: { avatarUrl: '/uploads/foto.png' },
    });
    const p = await getDriverPublicProfile(conductor.id);
    // identidad + antecedentes + SOAT + foto = 4; faltan licencia y tarjeta.
    comprobar('4 de 6', p!.verificacionesCumplidas === 4,
      String(p!.verificacionesCumplidas));
    comprobar('licencia sigue sin verificar', (await marca('licencia')) === false);
    comprobar('tarjeta de propiedad tampoco', (await marca('tarjeta')) === false);
  }

  await prisma.driverDocument.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });

  console.log(`\n${fallos === 0 ? '✅ Todo en verde' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
