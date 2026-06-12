import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:geolocator/geolocator.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/ws_service.dart';

/// Servicio de geolocalización para el app del conductor.
///
/// En Android el tracking corre dentro de un foreground service (notificación
/// persistente "Estás en línea"), así el GPS sigue reportando al backend con
/// la pantalla apagada o la app minimizada — requisito para recibir viajes
/// como en Uber/DiDi. En web/iOS degrada a tracking en primer plano.
class LocationService {
  LocationService._();
  static final LocationService _instance = LocationService._();

  /// Returns the singleton instance.
  factory LocationService() => _instance;

  Timer? _batchTimer;
  StreamSubscription<Position>? _positionSub;
  Position? _lastPosition;
  bool _isTracking = false;

  // ── Permissions ────────────────────────────────────────────────────────────

  /// Solicita permisos de ubicación al usuario.
  ///
  /// Returns `true` when the app has at least
  /// [LocationPermission.whileInUse] and the GPS service is enabled.
  Future<bool> requestPermissions() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return false;
    }

    if (permission == LocationPermission.deniedForever) return false;

    return true;
  }

  // ── Current position ───────────────────────────────────────────────────────

  /// Obtiene la posición actual del conductor.
  ///
  /// Throws [LocationPermissionException] if the user has not granted
  /// location access.  Falls back to the centre of Pamplona if the GPS
  /// hardware call fails for any other reason.
  Future<LocationModel> getCurrentLocation() async {
    final hasPermission = await requestPermissions();
    if (!hasPermission) {
      throw const LocationPermissionException();
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
      _lastPosition = position;
      return LocationModel(
        latitude: position.latitude,
        longitude: position.longitude,
        address: 'Ubicación actual',
      );
    } catch (_) {
      // Si falla GPS, retornar posición mock (centro de Pamplona)
      return const LocationModel(
        latitude: 7.3754,
        longitude: -72.6486,
        address: 'Parque Águeda Gallardo, Pamplona',
      );
    }
  }

  // ── Background tracking ────────────────────────────────────────────────────

  /// Ajustes del stream de posición por plataforma. En Android adjunta el
  /// foreground service que mantiene vivo el GPS en segundo plano.
  LocationSettings _platformSettings() {
    if (!kIsWeb && Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Nexum Conductor — en línea',
          notificationText:
              'Compartiendo tu ubicación para asignarte viajes cercanos',
          notificationChannelName: 'Ubicación en segundo plano',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (!kIsWeb && Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        showBackgroundLocationIndicator: true,
        pauseLocationUpdatesAutomatically: false,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );
  }

  /// Inicia el tracking de ubicación y el envío periódico al backend.
  ///
  /// Envía coordenadas cada [AppConstants.locationBatchIntervalSeconds]
  /// segundos vía WebSocket (alimenta el matching geoespacial).
  void startTracking() {
    if (_isTracking) return;
    _isTracking = true;

    // Listen to the position stream to keep _lastPosition fresh
    _positionSub = Geolocator.getPositionStream(
      locationSettings: _platformSettings(),
    ).listen((pos) {
      _lastPosition = pos;
    });

    _batchTimer = Timer.periodic(
      Duration(seconds: AppConstants.locationBatchIntervalSeconds),
      (_) => _sendLocationBatch(),
    );

    // ignore: avoid_print
    print(
      '[LocationService] Tracking iniciado. '
      'Enviando coords cada ${AppConstants.locationBatchIntervalSeconds}s',
    );
  }

  /// Detiene el tracking de ubicación.
  void stopTracking() {
    _batchTimer?.cancel();
    _batchTimer = null;
    _positionSub?.cancel();
    _positionSub = null;
    _isTracking = false;
    // ignore: avoid_print
    print('[LocationService] Tracking detenido.');
  }

  /// Whether location tracking is currently active.
  bool get isTracking => _isTracking;

  /// The most recently captured [Position], or `null` if no fix has been
  /// obtained yet.
  Position? get lastPosition => _lastPosition;

  // ── Private helpers ────────────────────────────────────────────────────────

  void _sendLocationBatch() {
    if (_lastPosition == null) return;
    final ws = WsService();
    ws.sendLocationUpdate(
      _lastPosition!.latitude,
      _lastPosition!.longitude,
      ws.activeTripId,
    );
  }

  /// Cancels any active timer and releases resources.
  /// Call this when the app is terminated or the driver goes offline.
  void dispose() {
    stopTracking();
  }
}
