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
  const AppConfig({
    required this.pagoEnLinea,
    this.metodosPago = const [],
    this.elogios = const [],
    this.maxElogios = 3,
  });

  final bool pagoEnLinea;

  /// Los identificadores de los métodos de pago que ofrece el servidor, en
  /// orden. Vacío = servidor viejo (o sin responder): la app usa su catálogo.
  final List<String> metodosPago;

  /// Lo que el pasajero puede destacar del conductor: `{clave, etiqueta}`.
  ///
  /// Viene del servidor para que la etiqueta viva en un solo sitio: añadir un
  /// elogio allí no deja un chip sin nombre en un teléfono sin actualizar.
  /// Vacío = no se ofrece nada, que es lo correcto ante la duda.
  final List<({String clave, String etiqueta})> elogios;

  /// Cuántos puede marcar en un mismo viaje. Lo decide el servidor, que además
  /// lo hace cumplir al guardar.
  final int maxElogios;

  static const AppConfig soloEfectivo = AppConfig(pagoEnLinea: false);
}

final appConfigProvider = FutureProvider<AppConfig>((ref) async {
  try {
    final res = await ref
        .read(apiClientProvider)
        .get<Map<String, dynamic>>('/client/config');
    final data = res.data?['data'] as Map<String, dynamic>?;
    final metodos = (data?['metodosPago'] as List<dynamic>?)
            ?.whereType<String>()
            .toList() ??
        const <String>[];
    final elogios = <({String clave, String etiqueta})>[
      for (final e in (data?['elogios'] as List<dynamic>?) ?? const [])
        if (e is Map<String, dynamic> &&
            e['clave'] is String &&
            e['etiqueta'] is String)
          (clave: e['clave'] as String, etiqueta: e['etiqueta'] as String),
    ];
    return AppConfig(
      pagoEnLinea: data?['pagoEnLinea'] as bool? ?? false,
      metodosPago: metodos,
      elogios: elogios,
      maxElogios: (data?['maxElogios'] as num?)?.toInt() ?? 3,
    );
  } catch (_) {
    return AppConfig.soloEfectivo;
  }
});
