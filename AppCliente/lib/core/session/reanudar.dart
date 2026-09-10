// ── ¿A qué pantalla vuelve el pasajero al reabrir la app? ────────────────────
//
// Android mata las apps que están en segundo plano cuando necesita memoria, y
// no hay forma de impedirlo: pasa en cualquier teléfono y es más agresivo en
// los que traen ahorro de batería de fábrica. Así que la app no puede
// "aguantar" en el fondo — lo que tiene que hacer es VOLVER bien.
//
// Antes no volvía. El estado del viaje sí se recuperaba (está guardado en el
// teléfono y el provider lo relee al arrancar), pero la navegación arrancaba
// siempre en el inicio: la persona salía a WhatsApp con un taxi en camino,
// volvía, y se encontraba la pantalla de pedir un viaje como si nada
// estuviera pasando. Tenía el viaje, no lo veía.
//
// La decisión vive aquí suelta porque es una regla de producto con casos
// límite (varios servicios abiertos a la vez, empates) y porque así se puede
// probar sin arrancar la app entera.

/// Qué clase de servicio sigue abierto.
enum TipoServicioAbierto { viaje, pedido }

/// Un servicio del pasajero que todavía no ha terminado.
class ServicioAbierto {
  const ServicioAbierto({
    required this.id,
    required this.tipo,
    required this.creado,
  });

  final String id;
  final TipoServicioAbierto tipo;
  final DateTime creado;
}

/// La ruta a la que hay que llevar al pasajero, o `null` para dejarlo en el
/// inicio.
///
/// Reglas, y el porqué de cada una:
///
/// - **Sin nada abierto no se mueve a nadie.** Mandar a alguien a la pantalla
///   de un viaje terminado es peor que no hacer nada.
/// - **Manda el más reciente.** Quien pidió comida hace media hora y un taxi
///   hace dos minutos está pendiente del taxi.
/// - **En empate exacto gana el viaje.** Es el único de los dos que deja a una
///   persona parada en la calle mirando la puerta.
String? rutaDeReanudacion(
  List<ServicioAbierto> abiertos, {
  String Function(String id) rutaViaje = _rutaViaje,
  String Function(String id) rutaPedido = _rutaPedido,
}) {
  if (abiertos.isEmpty) return null;

  final ordenados = [...abiertos]..sort((a, b) {
      final porFecha = b.creado.compareTo(a.creado);
      if (porFecha != 0) return porFecha;
      // Mismo instante: primero el viaje.
      if (a.tipo == b.tipo) return 0;
      return a.tipo == TipoServicioAbierto.viaje ? -1 : 1;
    });

  final elegido = ordenados.first;
  return switch (elegido.tipo) {
    TipoServicioAbierto.viaje => rutaViaje(elegido.id),
    TipoServicioAbierto.pedido => rutaPedido(elegido.id),
  };
}

String _rutaViaje(String id) => '/transport/tracking/$id';
String _rutaPedido(String id) => '/order/$id';
