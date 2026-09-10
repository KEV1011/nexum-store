/// A qué pantalla lleva cada notificación cuando el pasajero la toca.
///
/// Hasta ahora no llevaba a ninguna: la app registraba los mensajes de FCM pero
/// no escuchaba `onMessageOpenedApp` ni `getInitialMessage`. Tocar «Tu conductor
/// llegó» abría la app donde se hubiera quedado, y el pasajero tenía que
/// buscarse el viaje solo, con el taxi esperando en la puerta.
///
/// Vive suelto y probado porque es una tabla de decisiones: se lee entera de un
/// vistazo y una entrada mal puesta deja al usuario perdido justo cuando la
/// notificación le pedía que hiciera algo.
library;

import 'package:nexum_client/app/router/app_router.dart';

/// La ruta para un `data` de FCM, o null si esa notificación no lleva a ningún
/// sitio concreto (la app se queda donde está).
String? rutaDeNotificacion(Map<String, dynamic> data) {
  final tipo = data['type'];
  if (tipo is! String || tipo.isEmpty) return null;

  final tripId = data['tripId'];
  final orderId = data['orderId'];

  switch (tipo) {
    // El viaje en curso: al seguimiento, que es donde está el mapa, el
    // conductor y el estado. Sin `tripId` no se puede armar la ruta —es
    // paramétrica— así que se cae al home en vez de romper la navegación.
    case 'trip_accepted':
    case 'trip_arrived':
    case 'trip_in_progress':
      return tripId is String && tripId.isNotEmpty
          ? AppRoutes.transportTrackingPath(tripId)
          : AppRoutes.home;

    // Ya terminó: el seguimiento de un viaje cerrado no tiene nada que enseñar.
    case 'trip_completed':
    case 'trip_cancelled':
    case 'trip_no_driver':
      return AppRoutes.home;

    case 'order_accepted':
    case 'order_preparing':
    case 'order_ready':
    case 'order_in_transit':
      return orderId is String && orderId.isNotEmpty
          ? AppRoutes.orderPath(orderId)
          : AppRoutes.home;

    case 'order_delivered':
    case 'order_cancelled':
    case 'order_no_driver':
      return AppRoutes.home;

    case 'errand_accepted':
    case 'errand_delivered':
    case 'errand_cancelled':
    case 'errand_no_driver':
      return AppRoutes.errandStatus;

    case 'intercity_update':
    case 'intercity_cancelled':
    case 'intercity_no_driver':
      return AppRoutes.intercityStatus;

    case 'freight_accepted':
    case 'freight_in_progress':
    case 'freight_completed':
    case 'freight_reopened':
    case 'freight_cancelled':
      return AppRoutes.freight;

    default:
      return null;
  }
}
