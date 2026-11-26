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

/// El servidor rechazó un pedido DIRECTO porque el local no lo atiende (no es
/// aliado todavía, o no está al día): ese carrito tiene que salir como compra
/// por mandado. El checkout la crea solo en vez de enseñar el rechazo.
class ComprarPorMandado implements Exception {
  const ComprarPorMandado();
}

/// El código con que el servidor marca ese rechazo
/// (`CODIGO_COMPRAR_POR_MANDADO` en `lib/comercio-no-reclamado.ts`).
const kCodigoComprarPorMandado = 'comprar_por_mandado';

/// Las líneas del carrito tal como las lee el repartidor en el mostrador.
///
/// Lo elegido en las opciones («Grande · sin cebolla») va en la nota de la
/// línea: la compra no resuelve opciones, y sin esto el repartidor compraría
/// la picada pequeña que nadie pidió.
List<Map<String, dynamic>> lineasDeCompra(
  List<({String productId, int quantity, String? opciones, String? notas})>
      items,
) =>
    [
      for (final i in items)
        {
          'productId': i.productId,
          'quantity': i.quantity,
          if (_nota(i.opciones, i.notas) case final String n) 'notes': n,
        },
    ];

String? _nota(String? opciones, String? notas) {
  final partes = [
    if (opciones != null && opciones.trim().isNotEmpty) opciones.trim(),
    if (notas != null && notas.trim().isNotEmpty) notas.trim(),
  ];
  return partes.isEmpty ? null : partes.join(' · ');
}

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
    String? metodoPago,
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
          // Con qué le paga al repartidor al entregar. Así él sabe antes de
          // aceptar si tiene que llevar efectivo para pagar en el mostrador.
          if (metodoPago != null) 'paymentMethod': metodoPago,
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
