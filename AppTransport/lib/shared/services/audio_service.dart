import 'package:audioplayers/audioplayers.dart';

/// Singleton audio service for in-app notification sounds.
class AudioService {
  AudioService._();
  static final AudioService _instance = AudioService._();
  factory AudioService() => _instance;

  final AudioPlayer _player = AudioPlayer();

  /// Plays the trip-request notification beep.
  Future<void> playTripRequest() async {
    try {
      await _player.play(AssetSource('sounds/trip_request.wav'));
    } catch (_) {}
  }

  Future<void> dispose() async {
    await _player.dispose();
  }
}
