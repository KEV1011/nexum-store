/// «Entrego en X minutos»: lo que el repartidor le promete al cliente.
///
/// POR QUÉ LO DICE ÉL Y NO LO CALCULA LA APP. En una compra a un comercio que
/// todavía no es cliente de ZIPA no hay cocina conectada que declare un tiempo
/// de preparación, y hasta que la compra no empiece no hay ruta que medir: el
/// cliente no tenía NINGUNA forma de saber cuánto falta. El único que sabe que
/// hay quince personas en la fila es quien está en el mostrador.
///
/// El servidor acota el número (`lib/eta-declarada.ts`) y avisa al cliente.
library;

import 'package:dio/dio.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Manda el tiempo prometido. Devuelve el motivo si el servidor lo rechaza,
/// o null si quedó avisado.
///
/// Devuelve el motivo en vez de tragárselo porque los rechazos son
/// accionables: «di un tiempo entre 5 y 180 minutos» se arregla tocando otro
/// chip, y «este mandado ya no es tuyo» explica por qué no pasó nada.
///
/// [esPedido]: un pedido a un negocio va a SU ruta. La oferta de un pedido
/// lleva el detalle de la compra (`errand`), así que el botón también sale en
/// los pedidos — y mandar su id a la ruta de mandados respondía «este mandado
/// ya no está activo o no es tuyo» con el pedido perfectamente vivo.
Future<String?> enviarEtaDeMandado(
  String errandId,
  int minutos, {
  bool esPedido = false,
}) async {
  try {
    await DioClient().dio.post<Map<String, dynamic>>(
      esPedido
          ? '/driver/orders/$errandId/eta'
          : '/driver/errands/$errandId/eta',
      data: {'minutos': minutos},
    );
    return null;
  } on DioException catch (e) {
    final data = e.response?.data;
    final motivo = data is Map<String, dynamic> ? data['error'] : null;
    return motivo is String && motivo.isNotEmpty
        ? motivo
        : 'No pudimos avisarle. Revisa tu conexión.';
  } catch (_) {
    return 'No pudimos avisarle. Revisa tu conexión.';
  }
}
