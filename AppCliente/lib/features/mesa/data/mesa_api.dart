/// La mesa desde la app, sobre la MISMA API que la carta web del QR
/// (`/carta/:código`). No hay un camino de escritura propio de la app: el
/// pedido entra a la cuenta de la mesa y a la cocina exactamente igual que el
/// del comensal que escaneó con la cámara, y sale en Mesas del portal igual.
///
/// La única diferencia es que, si el cliente tiene sesión, el cliente HTTP
/// manda su token y el servidor apunta el pedido a su cuenta (historial,
/// avisos, calificación). Sin sesión, pide igual.
library;

import 'package:dio/dio.dart';
import 'package:nexum_client/features/businesses/data/datasources/businesses_real_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';
import 'package:nexum_client/features/mesa/domain/carrito_mesa.dart';
import 'package:nexum_client/features/mesa/domain/pedido_mesa.dart';

class CartaDeMesa {
  const CartaDeMesa({required this.negocio, required this.mesas});
  final BusinessEntity negocio;

  /// Las mesas del local. Vacía = el local no tiene pedido en mesa activado.
  final List<String> mesas;
}

/// El mensaje del servidor, o uno que se entienda si no lo hay.
String mensajeDe(Object e, String porDefecto) {
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return 'No hay conexión. Revisa tu internet e intenta de nuevo.';
    }
  }
  return porDefecto;
}

class MesaApi {
  const MesaApi(this._dio);
  final Dio _dio;

  Future<CartaDeMesa> carta(String codigo) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/carta/${Uri.encodeComponent(codigo)}',
    );
    final data = res.data!['data'] as Map<String, dynamic>;
    return CartaDeMesa(
      negocio: BusinessesRealDataSource.negocioDesdeJson(
        data['business'] as Map<String, dynamic>,
      ),
      mesas: ((data['tables'] as List?) ?? const []).whereType<String>().toList(),
    );
  }

  Future<PedidoMesa> pedir(
    String codigo, {
    required String? mesa,
    required bool paraLlevar,
    required List<LineaMesa> lineas,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/carta/${Uri.encodeComponent(codigo)}/pedido',
      data: {
        'mesa': paraLlevar ? null : mesa,
        if (paraLlevar) 'paraLlevar': true,
        'items': [for (final l in lineas) l.toJson()],
      },
    );
    return PedidoMesa.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  Future<PedidoMesa?> pedido(String codigo, String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/carta/${Uri.encodeComponent(codigo)}/pedido/${Uri.encodeComponent(id)}',
      );
      return PedidoMesa.fromJson(res.data!['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<void> calificar(String codigo, String id, int estrellas, String? comentario) async {
    await _dio.post<Map<String, dynamic>>(
      '/carta/${Uri.encodeComponent(codigo)}/pedido/${Uri.encodeComponent(id)}/calificar',
      data: {
        'estrellas': estrellas,
        if (comentario != null && comentario.trim().isNotEmpty) 'comentario': comentario.trim(),
      },
    );
  }

  /// Lo que el cliente pidió en locales con su sesión. Sin sesión, vacío.
  Future<List<PedidoMesa>> misPedidos() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/client/mesa/pedidos');
      return ((res.data!['data'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PedidoMesa.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) return const [];
      rethrow;
    }
  }
}
