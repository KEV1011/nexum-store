import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/shared/services/cola_pruebas.dart';

/// La cola de la app: lo que no sube a la primera se reintenta solo (ver
/// `cola_pruebas.dart`). `main.dart` la arranca con [ColaPruebas.iniciar].
final colaPruebas = ColaPruebas(enviar: _enviarPorHttp);

/// Una subida a `POST /driver/proof/:kind/:id`. Devuelve el código HTTP, o
/// null si no hubo respuesta (sin red, tiempo agotado).
Future<int?> _enviarPorHttp(PruebaPendiente p, Uint8List bytes) async {
  final esFirma = p.phase == 'signature';
  final form = FormData.fromMap({
    'phase': p.phase,
    if (p.signedBy != null && p.signedBy!.trim().isNotEmpty)
      'signedBy': p.signedBy!.trim(),
    'file': MultipartFile.fromBytes(
      bytes,
      filename: esFirma ? 'firma.png' : 'prueba-${p.phase}.${p.subtype}',
      contentType: DioMediaType('image', p.subtype),
    ),
  });
  try {
    final res = await DioClient().dio.post<Map<String, dynamic>>(
          '/driver/proof/${p.kind}/${p.id}',
          data: form,
        );
    return res.statusCode;
  } on DioException catch (e) {
    return e.response?.statusCode;
  }
}

/// Sube la foto de prueba de recogida/entrega al backend
/// (`POST /driver/proof/:kind/:id`), donde queda guardada en el servicio
/// (visible para el cliente y el negocio).
///
/// La entrega nunca se bloquea por la prueba. Sin red, la foto queda en la
/// cola y se sube sola cuando vuelva la señal (antes se perdía: quedaba solo
/// en el teléfono y el cliente nunca la veía).
///
/// [kind] es `'trip' | 'order' | 'errand'`; [phase] es `'pickup' | 'delivery'`.
Future<void> uploadProofPhoto({
  required String kind,
  required String id,
  required String phase,
  required String photoPath,
}) async {
  // Bytes (no ruta) para funcionar igual en móvil y en web, donde
  // image_picker devuelve una URL blob: sin sistema de archivos.
  final Uint8List bytes;
  try {
    bytes = await XFile(photoPath).readAsBytes();
  } catch (_) {
    return; // la foto ya no está en el teléfono: no hay nada que subir
  }
  final lower = photoPath.toLowerCase();
  final subtype = lower.endsWith('.png')
      ? 'png'
      : lower.endsWith('.webp')
          ? 'webp'
          : 'jpeg';
  try {
    await colaPruebas.subirOEncolar(
      kind: kind,
      id: id,
      phase: phase,
      subtype: subtype,
      bytes: bytes,
    );
  } catch (_) {
    // Ni siquiera se pudo guardar en la cola: la entrega sigue igual.
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
/// Igual que la foto: nunca bloquea la entrega y, sin red, va a la cola.
Future<void> uploadSignature({
  required String kind,
  required String id,
  required Uint8List bytes,
  String? signedBy,
}) async {
  try {
    await colaPruebas.subirOEncolar(
      kind: kind,
      id: id,
      phase: 'signature',
      subtype: 'png',
      bytes: bytes,
      signedBy: signedBy,
    );
  } catch (_) {
    // Ni siquiera se pudo guardar en la cola: la entrega sigue igual.
  }
}
