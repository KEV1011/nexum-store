/// El servicio que quedó abierto cuando la app se cerró a mitad.
///
/// La app solo conoce lo que aceptó en esa misma sesión. Si el sistema la
/// cierra (memoria, batería, una actualización) mientras el conductor atiende
/// algo, al volver no sabía que lo tenía: el cliente esperaba a alguien que no
/// iba a llegar y el conductor quedaba «en viaje» para el despacho, sin
/// recibir nada más.
///
/// Al abrir la app se le pregunta al servidor y se ofrece RETOMARLO (la
/// pantalla de siempre, en la fase en que iba) o SOLTARLO (vuelve a la
/// búsqueda y le llega a otro).
library;

import 'package:dio/dio.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/lista_json.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/oferta_mapper.dart';

class ServicioAbierto {
  const ServicioAbierto({
    required this.tipo,
    required this.id,
    required this.ref,
    required this.fase,
    required this.puedeSoltar,
    required this.oferta,
    this.motivoNoSoltar,
  });

  /// 'trip' | 'order' | 'errand'.
  final String tipo;
  final String id;
  final String ref;

  /// 'recogida' | 'en_espera' | 'en_curso'.
  final String fase;
  final bool puedeSoltar;
  final String? motivoNoSoltar;

  /// El servicio con la forma de su oferta (`trip_request`, `order_request`,
  /// `errand_request`): se convierte con los mismos mapeadores.
  final Map<String, dynamic> oferta;

  /// Tolerante a propósito: esto se lee al abrir la app, y una fila rara no
  /// puede tumbar el inicio. Devuelve null si falta lo imprescindible.
  static ServicioAbierto? fromJson(Map<String, dynamic> j) {
    final tipo = j['tipo'];
    final id = j['id'];
    final oferta = j['oferta'];
    if (tipo is! String || id is! String || oferta is! Map<String, dynamic>) {
      return null;
    }
    if (tipo != 'trip' && tipo != 'order' && tipo != 'errand') return null;
    return ServicioAbierto(
      tipo: tipo,
      id: id,
      ref: j['ref'] as String? ?? '',
      fase: j['fase'] as String? ?? 'recogida',
      puedeSoltar: j['puedeSoltar'] == true,
      motivoNoSoltar: j['motivoNoSoltar'] as String?,
      oferta: oferta,
    );
  }

  /// La solicitud con la que se entra a la pantalla del servicio.
  TripRequestEntity? get solicitud => switch (tipo) {
        'order' => ofertaDePedido(oferta),
        'errand' => ofertaDeMandado(oferta),
        _ => ofertaDeViaje(oferta),
      };

  String get nombre => switch (tipo) {
        'order' => 'Pedido',
        'errand' => 'Mandado',
        _ => 'Viaje',
      };

  /// En qué punto va, dicho como lo vive el conductor.
  String get faseTexto => switch (fase) {
        'en_espera' => tipo == 'trip'
            ? 'Esperando al pasajero'
            : tipo == 'order'
                ? 'En el local'
                : 'Haciendo la compra',
        'en_curso' => tipo == 'trip' ? 'Con el pasajero a bordo' : 'Camino a la entrega',
        _ => tipo == 'trip' ? 'Yendo a recoger al pasajero' : 'Yendo al local',
      };
}

/// Lo que el conductor tiene sin cerrar. Lanza si no hay red: quien llama
/// decide callarse (al abrir la app no se insiste por un fallo de red).
Future<List<ServicioAbierto>> listarServiciosAbiertos() async {
  final r = await DioClient().get<Map<String, dynamic>>('/driver/servicios-abiertos');
  return listaDeJson<ServicioAbierto?>(r.data?['data'], ServicioAbierto.fromJson)
      .whereType<ServicioAbierto>()
      .toList();
}

/// Devuelve el servicio a la búsqueda. Null si salió bien; si no, el motivo
/// en palabras del servidor (ya no es tuyo, ya llevas el pedido…).
Future<String?> soltarServicioAbierto(ServicioAbierto s) async {
  try {
    await DioClient().post<Map<String, dynamic>>('/driver/servicios/${s.tipo}/${s.id}/soltar');
    return null;
  } on DioException catch (e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    return 'No pudimos soltar el servicio. Revisa tu conexión e inténtalo de nuevo.';
  }
}

/// El id con que el servidor conoce la solicitud que está en pantalla: un
/// pedido va por su `orderId`, lo demás por su `id`.
String idEnServidor(TripRequestEntity r) => r.isOrder ? (r.orderId ?? r.id) : r.id;

/// Los OTROS servicios abiertos: todos menos el que está en pantalla.
///
/// Es lo que permite llevar varios pedidos a la vez —en un pueblo los locales
/// quedan a dos cuadras y el despacho le ofrece otro pedido cercano a quien ya
/// lleva uno—: el servidor es quien sabe qué tiene abierto, y la app enseña
/// el resto para cambiar de uno a otro.
List<ServicioAbierto> otrosServicios(
  List<ServicioAbierto> todos,
  TripRequestEntity? actual,
) {
  if (actual == null) return todos;
  final id = idEnServidor(actual);
  final tipo = actual.isOrder ? 'order' : actual.isErrand ? 'errand' : 'trip';
  return todos.where((s) => !(s.id == id && s.tipo == tipo)).toList();
}

/// Una oferta encadenada que se APILA (otro pedido mientras lleva un pedido)
/// en vez de quedar en cola para después: se acepta y se atiende a la vez.
bool esPedidoApilado(TripRequestEntity oferta, TripRequestEntity? actual) =>
    oferta.isOrder && (actual?.isOrder ?? false);
