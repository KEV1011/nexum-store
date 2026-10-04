// ── Comprar en un comercio que todavía no es cliente de ZIPA ─────────────────
//
// Su ficha la abrimos nosotros desde una foto de su carta, así que no hay
// portal al otro lado: el pedido se convierte en un MANDADO de compra y va un
// repartidor. El cliente aprueba un PRESUPUESTO —no un precio— y se le cobra
// lo que diga el recibo, porque los precios salieron de su menú y pudieron
// cambiar.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

class CompraError implements Exception {
  CompraError(this.motivo);
  final String motivo;
  @override
  String toString() => motivo;
}

/// Lo que devuelve el servidor al crear la compra.
class CompraCreada {
  const CompraCreada({
    required this.errandId,
    required this.referencial,
    required this.presupuesto,
  });

  /// El mandado que se creó: su seguimiento es el de siempre.
  final String errandId;

  /// Lo que sumaba la lista a precios de la carta.
  final double referencial;

  /// Lo que se autoriza a gastar: la suma MÁS una holgura, porque un precio
  /// pudo subir y dejar al repartidor sin poder pagar en el mostrador.
  final double presupuesto;
}

class CompraApi {
  const CompraApi(this._dio);

  final Dio _dio;

  Future<CompraCreada> comprar({
    required String businessId,
    required List<Map<String, dynamic>> items,
    required String direccion,
    double? lat,
    double? lng,
    String? notas,
  }) async {
    try {
      final r = await _dio.post<Map<String, dynamic>>(
        '/client/comercios/$businessId/comprar',
        data: {
          'items': items,
          'dropoffAddress': direccion,
          if (lat != null) 'dropoffLat': lat,
          if (lng != null) 'dropoffLng': lng,
          if (notas != null && notas.trim().isNotEmpty) 'notes': notas.trim(),
        },
      );
      final d = r.data?['data'] as Map<String, dynamic>?;
      if (d == null) throw CompraError('El servidor no devolvió la compra.');
      return CompraCreada(
        errandId: d['id'] as String,
        referencial: (d['referencial'] as num?)?.toDouble() ?? 0,
        presupuesto: (d['presupuesto'] as num?)?.toDouble() ?? 0,
      );
    } on DioException catch (e) {
      // El motivo del servidor va en español y dice qué hacer («agrega al
      // menos un producto», «supera el máximo de $X»). Tragárselo y poner un
      // «no se pudo» deja al cliente sin saber qué cambiar.
      final data = e.response?.data;
      final motivo = data is Map<String, dynamic> ? data['error'] : null;
      throw CompraError(
        motivo is String && motivo.isNotEmpty
            ? motivo
            : 'No pudimos crear la compra. Revisa tu conexión.',
      );
    }
  }
}

/// El mismo `Dio` que el resto de la app —con su interceptor de sesión—, igual
/// que `envioApiProvider`. La app cliente no tiene un singleton tipo
/// `DioClient` (eso es del conductor): aquí el cliente HTTP viene por Riverpod.
final compraApiProvider = Provider<CompraApi>(
  (ref) => CompraApi(ref.watch(apiClientProvider)),
);
