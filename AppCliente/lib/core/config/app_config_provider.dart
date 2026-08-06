import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Qué puede ofrecer la app hoy, según lo que el backend tenga configurado.
///
/// Nació por el pago en línea: sin llaves de Wompi, el botón "Pagar en línea"
/// abría un checkout que no cobraba nada — el usuario creía haber pagado y el
/// conductor le cobraba en efectivo igual. Un botón que no hace lo que dice es
/// motivo de rechazo en la revisión de las tiendas, y antes que eso, una
/// mentira al usuario.
///
/// Ante la duda se asume que NO hay pago en línea: si la consulta falla, se
/// ofrece solo efectivo, que siempre funciona. Prometer de más es el error caro.
class AppConfig {
  const AppConfig({required this.pagoEnLinea});

  final bool pagoEnLinea;

  static const AppConfig soloEfectivo = AppConfig(pagoEnLinea: false);
}

final appConfigProvider = FutureProvider<AppConfig>((ref) async {
  try {
    final res = await ref
        .read(apiClientProvider)
        .get<Map<String, dynamic>>('/client/config');
    final data = res.data?['data'] as Map<String, dynamic>?;
    return AppConfig(pagoEnLinea: data?['pagoEnLinea'] as bool? ?? false);
  } catch (_) {
    return AppConfig.soloEfectivo;
  }
});
