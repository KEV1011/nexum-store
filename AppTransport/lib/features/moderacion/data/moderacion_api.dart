import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Un motivo del catálogo de reportes.
class MotivoReporte {
  const MotivoReporte({required this.valor, required this.etiqueta});
  final String valor;
  final String etiqueta;

  factory MotivoReporte.fromJson(Map<String, dynamic> j) => MotivoReporte(
        valor: (j['valor'] as String?) ?? '',
        etiqueta: (j['etiqueta'] as String?) ?? '',
      );
}

/// Alguien a quien tengo bloqueado.
class Bloqueado {
  const Bloqueado({required this.id, required this.personaId, this.nombre});
  final String id;
  final String personaId;
  final String? nombre;

  factory Bloqueado.fromJson(Map<String, dynamic> j) => Bloqueado(
        id: (j['id'] as String?) ?? '',
        personaId: (j['blockedId'] as String?) ?? '',
        nombre: j['nombre'] as String?,
      );
}

/// Reportar contenido y bloquear personas.
///
/// El catálogo de motivos NO vive aquí: lo trae el servidor. Si estuviera
/// duplicado en las dos apps, cambiar un motivo obligaría a publicar versiones
/// nuevas y durante semanas convivirían tres listas distintas — y un motivo
/// que la app manda y el servidor no conoce se rechaza con un error que el
/// usuario no puede arreglar.
class ModeracionApi {
  ModeracionApi([DioClient? client]) : _client = client ?? DioClient();
  final DioClient _client;
  static const basePath = '/driver';

  Future<List<MotivoReporte>> motivos() async {
    final res = await _client.get<Map<String, dynamic>>('$basePath/reports/reasons');
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(MotivoReporte.fromJson)
        .toList();
  }

  Future<void> reportar({
    required String tipo,
    required String objetivoId,
    required String motivo,
    String? detalle,
  }) async {
    await _client.dio.post<Map<String, dynamic>>('$basePath/reports', data: {
      'targetKind': tipo,
      'targetId': objetivoId,
      'reason': motivo,
      if (detalle != null && detalle.trim().isNotEmpty) 'detail': detalle.trim(),
    });
  }

  Future<void> bloquear({required String tipo, required String id, String? motivo}) async {
    await _client.dio.post<Map<String, dynamic>>('$basePath/blocks', data: {
      'kind': tipo,
      'id': id,
      if (motivo != null) 'reason': motivo,
    });
  }

  Future<void> desbloquear(String personaId) async {
    await _client.dio.delete<Map<String, dynamic>>('$basePath/blocks/$personaId');
  }

  Future<List<Bloqueado>> bloqueados() async {
    final res = await _client.get<Map<String, dynamic>>('$basePath/blocks');
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(Bloqueado.fromJson)
        .toList();
  }
}

final moderacionApiProvider = Provider<ModeracionApi>((ref) => ModeracionApi());
