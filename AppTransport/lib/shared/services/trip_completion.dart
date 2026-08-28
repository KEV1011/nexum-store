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

  static LiquidacionViaje? desdeJson(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final tarifa = (raw['finalFare'] as num?)?.toDouble();
    if (tarifa == null) return null;
    return LiquidacionViaje(
      finalFare: tarifa,
      netEarning: (raw['netEarning'] as num?)?.toDouble() ?? 0,
      commission: (raw['commission'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// El servidor rechazó el cambio, o no se le pudo preguntar. El mensaje ya
/// viene en español y es el que se le enseña al conductor.
class CierreViajeError implements Exception {
  const CierreViajeError(this.mensaje, {this.reintentable = false});

  final String mensaje;

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
