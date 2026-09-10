/**
 * E2E de la habilitación del conductor.
 *
 * Esta función decide si una persona trabaja hoy. Las unitarias fijan los
 * textos y el orden (`lib/bloqueo-conductor`); aquí se comprueba contra la base
 * real que los datos que la alimentan son los correctos — qué documentos
 * cuentan, qué mira cada interruptor, y que el botón del admin desbloquea de
 * verdad.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/habilitacion-conductor.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

/** Los interruptores se leen de `process.env` en cada llamada. */
function conGates(kyc: boolean, docs: boolean, piloto = false): void {
  process.env['KYC_ENFORCE'] = String(kyc);
  process.env['DOC_KILL_SWITCH_ENFORCE'] = String(docs);
  process.env['PILOT_SKIP_VERIFICATION'] = String(piloto);
  if (piloto) {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    process.env['PILOT_SKIP_VERIFICATION_UNTIL'] = manana;
  } else {
    delete process.env['PILOT_SKIP_VERIFICATION_UNTIL'];
  }
}

async function main(): Promise<void> {
  const { motivoParaNoConectar } = await import('../src/services/driver-online-guard');
  const { setDriverKycStatus } = await import('../src/services/kyc.service');
  const { setDriverVerified } = await import('../src/services/admin.service');

  const marca = `e2ehab-${Date.now()}`;
  const conductor = await prisma.driver.create({
    data: { name: `${marca} Nelson`, phone: tel('31'), isVerified: false },
  });

  const OBLIGATORIOS = ['CEDULA', 'LICENSE', 'SOAT', 'PROPERTY_CARD'] as const;
  const subirDocs = async (estado: 'APPROVED' | 'PENDING' | 'REJECTED', motivo?: string) => {
    await prisma.driverDocument.deleteMany({ where: { driverId: conductor.id } });
    for (const t of OBLIGATORIOS) {
      await prisma.driverDocument.create({
        data: {
          driverId: conductor.id, type: t, fileUrl: 'https://x/y.png',
          status: estado, ...(motivo ? { rejectionReason: motivo } : {}),
        },
      });
    }
  };

  // ── 1. Con los gates apagados, nadie se queda fuera ────────────────────────
  console.log('\n1. Los interruptores apagados');
  {
    conGates(false, false);
    comprobar('sin gates, cualquiera se conecta',
      (await motivoParaNoConectar(conductor.id)) === null);
  }

  // ── 2. El gate de identidad, con el detalle de lo que falta ────────────────
  console.log('\n2. Identidad activada');
  {
    conGates(true, false);

    await subirDocs('PENDING');
    const m1 = await motivoParaNoConectar(conductor.id);
    comprobar('sin documentos aprobados, bloquea',
      m1?.code === 'documentos_pendientes', JSON.stringify(m1));
    comprobar('y NOMBRA los documentos que faltan',
      Boolean(m1 && /SOAT vigente/.test(m1.error)), m1?.error);

    await subirDocs('REJECTED', 'la foto está cortada');
    const m2 = await motivoParaNoConectar(conductor.id);
    comprobar('un rechazo trae el motivo del admin',
      Boolean(m2 && m2.error.includes('la foto está cortada')), m2?.error);

    // Documentos aprobados: ahora el que falta es el KYC.
    await subirDocs('APPROVED');
    await setDriverVerified(conductor.id, true);
    await prisma.driver.update({
      where: { id: conductor.id }, data: { kycStatus: 'PENDING' },
    });
    const m3 = await motivoParaNoConectar(conductor.id);
    comprobar('con documentos al día, pide la selfie',
      Boolean(m3 && /selfie/i.test(m3.error)), m3?.error);
    comprobar('y la pelota es del conductor', m3?.responsable === 'conductor');

    await prisma.driver.update({
      where: { id: conductor.id }, data: { kycStatus: 'IN_REVIEW' },
    });
    const m4 = await motivoParaNoConectar(conductor.id);
    comprobar('en revisión, NO se le pide nada más',
      m4?.responsable === 'nosotros', JSON.stringify(m4));
    comprobar('y se le dice que no tiene que hacer nada',
      Boolean(m4 && /no tienes que hacer nada/i.test(m4.error)), m4?.error);

    await setDriverKycStatus(conductor.id, 'VERIFIED');
    comprobar('verificado, ya puede conectarse',
      (await motivoParaNoConectar(conductor.id)) === null);
  }

  // ── 3. El permiso del piloto NO tapa un documento vencido ──────────────────
  console.log('\n3. El permiso del piloto');
  {
    // Un conductor nuevo, sin nada aprobado.
    const novato = await prisma.driver.create({
      data: { name: `${marca} Novato`, phone: tel('32'), isVerified: false },
    });

    conGates(true, false, true);
    comprobar('con el piloto activo, la identidad no bloquea',
      (await motivoParaNoConectar(novato.id)) === null);

    // Y ahora con documentos vencidos: el piloto NO debe taparlo. El bypass es
    // para no validar cédulas una por una, no para llevar pasajeros sin SOAT.
    conGates(true, true, true);
    await prisma.driver.update({
      where: { id: novato.id },
      data: { complianceStatus: 'BLOCKED', blockedReason: 'SOAT vencido el 01/09' },
    });
    const m = await motivoParaNoConectar(novato.id);
    comprobar('pero un documento VENCIDO sigue bloqueando durante el piloto',
      m?.code === 'documents_expired', JSON.stringify(m));
    comprobar('con el motivo concreto',
      Boolean(m && m.error.includes('SOAT vencido el 01/09')), m?.error);

    await prisma.driverDocument.deleteMany({ where: { driverId: novato.id } });
    await prisma.driver.delete({ where: { id: novato.id } });
  }

  // ── 4. El botón «Habilitar» del admin ──────────────────────────────────────
  console.log('\n4. Un clic del admin');
  {
    conGates(true, false);
    const pendiente = await prisma.driver.create({
      data: { name: `${marca} Pendiente`, phone: tel('33'), isVerified: false },
    });
    for (const t of OBLIGATORIOS) {
      await prisma.driverDocument.create({
        data: { driverId: pendiente.id, type: t, fileUrl: 'https://x/y.png', status: 'PENDING' },
      });
    }
    comprobar('antes del clic, bloqueado',
      (await motivoParaNoConectar(pendiente.id)) !== null);

    // Lo que hace la ruta /admin/drivers/:id/habilitar.
    await setDriverVerified(pendiente.id, true);
    await setDriverKycStatus(pendiente.id, 'VERIFIED');
    comprobar('después del clic, puede conectarse',
      (await motivoParaNoConectar(pendiente.id)) === null);

    // Pero si tiene un documento vencido, el clic NO basta y hay que decirlo.
    conGates(true, true);
    await prisma.driver.update({
      where: { id: pendiente.id },
      data: { complianceStatus: 'BLOCKED', blockedReason: 'licencia vencida' },
    });
    const m = await motivoParaNoConectar(pendiente.id);
    comprobar('con un documento vencido el clic no basta, y se avisa',
      m?.code === 'documents_expired', JSON.stringify(m));

    await prisma.driverDocument.deleteMany({ where: { driverId: pendiente.id } });
    await prisma.driver.delete({ where: { id: pendiente.id } });
  }

  // Limpieza.
  await prisma.driverDocument.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });

  console.log(
    `\n${fallos === 0
      ? '✅ El conductor sabe qué le falta, y el piloto no tapa un SOAT vencido'
      : `❌ ${fallos} fallo(s)`}\n`,
  );
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
