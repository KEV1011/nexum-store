import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';
import 'package:url_launcher/url_launcher.dart';

/// Emergency number for Colombia (NOT 911).
const String kEmergencyNumber = '123';

// Pamplona centre — fallback when the passenger app has no GPS fix.
const double _kFallbackLat = 7.3754;
const double _kFallbackLng = -72.6486;

/// SOS button shown during an active trip. Confirms, posts the location to
/// `/safety/sos`, then offers to call 123 and share the trip with the trusted
/// contact.
///
/// Honest scope: this shares your location with your trusted contact and makes
/// calling 123 one tap away. It does NOT automatically alert the police.
class SosButton extends ConsumerWidget {
  const SosButton({required this.tripId, this.lat, this.lng, super.key});

  final String tripId;
  final double? lat;
  final double? lng;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      tooltip: 'Emergencia (SOS)',
      style: IconButton.styleFrom(
        backgroundColor: AppColors.error,
        foregroundColor: Colors.white,
      ),
      icon: const Icon(Icons.sos_rounded),
      onPressed: () => _confirm(context, ref),
    );
  }

  Future<void> _confirm(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Activar SOS?'),
        content: const Text(
          'Compartiremos tu ubicación con tu contacto de confianza y te '
          'facilitaremos llamar al 123. Esto NO avisa automáticamente a la '
          'policía.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Activar SOS'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    SosResult? result;
    try {
      result = await ref.read(safetyServiceProvider).sendSos(
            tripId: tripId,
            lat: lat ?? _kFallbackLat,
            lng: lng ?? _kFallbackLng,
          );
    } catch (_) {
      // Even if the backend call fails, still let the user call 123.
    }
    if (!context.mounted) return;
    await _showActions(context, ref, result);
  }

  Future<void> _showActions(
    BuildContext context,
    WidgetRef ref,
    SosResult? result,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.fromLTRB(
          24, 24, 24, MediaQuery.of(sheetCtx).viewInsets.bottom + 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.sos_rounded, color: AppColors.error, size: 26),
                SizedBox(width: 10),
                Text('SOS activado',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              result == null
                  ? 'No pudimos registrar el evento, pero puedes llamar al 123.'
                  : result.trustedContactNotified
                      ? 'Tu ubicación fue compartida con tu contacto de confianza.'
                      : 'Evento registrado. Configura un contacto de confianza '
                          'para avisarle automáticamente.',
              style: const TextStyle(
                  fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.error,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: () => _callEmergency(sheetCtx),
              icon: const Icon(Icons.phone_in_talk_rounded),
              label: const Text('Llamar al 123'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: () => _shareTrip(sheetCtx, ref),
              icon: const Icon(Icons.share_location_rounded),
              label: const Text('Compartir viaje'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _callEmergency(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: kEmergencyNumber);
    if (!await launchUrl(uri) && context.mounted) {
      AppSnackbar.showInfo(context, 'Marca el $kEmergencyNumber desde tu teléfono.');
    }
  }

  Future<void> _shareTrip(BuildContext context, WidgetRef ref) async {
    try {
      final token = await ref.read(safetyServiceProvider).shareTrip(tripId);
      if (token == null) throw Exception('no token');
      final link = '${ApiConfig.baseUrl}/safety/track/$token';
      await Clipboard.setData(ClipboardData(text: link));
      if (context.mounted) {
        AppSnackbar.showInfo(
          context,
          'Enlace de seguimiento copiado. Envíalo a tu contacto de confianza.',
        );
      }
    } catch (_) {
      if (context.mounted) {
        AppSnackbar.showInfo(context, 'No se pudo generar el enlace de seguimiento.');
      }
    }
  }
}
