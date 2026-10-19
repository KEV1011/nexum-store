import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';

/// El texto que acompaña al enlace. Corto: se lee en la vista previa del chat.
String textoParaCompartir(String url) =>
    'Sigue mi viaje en ZIPA en tiempo real (mapa, carro y hora de llegada): $url';

/// El enlace de WhatsApp con el texto ya escrito. `wa.me` abre la app en el
/// teléfono y WhatsApp Web en el computador, sin pedir permisos.
Uri enlaceWhatsapp(String texto) =>
    Uri.https('wa.me', '/', {'text': texto});

/// Comparte el viaje con alguien de confianza: WhatsApp o copiar el enlace.
///
/// Antes vivía escondido dentro de la hoja del SOS y solo COPIABA un enlace
/// a la API. Ahora se llega también desde el seguimiento —compartir un viaje
/// no debería exigir pulsar el botón de pánico— y abre una página de verdad.
Future<void> compartirViaje(
  BuildContext context,
  WidgetRef ref,
  String tripId,
) async {
  String? url;
  try {
    url = await ref.read(safetyServiceProvider).shareTripUrl(tripId);
  } catch (_) {
    url = null;
  }
  if (!context.mounted) return;
  if (url == null) {
    AppSnackbar.showInfo(
      context,
      'No se pudo generar el enlace de seguimiento. Revisa tu conexión.',
    );
    return;
  }
  final texto = textoParaCompartir(url);
  await showModalBottomSheet<void>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (hoja) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Compartir tu viaje',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              'Quien lo abra verá el carro en el mapa, su placa y a qué hora '
              'llegas. No verá tu teléfono ni lo que pagas. El enlace dura seis '
              'horas.',
              style: TextStyle(fontSize: 13, color: hoja.textSecondaryColor),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: () async {
                Navigator.of(hoja).pop();
                final ok = await launchUrl(
                  enlaceWhatsapp(texto),
                  mode: LaunchMode.externalApplication,
                );
                if (!ok && context.mounted) {
                  await Clipboard.setData(ClipboardData(text: texto));
                  if (context.mounted) {
                    AppSnackbar.showInfo(
                      context,
                      'No se pudo abrir WhatsApp. Copiamos el enlace: pégalo '
                      'donde quieras.',
                    );
                  }
                }
              },
              icon: const Icon(Icons.chat_rounded),
              label: const Text('Enviar por WhatsApp'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: () async {
                Navigator.of(hoja).pop();
                await Clipboard.setData(ClipboardData(text: texto));
                if (context.mounted) {
                  AppSnackbar.showInfo(context, 'Enlace copiado.');
                }
              },
              icon: const Icon(Icons.copy_rounded),
              label: const Text('Copiar enlace'),
            ),
          ],
        ),
      ),
    ),
  );
}
