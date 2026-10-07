/// A qué pantalla lleva cada notificación cuando el conductor la toca.
///
/// Hasta ahora no llevaba a ninguna: la app registraba los mensajes de FCM pero
/// no escuchaba `onMessageOpenedApp` ni `getInitialMessage`, así que tocar
/// «Nueva solicitud de viaje» abría la app en la pantalla en la que se hubiera
/// quedado. Con la mano en el volante, eso es una notificación inútil.
///
/// Vive suelto y probado porque es una tabla de decisiones: se lee entera de un
/// vistazo y una entrada mal puesta manda al conductor al sitio equivocado en
/// el peor momento posible.
library;

import 'package:nexum_driver/app/router/app_router.dart';

/// La ruta para un `data` de FCM, o null si esa notificación no lleva a ningún
/// sitio concreto (entonces la app se queda donde está, que es mejor que
/// sacar al conductor de lo que estaba haciendo).
String? rutaDeNotificacion(Map<String, dynamic> data) {
  final tipo = data['type'];
  if (tipo is! String || tipo.isEmpty) return null;

  switch (tipo) {
    // La oferta entra por WebSocket y se pinta sobre el home. Aquí solo hay
    // que traerlo al home para que la vea; la oferta en sí no viaja en el push.
    case 'trip_request':
    case 'errand_request':
    case 'order_request':
    case 'intercity_request':
      return AppRoutes.home;

    // El pasajero canceló mientras iba en camino. Al home: el viaje ya no
    // existe, y `/active-trip` lo devolvería solo con una pantalla vacía.
    case 'trip_cancelled':
    case 'errand_cancelled':
    case 'order_cancelled':
      return AppRoutes.home;

    // Documentos: vencidos, por vencer, o revisados por el admin. Es lo único
    // que puede dejarlo sin trabajar, así que va directo a resolverlo.
    case 'document':
    case 'compliance_update':
      return AppRoutes.verification;

    // La reserva: el recordatorio de media hora antes y el aviso de que ya
    // empieza. Van al tablero de reservas, que es donde está el botón de
    // «Iniciar viaje» de una carrera apartada hace días — el home no la
    // conoce, porque no entró por el socket en esta sesión.
    case 'reserva_recordatorio':
    case 'reserva_activa':
      return AppRoutes.reservas;

    // Alguien compró un puesto en una salida suya. Va a «Mis salidas»,
    // donde está el manifiesto con el nombre y dónde recoger a cada uno:
    // el home no sabe nada de esa salida, que se publicó hace días.
    case 'pooled_booking':
    // Un pasajero publicó un viaje por puestos y está esperando a que alguien
    // lo tome: el aviso tiene que caer en el tablero donde se toma, no en el
    // inicio. Sin esto, el push abriría la app y el taxista tendría que
    // buscarlo en el cajón lateral — que es el problema que el aviso viene a
    // resolver.
    case 'pooled_urban_new':
      return AppRoutes.pooledTrips;

    case 'support_reply':
      return AppRoutes.support;

    case 'freight_new':
    case 'freight_assigned':
    case 'freight_cancelled':
      return AppRoutes.driverFreights;

    case 'payment':
    case 'payout':
      return AppRoutes.wallet;

    // Alertas de seguridad y avisos de «llevas rato sin moverte»: el conductor
    // ya está en su viaje, no hay que moverlo de ahí.
    default:
      return null;
  }
}
