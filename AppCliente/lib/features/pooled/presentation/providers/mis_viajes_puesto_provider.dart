import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/pooled/domain/entities/mi_viaje_puesto.dart';

/// Los viajes por puestos URBANOS del pasajero (publicados y reservados).
///
/// `viajes` en null = todavía no se ha podido preguntar (o el servidor es
/// anterior a la ruta): la pantalla cae entonces a la lista vieja de
/// «publicados» en vez de afirmar que no tiene ninguno.
class MisViajesPuestoState {
  const MisViajesPuestoState({this.viajes, this.error});
  final List<MiViajePuesto>? viajes;
  final String? error;
}

class MisViajesPuestoNotifier extends StateNotifier<MisViajesPuestoState> {
  MisViajesPuestoNotifier(this._dio) : super(const MisViajesPuestoState());

  final Dio _dio;

  Future<void> cargar() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/client/pool/urbano/viajes');
      final lista = <MiViajePuesto>[];
      // Uno a uno: un viaje que no se entienda se cae él solo, no la lista.
      for (final e in (res.data?['data'] as List<dynamic>? ?? const [])) {
        if (e is! Map<String, dynamic>) continue;
        try {
          final v = MiViajePuesto.fromJson(e);
          if (v != null) lista.add(v);
        } catch (_) {/* se descarta ese */}
      }
      state = MisViajesPuestoState(viajes: lista);
    } catch (_) {
      // Se conserva lo anterior: un fallo de red no puede hacer DESAPARECER
      // el viaje de la pantalla (era uno de los reportes).
      state = MisViajesPuestoState(
        viajes: state.viajes,
        error: 'No pudimos actualizar tus viajes por puestos.',
      );
    }
  }

  /// Uno solo, para la pantalla del viaje. Null + motivo si no se pudo.
  Future<(MiViajePuesto?, String?)> uno(String tripId) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/pool/urbano/viajes/${Uri.encodeComponent(tripId)}',
      );
      final data = res.data?['data'];
      if (data is! Map<String, dynamic>) return (null, 'No encontramos ese viaje.');
      return (MiViajePuesto.fromJson(data), null);
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) return (null, body['error'] as String);
      return (null, 'No pudimos cargar el viaje. Revisa tu conexión.');
    } catch (_) {
      return (null, 'No pudimos cargar el viaje.');
    }
  }

  /// Cancela: el autor el viaje entero, los demás solo su puesto. `null` =
  /// hecho; si no, el motivo del servidor.
  Future<String?> cancelar(MiViajePuesto v) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        v.soyAutor
            ? '/client/pool/urbano/${Uri.encodeComponent(v.id)}/cancel'
            : '/client/intercity/pool/bookings/${Uri.encodeComponent(v.reserva.id)}/cancel',
      );
      await cargar();
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) return body['error'] as String;
      return 'No pudimos cancelar. Revisa tu conexión.';
    } catch (_) {
      return 'No pudimos cancelar. Revisa tu conexión.';
    }
  }

  /// Califica al taxista al terminar (la misma ruta de la salida compartida).
  Future<String?> calificar(MiViajePuesto v, int estrellas, {String? comentario}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/intercity/pool/bookings/${Uri.encodeComponent(v.reserva.id)}/rate',
        data: {
          'rating': estrellas,
          if (comentario != null && comentario.trim().isNotEmpty)
            'comment': comentario.trim(),
        },
      );
      await cargar();
      return null;
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map && body['error'] is String) return body['error'] as String;
      return 'No se pudo enviar tu calificación.';
    } catch (_) {
      return 'No se pudo enviar tu calificación.';
    }
  }
}

final misViajesPuestoProvider =
    StateNotifierProvider<MisViajesPuestoNotifier, MisViajesPuestoState>(
  (ref) => MisViajesPuestoNotifier(ref.read(apiClientProvider)),
);
