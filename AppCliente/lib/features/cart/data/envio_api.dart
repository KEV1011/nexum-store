// Cuánto cuesta mover el pedido hasta una dirección, y cuándo llega.
//
// POR QUÉ SE LE PREGUNTA AL SERVIDOR EN VEZ DE CALCULARLO AQUÍ. En un pedido
// a otra ciudad hay dos cobros distintos —el flete del bus y el domicilio
// urbano en destino— y el segundo solo se cobra si el cliente pide que se la
// lleven a la puerta. Replicar esa regla en la app garantizaba el fallo que
// este repositorio ya pagó con la promoción de la tienda: la pantalla
// prometiendo un total y la caja cobrando otro. El servidor responde con la
// MISMA función que usa al crear el pedido (`cotizarEnvio`).

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

class CotizacionEnvio {
  const CotizacionEnvio({
    required this.intercity,
    required this.intercityFee,
    required this.deliveryFee,
    required this.envioTotal,
    required this.lastMile,
    required this.puedeUltimaMilla,
    required this.etaMinutes,
    this.destCity,
    this.destCityLabel,
    this.promisedAt,
    this.rechazo,
  });

  factory CotizacionEnvio.fromJson(Map<String, dynamic> j) => CotizacionEnvio(
        intercity: j['intercity'] as bool? ?? false,
        destCity: j['destCity'] as String?,
        destCityLabel: j['destCityLabel'] as String?,
        intercityFee: (j['intercityFee'] as num?)?.toDouble() ?? 0,
        deliveryFee: (j['deliveryFee'] as num?)?.toDouble() ?? 0,
        envioTotal: (j['envioTotal'] as num?)?.toDouble() ?? 0,
        lastMile: j['lastMile'] as bool? ?? false,
        puedeUltimaMilla: j['puedeUltimaMilla'] as bool? ?? false,
        etaMinutes: (j['etaMinutes'] as num?)?.toInt() ?? 0,
        promisedAt: DateTime.tryParse(j['promisedAt'] as String? ?? ''),
        rechazo: j['rechazo'] as String?,
      );

  /// Cruza de ciudad Y el comercio despacha allá.
  final bool intercity;
  final String? destCity;

  /// Nombre legible de la ciudad de entrega. Lo resuelve el servidor: del
  /// slug («san-jose-de-cucuta») la app lo sacaría mal.
  final String? destCityLabel;

  final double intercityFee;
  final double deliveryFee;
  final double envioTotal;

  /// Va hasta la puerta en destino (ya resuelto, no lo que se pidió).
  final bool lastMile;

  /// Se puede OFRECER la entrega a la puerta. Distinto de [lastMile]: esto
  /// decide si se dibuja el interruptor.
  final bool puedeUltimaMilla;

  final int etaMinutes;

  /// Cuándo se promete la entrega. Solo en envíos a otra ciudad: un instante
  /// concreto, porque «doce horas» dicho con el bus ya ido es mentira.
  final DateTime? promisedAt;

  /// Por qué NO se puede entregar ahí, con las ciudades a las que sí se
  /// despacha. Null = adelante.
  final String? rechazo;

  bool get puedePedir => rechazo == null;
}

class EnvioApi {
  const EnvioApi(this._dio);

  final Dio _dio;

  /// Cotiza el envío. Devuelve null si la petición falla: el checkout
  /// distingue «no se pudo preguntar» de «no se puede entregar», que son dos
  /// cosas y se arreglan distinto.
  Future<CotizacionEnvio?> cotizar({
    required String businessId,
    double? lat,
    double? lng,
    bool lastMile = false,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/client/businesses/$businessId/envio',
        queryParameters: {
          if (lat != null) 'lat': lat,
          if (lng != null) 'lng': lng,
          'lastMile': lastMile,
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return CotizacionEnvio.fromJson(data);
    } on DioException {
      return null;
    }
  }
}

final envioApiProvider = Provider<EnvioApi>(
  (ref) => EnvioApi(ref.watch(apiClientProvider)),
);
