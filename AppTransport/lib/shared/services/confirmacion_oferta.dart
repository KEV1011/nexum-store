/// Qué le contestó el servidor a un «Aceptar».
///
/// POR QUÉ EXISTE. La app entraba al viaje en cuanto el conductor tocaba
/// «Aceptar», sin esperar a nadie. Si el servidor decía que no —el turno de
/// quince segundos ya había vencido, otro conductor la tomó, el cliente
/// canceló, el socket estaba caído y el mensaje ni salió— el conductor se
/// quedaba con un servicio FANTASMA: camino de una recogida que no era suya,
/// con el cliente todavía «buscando» o con otro repartidor ya en la puerta.
/// Y sin un solo aviso, porque la respuesta del servidor no la leía nadie.
///
/// Aquí vive solo la regla, suelta y sin sockets, para poder probarla: dado un
/// mensaje del servidor y las aceptaciones que están esperando respuesta, a
/// cuál se refiere y si es un sí o un no.
library;

/// Sin conexión: el «Aceptar» ni siquiera pudo salir.
const String kSinConexionParaAceptar =
    'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

/// Salió, pero el servidor no contestó a tiempo.
const String kSinRespuestaAlAceptar =
    'No pudimos confirmar con el servidor. Revisa tu conexión: si la solicitud '
    'sigue libre te volverá a salir.';

/// El texto por defecto cuando el servidor dice que no sin explicar más.
const String kOfertaYaNoDisponible =
    'Esa solicitud ya no está disponible: la tomó otro conductor o se canceló.';

/// La respuesta a una aceptación: a cuál ([clave] = `tipo:id`) y por qué no
/// ([motivo]); con [motivo] nulo, el servidor la CONFIRMÓ.
class RespuestaDeAceptacion {
  const RespuestaDeAceptacion(this.clave, [this.motivo]);
  final String clave;
  final String? motivo;

  bool get confirmada => motivo == null;
}

/// La clave con que se espera la respuesta: `trip:<id>`, `errand:<id>`,
/// `order:<id>`.
String claveDeOferta(String tipo, String id) => '$tipo:$id';

/// Lee un mensaje del servidor. Devuelve null si no responde a ninguna de las
/// aceptaciones [pendientes] (la inmensa mayoría de los mensajes).
RespuestaDeAceptacion? leerRespuestaDeAceptacion(
  Map<String, dynamic> msg,
  Set<String> pendientes,
) {
  if (pendientes.isEmpty) return null;
  final type = msg['type'];

  RespuestaDeAceptacion? siEspera(String tipo, Object? id, [String? motivo]) {
    if (id is! String || id.isEmpty) return null;
    final clave = claveDeOferta(tipo, id);
    return pendientes.contains(clave)
        ? RespuestaDeAceptacion(clave, motivo)
        : null;
  }

  switch (type) {
    // Los tres «sí», uno por tipo de servicio.
    case 'trip_accepted':
      final trip = msg['trip'];
      return siEspera('trip', trip is Map ? trip['id'] : null);
    case 'errand_update':
      return siEspera('errand', msg['errandId']);
    case 'order_accept_ok':
      return siEspera('order', msg['orderId']);

    // El «no» explícito del servidor nuevo: dice a cuál se refiere.
    case 'offer_gone':
      final tipo = msg['kind'];
      if (tipo is! String) return null;
      final motivo = msg['message'];
      return siEspera(
        tipo,
        msg['id'],
        motivo is String && motivo.isNotEmpty ? motivo : kOfertaYaNoDisponible,
      );

    // El «no» del servidor anterior: un `error` de texto, sin id. Solo se
    // puede atribuir si hay UNA aceptación esperando; con dos no se sabe a
    // cuál se refiere y adivinar tumbaría la que sí entró.
    case 'error':
      if (pendientes.length != 1) return null;
      final m = msg['message'];
      if (m is! String) return null;
      final texto = m.toLowerCase();
      final esRechazo = texto.contains('no longer available') ||
          texto.contains('ya no está disponible') ||
          texto.contains('already handling');
      return esRechazo
          ? RespuestaDeAceptacion(pendientes.first, kOfertaYaNoDisponible)
          : null;
  }
  return null;
}
