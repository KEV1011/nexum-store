/// Cierre del viaje contra el servidor, con respuesta y con reintentos.
///
/// Por qué no basta el WebSocket. El emisor de la app hace esto:
///
///     void _send(Map<String, dynamic> msg) {
///       if (_channel == null) return;              // socket caído: se tira
///       try { _channel!.sink.add(...); } catch (_) {}   // y si falla, también
///     }
///
/// Para "voy llegando" eso es aceptable. Para "he terminado" no: ese mensaje
/// liquida la tarifa, le paga al conductor y lo libera para el siguiente viaje.
/// Cuando se perdía —y se pierde con facilidad: media hora conduciendo, la
/// pantalla apagada, saltando de antena en antena— la app enseñaba igualmente
/// el resumen, y al otro lado el pasajero se quedaba "en trayecto" para
/// siempre, sin liquidación y con el conductor marcado ON_TRIP, es decir, fuera
/// del despacho sin saberlo.
///
/// HTTP sí contesta. Si el servidor no confirma, la app se entera y lo dice.
library;

import 'dart:async';

import 'package:dio/dio.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Lo que el servidor liquidó al cerrar el viaje. Son SUS números, no los del
/// teléfono: es lo que de verdad queda en la billetera del conductor.
class LiquidacionViaje {
  const LiquidacionViaje({
    required this.finalFare,
    required this.netEarning,
    required this.commission,
  });

  final double finalFare;
  final double netEarning;
  final double commission;

  /// Un número del JSON, o `null` si ahí no venía un número.
  ///
  /// `as num?` NO devuelve null cuando llega un texto: LANZA. Esto entra por
  /// un mensaje del socket, y una excepción aquí no cuesta una cifra — cuesta
  /// el cierre del viaje. El contenedor ya se comprobaba (`is! Map`); esto
  /// termina la misma idea con los campos.
  static double? _numero(Object? v) => v is num ? v.toDouble() : null;

  static LiquidacionViaje? desdeJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final tarifa = _numero(raw['finalFare']);
    // Sin tarifa final no hay liquidación. Un «$0 ganado» se lee como que el
    // viaje no pagó, y eso es peor que no enseñar nada: la pantalla cae a su
    // estimación y lo dice.
    if (tarifa == null) return null;
    return LiquidacionViaje(
      finalFare: tarifa,
      // Aquí el cero SÍ es correcto: la tarifa está, así que el viaje se
      // liquidó; lo que falta es el desglose.
      netEarning: _numero(raw['netEarning']) ?? 0,
      commission: _numero(raw['commission']) ?? 0,
    );
  }
}

/// El servidor rechazó el cambio, o no se le pudo preguntar. El mensaje ya
/// viene en español y es el que se le enseña al conductor.
class CierreViajeError implements Exception {
  const CierreViajeError(
    this.mensaje, {
    this.reintentable = false,
    this.esPin = false,
    this.cancelado = false,
  });

  final String mensaje;

  /// El PIN de custodia no cuadra (o faltó): hay que volver a pedirlo, no
  /// enseñar un error y dejar al repartidor adivinando qué hacer.
  final bool esPin;

  /// El cliente canceló el servicio: no hay nada que entregar y la pantalla
  /// debe cerrarse, no ofrecer otro intento.
  final bool cancelado;

  /// ¿Tiene sentido volver a intentarlo? Un fallo de red sí; un PIN que no
  /// cuadra o un viaje que no es suyo, no — reintentar solo repetiría el mismo
  /// rechazo y le haría perder tiempo.
  final bool reintentable;

  @override
  String toString() => mensaje;
}

/// Cuántas veces se insiste ante un fallo de red antes de rendirse.
const _intentos = 3;

/// Mueve el viaje [tripId] al estado [estado] y devuelve la liquidación si la
/// hay. Lanza [CierreViajeError] si el servidor no lo confirma.
Future<LiquidacionViaje?> cambiarEstadoViaje({
  required String tripId,
  required String estado,
  String? pin,
}) async {
  Object? ultimoFallo;

  for (var intento = 1; intento <= _intentos; intento++) {
    try {
      final res = await DioClient().dio.post<Map<String, dynamic>>(
            '/driver/trips/$tripId/status',
            data: {'status': estado, if (pin != null) 'pin': pin},
          );
      final data = res.data?['data'] as Map<String, dynamic>?;
      return LiquidacionViaje.desdeJson(data?['settlement']);
    } on DioException catch (e) {
      final respuesta = e.response;
      // El servidor CONTESTÓ y dijo que no. Reintentar no lo va a convencer:
      // el PIN seguirá sin cuadrar y el viaje seguirá sin ser suyo.
      if (respuesta != null) {
        final cuerpo = respuesta.data;
        final motivo = cuerpo is Map && cuerpo['error'] is String
            ? cuerpo['error'] as String
            : 'El servidor rechazó el cierre del viaje.';
        throw CierreViajeError(motivo);
      }
      // No hubo respuesta: red. Se insiste, separando los intentos.
      ultimoFallo = e;
      if (intento < _intentos) {
        await Future<void>.delayed(Duration(milliseconds: 400 * intento));
      }
    } catch (e) {
      ultimoFallo = e;
      if (intento < _intentos) {
        await Future<void>.delayed(Duration(milliseconds: 400 * intento));
      }
    }
  }

  throw CierreViajeError(
    'No se pudo confirmar el cierre con el servidor. Revisa tu conexión e '
    'inténtalo otra vez: el viaje sigue abierto hasta que se confirme.',
    reintentable: true,
  );
}

// ─── Pedidos y mandados ──────────────────────────────────────────────────────
//
// El mismo defecto que arriba, en los otros dos servicios: «recogido» y
// «entregado» de un pedido o un mandado viajaban solo por el socket. Cuando el
// mensaje se perdía, el servidor no liquidaba el domicilio, el cliente seguía
// viendo «en camino» y el repartidor quedaba «en viaje» — fuera del despacho —
// con el resumen de la entrega en la pantalla.

/// Qué hacer con lo que contestó (o no contestó) el servidor.
enum RechazoDeEstado {
  /// El servidor todavía no tiene la ruta (aún no se desplegó la versión que
  /// la trae): se manda por el socket, como siempre.
  rutaAusente,

  /// El PIN no cuadra: se vuelve a pedir.
  pin,

  /// El cliente canceló el servicio.
  cancelado,

  /// Sin respuesta, o el servidor está caído o reiniciando: se insiste. Es
  /// seguro porque el servidor contesta «ya está» a quien repite.
  reintentar,

  /// Dijo que no y repetir no lo va a cambiar (no es suyo, estado inválido).
  definitivo,
}

/// Lee la respuesta de error del servidor. Pura, para poder probarla sin red.
///
/// [status] es null cuando no hubo respuesta.
RechazoDeEstado leerRechazoDeEstado(int? status, Object? cuerpo) {
  if (status == null) return RechazoDeEstado.reintentar;
  if (status >= 500 || status == 408 || status == 429) {
    return RechazoDeEstado.reintentar;
  }
  final error = cuerpo is Map ? cuerpo['error'] : null;
  final codigo = cuerpo is Map ? cuerpo['code'] : null;
  // El 404 del propio servicio dice «ese pedido no existe o no está asignado a
  // ti»; el del servidor que no conoce la ruta dice esto otro, y solo ese
  // significa «servidor anterior».
  if (status == 404 && error == 'Route not found') {
    return RechazoDeEstado.rutaAusente;
  }
  if (status == 409) return RechazoDeEstado.cancelado;
  if (status == 400 && codigo == 'custody_pin') return RechazoDeEstado.pin;
  return RechazoDeEstado.definitivo;
}

/// El motivo en español que mandó el servidor, o [porDefecto].
String motivoDelRechazo(Object? cuerpo, String porDefecto) {
  final error = cuerpo is Map ? cuerpo['error'] : null;
  return error is String && error.trim().isNotEmpty ? error : porDefecto;
}

/// Mueve el pedido [orderId] a [estado] (`at_pickup`, `in_transit`,
/// `delivered`) y espera a que el servidor lo confirme.
///
/// Devuelve `true` si lo confirmó y `false` si el servidor aún no tiene esta
/// ruta — ahí quien llama lo manda por el socket, como antes. Lanza
/// [CierreViajeError] si no se pudo confirmar.
Future<bool> cambiarEstadoPedido({
  required String orderId,
  required String estado,
  String? pin,
}) =>
    _moverServicio(
      '/driver/orders/$orderId/status',
      {'status': estado, if (pin != null) 'pin': pin},
      'el pedido',
    );

/// Mueve el mandado [errandId] a [estado] (`shopping`, `on_the_way`,
/// `delivered`). Mismo contrato que [cambiarEstadoPedido].
Future<bool> cambiarEstadoMandado({
  required String errandId,
  required String estado,
  double? actualCost,
  String? pin,
}) =>
    _moverServicio(
      '/driver/errands/$errandId/status',
      {
        'status': estado,
        if (actualCost != null) 'actualCost': actualCost,
        if (pin != null) 'pin': pin,
      },
      'el mandado',
    );

Future<bool> _moverServicio(
  String ruta,
  Map<String, dynamic> datos,
  String queEs,
) async {
  for (var intento = 1; intento <= _intentos; intento++) {
    int? status;
    Object? cuerpo;
    try {
      await DioClient().dio.post<Map<String, dynamic>>(ruta, data: datos);
      return true;
    } on DioException catch (e) {
      status = e.response?.statusCode;
      cuerpo = e.response?.data;
    } catch (_) {
      // Sin respuesta que leer: se trata como un fallo de red.
    }

    switch (leerRechazoDeEstado(status, cuerpo)) {
      case RechazoDeEstado.rutaAusente:
        return false;
      case RechazoDeEstado.pin:
        throw CierreViajeError(
          motivoDelRechazo(cuerpo, 'El PIN no coincide. Verifícalo.'),
          esPin: true,
        );
      case RechazoDeEstado.cancelado:
        throw CierreViajeError(
          motivoDelRechazo(cuerpo, 'El cliente canceló este servicio.'),
          cancelado: true,
        );
      case RechazoDeEstado.definitivo:
        throw CierreViajeError(
          motivoDelRechazo(cuerpo, 'El servidor no aceptó el cambio.'),
        );
      case RechazoDeEstado.reintentar:
        if (intento < _intentos) {
          await Future<void>.delayed(Duration(milliseconds: 400 * intento));
        }
    }
  }

  throw CierreViajeError(
    'No se pudo confirmar $queEs con el servidor. Revisa tu conexión e '
    'inténtalo otra vez: sigue abierto hasta que se confirme.',
    reintentable: true,
  );
}
