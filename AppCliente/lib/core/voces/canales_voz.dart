// IDÉNTICO en AppCliente y AppTransport (salvo el nombre del paquete): lo
// vigila backend/src/lib/voces-aviso.test.ts.
//
// La voz que suena con una notificación. En Android 8+ el sonido es del
// CANAL, no del mensaje, así que hay un canal por frase y el servidor dice en
// cuál cae cada aviso. Los audios los genera el workflow «Generar voces» y
// van en res/raw: suenan con la app cerrada y no cuestan nada por aviso.

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nexum_client/core/voces/voces_generadas.dart';

/// El canal de una voz. Igual que `canalDeVoz` del servidor.
String canalDeVoz(String id) => 'zipa_voz_$id';

/// Los canales que esta app tiene que crear: uno por voz generada.
List<AndroidNotificationChannel> canalesDeVoz() => [
      for (final e in kVocesGeneradas.entries)
        AndroidNotificationChannel(
          canalDeVoz(e.key),
          'Voz: ${e.value}',
          description: 'Aviso hablado: «${e.value}»',
          importance: Importance.high,
          sound: RawResourceAndroidNotificationSound(canalDeVoz(e.key)),
        ),
    ];

/// El canal de voz de un mensaje que llegó con la app abierta, o null si no
/// trae voz o esta versión de la app no la tiene (entonces suena como antes).
String? canalDeVozDe(String? channelId) {
  if (channelId == null || !channelId.startsWith('zipa_voz_')) return null;
  final id = channelId.substring('zipa_voz_'.length);
  return kVocesGeneradas.containsKey(id) ? channelId : null;
}
