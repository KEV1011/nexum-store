import 'dart:typed_data';

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

/// Sube la FIRMA del destinatario, ya renderizada a PNG.
///
/// Va por la MISMA ruta que las fotos de prueba (`phase: 'signature'`), así
/// que hereda la verificación de pertenencia del servidor —`updateMany` con
/// `driverId` en el `where`— y el mismo almacenamiento. No hace falta un
/// camino aparte: una firma es una imagen más.
///
/// Antes esto no existía: la hoja capturaba los trazos y solo pasaba un
/// booleano, así que la firma se perdía al cerrar la pantalla.
///
/// [signedBy] es quien firma. Va aparte del nombre del cliente a propósito:
/// muchas veces recibe la portera o el vecino, y eso es justo lo que hay que
/// dejar por escrito.
///
/// Best-effort, igual que la foto: la entrega nunca se bloquea por la prueba.
Future<void> uploadSignature({
  required String kind,
  required String id,
  required Uint8List bytes,
  String? signedBy,
}) async {
  try {
    final form = FormData.fromMap({
      'phase': 'signature',
      if (signedBy != null && signedBy.trim().isNotEmpty)
        'signedBy': signedBy.trim(),
      'file': MultipartFile.fromBytes(
        bytes,
        filename: 'firma.png',
        contentType: DioMediaType('image', 'png'),
      ),
    });
    await DioClient().dio.post<Map<String, dynamic>>(
          '/driver/proof/$kind/$id',
          data: form,
        );
  } catch (_) {
    // Best-effort: sin conexión la firma queda solo en el teléfono.
  }
}
