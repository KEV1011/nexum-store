/**
 * Qué decir sobre el estado de las notificaciones push.
 *
 * Vive suelto y probado porque un diagnóstico que se equivoca es peor que no
 * tenerlo: da tranquilidad falsa. Y aquí el caso que importa es justo el que
 * `/health` NO puede ver — **Firebase perfectamente configurado con cero
 * tokens registrados da el mismo resultado que no tener push** (nadie recibe
 * nada) y no deja una sola pista.
 */

export interface EntradaVeredictoPush {
  /** Firebase inicializó de verdad. */
  activo: boolean;
  conductoresTotal: number;
  conductoresConToken: number;
  enviados: number;
  fallidos: number;
  ultimoError: string | null;
}

export function veredictoPush(e: EntradaVeredictoPush): string {
  if (!e.activo) {
    return 'Sin FIREBASE_SERVICE_ACCOUNT: los avisos se escriben en el log y no sale ninguno. '
      + 'El conductor solo se entera con la app abierta.';
  }

  // Todos los envíos fallando: son credenciales o proyecto equivocado, y se ve
  // antes que la cobertura porque afecta también a los que sí tienen token.
  if (e.fallidos > 0 && e.enviados === 0) {
    return `Todos los envíos están fallando: ${e.ultimoError ?? 'sin detalle'}.`;
  }

  // Sin conductores en la plataforma no hay nada que acusar: es una base
  // vacía, no una configuración rota.
  if (e.conductoresTotal === 0) {
    return 'Push configurado. Todavía no hay conductores registrados.';
  }

  if (e.conductoresConToken === 0) {
    return 'Firebase está bien, pero NINGÚN conductor tiene token registrado: no le llega un solo aviso. '
      + 'El token se registra al abrir el home con sesión iniciada; si no aparece, revisa que el APK '
      + 'lleve google-services.json y que el permiso de notificaciones esté concedido.';
  }

  const sinToken = e.conductoresTotal - e.conductoresConToken;
  if (sinToken > 0) {
    return `${sinToken} conductor(es) sin token: a esos no les llega ningún aviso. `
      + 'Suele ser permiso de notificaciones denegado o que no han vuelto a abrir la app.';
  }

  return 'Push operativo: todos los conductores tienen token registrado.';
}
