import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Resultado de iniciar un pago: referencia y link de checkout de Wompi.
class PaymentInit {
  const PaymentInit({
    required this.referenceCode,
    required this.paymentUrl,
    required this.amount,
  });

  factory PaymentInit.fromJson(Map<String, dynamic> json) => PaymentInit(
        referenceCode: json['referenceCode'] as String,
        paymentUrl: json['paymentUrl'] as String,
        amount: (json['amount'] as num).toDouble(),
      );

  final String referenceCode;
  final String paymentUrl;
  final double amount;
}

/// Cliente del API de pagos (Wompi a través del backend ZIPA).
///
/// El backend genera el link de checkout firmado y valida la firma del webhook;
/// la app solo inicia el pago, abre el checkout y consulta el estado.
class PaymentApi {
  PaymentApi(this._dio);

  final Dio _dio;

  /// Crea un link de pago Wompi para un pedido o viaje. Devuelve la referencia
  /// y la URL de checkout que el usuario debe abrir.
  Future<PaymentInit> init({
    required double amount,
    required String description,
    String? orderId,
    String? tripId,
    String? customerEmail,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/client/payments/init',
      data: {
        'amount': amount,
        'description': description,
        if (orderId != null) 'orderId': orderId,
        if (tripId != null) 'tripId': tripId,
        if (customerEmail != null) 'customerEmail': customerEmail,
      },
    );
    return PaymentInit.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  /// Estado actual del pago. El backend reconcilia contra Wompi si sigue
  /// pendiente, por si el webhook se perdió. Valores: `pending` | `approved`
  /// | `rejected` | `voided`.
  Future<String> status(String referenceCode) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/client/payments/$referenceCode',
    );
    final data = res.data?['data'] as Map<String, dynamic>?;
    return (data?['status'] as String?) ?? 'pending';
  }

  /// Sondea el estado hasta que deje de estar `pending` o se agote el tiempo.
  /// Devuelve el último estado conocido (puede ser `pending` si expira).
  Future<String> pollUntilResolved(
    String referenceCode, {
    Duration interval = const Duration(seconds: 3),
    Duration timeout = const Duration(minutes: 4),
  }) async {
    final deadline = DateTime.now().add(timeout);
    var last = 'pending';
    while (DateTime.now().isBefore(deadline)) {
      await Future<void>.delayed(interval);
      try {
        last = await status(referenceCode);
      } catch (_) {
        // red intermitente: seguir sondeando hasta el timeout.
      }
      if (last != 'pending') return last;
    }
    return last;
  }
}

final paymentApiProvider = Provider<PaymentApi>((ref) {
  return PaymentApi(ref.read(apiClientProvider));
});
