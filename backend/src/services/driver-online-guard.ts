// ── ¿Puede este conductor ponerse en línea? ───────────────────────────────────
//
// La respuesta vive en UN solo sitio a propósito.
//
// Antes las dos comprobaciones —identidad verificada (KYC) y documentos
// vigentes (kill-switch)— estaban escritas dentro de `PUT /driver/status`. El
// problema es que **ninguna app llama a esa ruta**: el conductor se pone en
// línea al conectar el WebSocket, y ahí la transición era un `updateMany`
// pelado, sin comprobar nada. Las guardas estaban puestas en una puerta por la
// que nadie entra.
//
// Lo que sí protegía era el matching, que excluye a los BLOQUEADOS. Sirve —
// nadie recibe viajes— pero deja al conductor apareciendo "en línea" en el
// panel y en el portal de su empresa sin que nadie entienda por qué no
// trabaja, y convierte `KYC_ENFORCE` en un interruptor que no hace nada.
//
// Ahora la decisión se toma aquí y la llaman los dos caminos.

import { kycEnforced, pilotSkipVerification } from './kyc.service';
import { docKillSwitchEnforced, getDriverCompliance } from './document-expiry.service';
import { getEstadoHabilitacion } from './driver-profile.service';
import { prisma } from '../lib/prisma';
import { motivoDeBloqueo, type EstadoKyc, type MotivoBloqueo } from '../lib/bloqueo-conductor';

export type { MotivoBloqueo };

/**
 * Devuelve el motivo por el que NO puede conectarse, o `null` si puede.
 *
 * Los dos gates son opt-in por variable de entorno: con ambos apagados esto
 * devuelve siempre `null` y el comportamiento es idéntico al de hoy, que es lo
 * que permite encenderlos sin dejar fuera de golpe a los conductores actuales.
 *
 * El motivo es ESPECÍFICO —qué documento falta, si la identidad está en
 * revisión, qué dijo el admin al rechazar— porque el mensaje genérico que había
 * antes no le decía al conductor si tenía que hacer algo o esperar. Ver
 * `lib/bloqueo-conductor` para el orden y los textos.
 */
export async function motivoParaNoConectar(
  driverId: string,
): Promise<MotivoBloqueo | null> {
  // El permiso del piloto salta la verificación de IDENTIDAD, y solo esa.
  //
  // No salta los documentos vencidos: el bypass existe para arrancar sin
  // esperar a validar cédulas una por una, no para que alguien lleve pasajeros
  // con el SOAT caducado. Son cosas distintas — una es papeleo nuestro, la
  // otra es el seguro del pasajero.
  const gateKyc = kycEnforced() && !pilotSkipVerification();
  const gateDocs = docKillSwitchEnforced();
  // Sin ningún gate activo no hace falta ni consultar la base.
  if (!gateKyc && !gateDocs) return null;

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { kycStatus: true, isVerified: true },
  });
  if (!driver) return null;

  let vencidos: string | null = null;
  if (gateDocs) {
    const compliance = await getDriverCompliance(driverId);
    if (compliance.status === 'BLOCKED') {
      vencidos = compliance.reason ?? 'documentos vencidos';
    }
  }

  // Los documentos solo se detallan si alguno de los dos gates los mira. El
  // kill-switch mira vencimientos; el gate de identidad exige `isVerified`,
  // que sale de tener los obligatorios aprobados.
  const estado = gateKyc && !driver.isVerified
    ? await getEstadoHabilitacion(driverId)
    : null;

  return motivoDeBloqueo({
    documentosFaltantes: estado?.documentosFaltantes ?? [],
    documentosRechazados: estado?.documentosRechazados ?? [],
    estadoKyc: driver.kycStatus as EstadoKyc,
    documentosVencidos: vencidos,
    exigeKyc: gateKyc,
  });
}
