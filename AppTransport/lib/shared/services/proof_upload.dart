import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Sube la foto de prueba de recogida/entrega al backend
/// (`POST /driver/proof/:kind/:id`), donde queda guardada en el servicio
/// (visible para el cliente y el negocio).
///
/// Best-effort: la entrega nunca se bloquea por la prueba — sin red o sin
/// sesión el flujo sigue y la foto queda solo en el teléfono.
///
/// [kind] es `'trip' | 'order' | 'errand'`; [phase] es `'pickup' | 'delivery'`.
Future<void> uploadProofPhoto({
  required String kind,
  required String id,
  required String phase,
  required String photoPath,
}) async {
  try {
    // Bytes (no ruta) para funcionar igual en móvil y en web, donde
    // image_picker devuelve una URL blob: sin sistema de archivos.
    final bytes = await XFile(photoPath).readAsBytes();
    final lower = photoPath.toLowerCase();
    final subtype = lower.endsWith('.png')
        ? 'png'
        : lower.endsWith('.webp')
            ? 'webp'
            : 'jpeg';
    final form = FormData.fromMap({
      'phase': phase,
      'file': MultipartFile.fromBytes(
        bytes,
        filename: 'prueba-$phase.$subtype',
        contentType: DioMediaType('image', subtype),
      ),
    });
    await DioClient().dio.post<Map<String, dynamic>>(
          '/driver/proof/$kind/$id',
          data: form,
        );
  } catch (_) {
    // Best-effort: sin conexión la prueba queda solo local.
  }
}
