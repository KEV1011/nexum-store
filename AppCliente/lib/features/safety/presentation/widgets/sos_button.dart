import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';
import 'package:nexum_client/features/safety/presentation/widgets/compartir_viaje.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:url_launcher/url_launcher.dart';

/// Emergency number for Colombia (NOT 911).
const String kEmergencyNumber = '123';

// Pamplona centre — fallback when the passenger app has no GPS fix.
const double _kFallbackLat = 7.3754;
const double _kFallbackLng = -72.6486;

/// Qué se le dice a alguien que acaba de pulsar el botón de pánico.
///
/// Solo se promete el aviso cuando el backend confirma que SALIÓ. Si no salió,
/// el texto empuja al 123 en vez de tranquilizar: decirle "avisamos a tu
/// contacto" a quien está en peligro y no fue avisado es peor que no decir nada.
String _mensajeSos(SosResult? result) {
  if (result == null) {
    return 'No pudimos registrar el evento. Llama al $kEmergencyNumber ahora mismo.';
  }
  if (result.trustedContactNotified) {
    return 'Avisamos a tu contacto de confianza con tu ubicación.';
  }
  switch (result.contactStatus) {
    case 'sin_contacto':
      return 'Evento registrado. No tienes contacto de confianza configurado: '
          'llama al $kEmergencyNumber si estás en peligro.';
    case 'sin_canal':
    case 'fallo':
    default:
      return 'Evento registrado, pero NO pudimos avisar a tu contacto. '
          'Llama al $kEmergencyNumber ahora mismo.';
  }
}

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
      onPressed: () => activarSos(context, ref, tripId: tripId, lat: lat, lng: lng),
    );
  }
}

/// Activa el SOS de un viaje: pide confirmación (salvo que ya se tenga),
/// registra el evento con la ubicación y ofrece llamar al 123 y compartir.
///
/// Público porque no solo lo dispara el botón rojo: también el «¿Todo bien?»,
/// cuando el pasajero contesta que necesita ayuda — y ahí no se le vuelve a
/// preguntar si está seguro.
Future<void> activarSos(
  BuildContext context,
  WidgetRef ref, {
  required String tripId,
  double? lat,
  double? lng,
  bool confirmar = true,
}) async {
  final confirmed = !confirmar ? true : await showDialog<bool>(
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
          style: FilledButton.styleFrom(foregroundColor: colorDeTextoSobre(AppColors.error),
backgroundColor: AppColors.error),
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
  await _showActions(context, ref, result, tripId);
}

Future<void> _showActions(
  BuildContext context,
  WidgetRef ref,
  SosResult? result,
  String tripId,
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
            _mensajeSos(result),
            style: TextStyle(
                fontSize: 13, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              foregroundColor: colorDeTextoSobre(AppColors.error),
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
            onPressed: () => compartirViaje(sheetCtx, ref, tripId),
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
