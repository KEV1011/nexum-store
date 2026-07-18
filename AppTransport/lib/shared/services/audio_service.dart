import 'dart:async';

import 'package:audioplayers/audioplayers.dart';

/// Singleton audio service for in-app notification sounds.
class AudioService {
  AudioService._();
  static final AudioService _instance = AudioService._();
  factory AudioService() => _instance;

  final AudioPlayer _player = AudioPlayer();
  Timer? _autoStop;

  /// Reproduce el sonido de solicitud UNA vez (confirmaciones, etc.).
  Future<void> playTripRequest() async {
    try {
      _autoStop?.cancel();
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.release);
      await _player.play(AssetSource('sounds/trip_request.wav'));
    } catch (_) {}
  }

  /// Inicia la ALARMA en bucle para una solicitud entrante: suena de forma
  /// continua mientras el conductor decide (la espera de aceptación). Incluye un
  /// auto-apagado de seguridad por si no se llama a [stopAlarm] (la oferta dura
  /// ~15 s; cortamos a los [maxSeconds]).
  Future<void> startAlarm({int maxSeconds = 30}) async {
    try {
      _autoStop?.cancel();
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.play(AssetSource('sounds/trip_request.wav'));
      _autoStop = Timer(Duration(seconds: maxSeconds), () {
        _player.stop();
        _player.setReleaseMode(ReleaseMode.release);
      });
    } catch (_) {}
  }

  /// Detiene la alarma en bucle (al aceptar/rechazar/expirar la oferta).
  Future<void> stopAlarm() async {
    try {
      _autoStop?.cancel();
      _autoStop = null;
      await _player.stop();
      await _player.setReleaseMode(ReleaseMode.release);
    } catch (_) {}
  }

  Future<void> dispose() async {
    _autoStop?.cancel();
    await _player.dispose();
  }
}
