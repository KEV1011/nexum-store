/// Validar el tiquete que el pasajero enseña al subir.
///
/// POR QUÉ UNA SOLA LLAMADA Y NO «CONSULTAR» + «MARCAR». Si fueran dos, el
/// conductor podría consultar y olvidarse de marcar —va con el motor andando
/// y gente detrás— y el mismo tiquete serviría dos veces, que es justo lo que
/// esto viene a impedir. El servidor valida y marca en la misma operación.
library;

import 'package:dio/dio.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

class ResultadoAbordaje {
  const ResultadoAbordaje({
    required this.ok,
    this.motivo,
    this.abordoEn,
    this.pasajero,
    this.puestos,
    this.aCobrar,
    this.recogeEn,
  });

  final bool ok;

  /// Por qué no puede subir. Es lo que el conductor le lee en voz alta.
  final String? motivo;

  /// Cuándo se usó, si ya se había usado. Es lo que zanja la discusión
  /// cuando alguien fotografió el tiquete de otro.
  final DateTime? abordoEn;

  final String? pasajero;
  final int? puestos;

  /// Cuánto cobrarle, ya con su descuento aplicado.
  final double? aCobrar;

  /// Dónde lo recoge, si no es en la terminal.
  final String? recogeEn;

  factory ResultadoAbordaje.fromJson(Map<String, dynamic> j) => ResultadoAbordaje(
        ok: j['ok'] == true,
        motivo: j['motivo'] as String?,
        // `tryParse` y no `parse`: una fecha rara no puede tumbar la pantalla
        // que el conductor usa en la puerta del bus.
        abordoEn: DateTime.tryParse(j['abordoEn'] as String? ?? ''),
        pasajero: j['pasajero'] as String?,
        puestos: (j['puestos'] as num?)?.toInt(),
        aCobrar: (j['aCobrar'] as num?)?.toDouble(),
        recogeEn: j['recogeEn'] as String?,
      );
}

/// Valida el código contra ESA salida y marca al pasajero como abordado.
Future<ResultadoAbordaje> validarTiquete(String salidaId, String codigo) async {
  try {
    final r = await DioClient().dio.post<Map<String, dynamic>>(
          '/driver/pool/$salidaId/abordar',
          data: {'codigo': codigo},
        );
    final d = r.data?['data'];
    if (d is Map<String, dynamic>) return ResultadoAbordaje.fromJson(d);
    return const ResultadoAbordaje(ok: false, motivo: 'Respuesta inesperada del servidor.');
  } on DioException catch (e) {
    // El motivo del servidor está escrito para leérselo al pasajero; el
    // genérico solo se usa cuando de verdad no llegó nada.
    final data = e.response?.data;
    final d = data is Map<String, dynamic> ? data['data'] : null;
    if (d is Map<String, dynamic>) return ResultadoAbordaje.fromJson(d);
    final err = data is Map<String, dynamic> ? data['error'] : null;
    return ResultadoAbordaje(
      ok: false,
      motivo: err is String && err.isNotEmpty
          ? err
          : 'No pudimos validar el tiquete. Revisa tu conexión.',
    );
  }
}
