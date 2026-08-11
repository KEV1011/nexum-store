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

import { kycEnforced, isDriverCleared } from './kyc.service';
import { docKillSwitchEnforced, getDriverCompliance } from './document-expiry.service';

export interface MotivoBloqueo {
  /** Código estable para que la app reaccione (abrir Verificación, etc.). */
  code: 'driver_not_cleared' | 'documents_expired';
  /** Mensaje listo para enseñar, en español. */
  error: string;
}

/**
 * Devuelve el motivo por el que NO puede conectarse, o `null` si puede.
 *
 * Los dos gates son opt-in por variable de entorno: con ambos apagados esto
 * devuelve siempre `null` y el comportamiento es idéntico al de hoy, que es lo
 * que permite encenderlos sin dejar fuera de golpe a los conductores actuales.
 */
export async function motivoParaNoConectar(
  driverId: string,
): Promise<MotivoBloqueo | null> {
  if (kycEnforced() && !(await isDriverCleared(driverId))) {
    return {
      code: 'driver_not_cleared',
      error:
        'Debes completar la verificación de identidad y documentos antes de conectarte.',
    };
  }

  if (docKillSwitchEnforced()) {
    const compliance = await getDriverCompliance(driverId);
    if (compliance.status === 'BLOCKED') {
      return {
        code: 'documents_expired',
        error:
          `Tu cuenta está suspendida: ${compliance.reason ?? 'documentos vencidos'}. ` +
          'Renueva tus documentos en Verificación para volver a conectarte.',
      };
    }
  }

  return null;
}
