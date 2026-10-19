import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';
import 'package:nexum_client/features/safety/presentation/widgets/sos_button.dart';

/// El texto de la pregunta según lo que vio el servidor.
String textoTodoBien(String kind) => kind == 'deviation'
    ? 'El carro se salió de la ruta esperada. Puede ser un desvío normal, '
        'pero queremos confirmarlo contigo.'
    : 'El carro lleva un rato detenido. Puede ser el tráfico, pero queremos '
        'confirmarlo contigo.';

/// Una sola pregunta abierta a la vez: el WebSocket y la notificación pueden
/// llegar casi juntos, y dos hojas apiladas obligan a contestar dos veces.
bool _abierta = false;

/// «¿Todo bien en tu viaje?» — lo que se le pregunta al pasajero cuando el
/// servidor ve el carro detenido o fuera de la ruta con él a bordo.
///
/// Detectarlo y avisarle solo a la Torre de Control dejaba fuera a la única
/// persona que sabe si pasa algo. «Necesito ayuda» activa el SOS sin volver a
/// preguntar «¿estás seguro?»: quien lo tocó ya contestó.
Future<void> preguntarSiTodoBien(
  BuildContext context,
  WidgetRef ref, {
  required String tripId,
  String kind = 'stall',
  double? lat,
  double? lng,
}) async {
  if (_abierta) return;
  _abierta = true;
  bool? ok;
  try {
    ok = await showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (hoja) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.health_and_safety_rounded,
                  size: 40, color: AppColors.primary),
              const SizedBox(height: 10),
              const Text(
                '¿Todo bien en tu viaje?',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                textoTodoBien(kind),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, color: hoja.textSecondaryColor),
              ),
              const SizedBox(height: 18),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: colorDeTextoSobre(AppColors.primary),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () => Navigator.of(hoja).pop(true),
                child: const Text('Sí, todo bien'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error,
                  side: const BorderSide(color: AppColors.error),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () => Navigator.of(hoja).pop(false),
                icon: const Icon(Icons.sos_rounded),
                label: const Text('Necesito ayuda'),
              ),
            ],
          ),
        ),
      ),
    );
  } finally {
    _abierta = false;
  }
  if (ok == null) return;
  // La respuesta se guarda pase lo que pase con la red: si falla, el SOS de
  // abajo sigue saliendo por su propio camino.
  try {
    await ref.read(safetyServiceProvider).responderTodoBien(tripId, ok: ok);
  } catch (_) {/* best-effort */}
  if (ok == false && context.mounted) {
    await activarSos(context, ref, tripId: tripId, lat: lat, lng: lng, confirmar: false);
  }
}
