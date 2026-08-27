import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:geolocator/geolocator.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';

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

  /// ¿El último latido salió con una posición real? Falso mientras no haya fix.
  ///
  /// Aquí vivía un respaldo al centro de Pamplona (7.3754, -72.6486) que se
  /// enviaba cuando el GPS todavía no había dado una lectura. La intención era
  /// buena —sin posición el conductor queda con geo nulo y el matching no lo
  /// encuentra— pero el efecto era peor que el problema: el conductor aparecía
  /// para todo el mundo parado en el obelisco, el cliente veía un carro que no
  /// estaba ahí, y PostGIS lo emparejaba con viajes del centro estando quién
  /// sabe dónde. El pasajero esperaba a alguien que nunca iba a llegar.
  ///
  /// Sin fix no se manda nada. El conductor deja de refrescar `lastSeenAt`, el
  /// filtro de frescura de 120 s lo saca del despacho, y eso es exactamente lo
  /// correcto: no es localizable, así que no es despachable.
  bool get hasRealFix => _lastPosition != null;

  /// Se llama cuando el GPS pasa de no tener lectura a tenerla. Lo usa el
  /// provider para retirar el aviso de "sin ubicación real" en cuanto engancha.
  void Function(bool tieneFix)? onFixChanged;

  /// Cuánto se acepta como válida la última posición guardada del teléfono.
  ///
  /// Diez minutos. Por debajo de eso el conductor sigue razonablemente donde
  /// estaba y sirve para arrancar el mapa y el trayecto; por encima ya no es su
  /// posición, es su recuerdo, y mandarla al despacho sería el mismo error que
  /// mandar el centro de Pamplona.
  static const _vigenciaUltimaConocida = Duration(minutes: 10);

  /// Toma la última posición que el sistema ya tenía guardada, si es reciente y
  /// si el GPS aún no ha dado ninguna propia.
  Future<void> _sembrarUltimaConocida() async {
    try {
      final previa = await Geolocator.getLastKnownPosition();
      // Si el stream se adelantó, manda la suya: siempre es mejor.
      if (previa == null || _lastPosition != null) return;
      final edad = DateTime.now().difference(previa.timestamp);
      if (edad > _vigenciaUltimaConocida) return;
      _lastPosition = previa;
      if (!_posiciones.isClosed) _posiciones.add(previa);
      onFixChanged?.call(true);
    } catch (_) {
      // Sin permiso o sin servicio: se espera al stream, como antes.
    }
  }

  /// Posiciones reales del GPS según van llegando.
  ///
  /// El servicio ya escuchaba al GPS para el latido, pero la única forma de
  /// consultarlo desde fuera era `lastPosition`, que hay que sondear. Por eso
  /// el mapa del home del conductor dibujaba su carro sobre una constante: no
  /// tenía a qué suscribirse. Broadcast porque lo miran varias pantallas.
  final _posiciones = StreamController<Position>.broadcast();

  /// Flujo de posiciones reales. Nunca emite una posición inventada.
  Stream<Position> get positionStream => _posiciones.stream;

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
  /// Lanza [LocationPermissionException] si no hay permiso, y
  /// [LocationUnavailableException] si el GPS no da lectura.
  ///
  /// Antes devolvía el centro de Pamplona cuando el GPS fallaba. Quien llamaba
  /// no podía distinguir "estoy en el parque" de "no sé dónde estoy", así que
  /// el conductor se conectaba en el obelisco sin enterarse y sin que nada en
  /// pantalla lo dijera. Una coordenada inventada que se ve igual que una real
  /// es peor que un error.
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
      if (!_posiciones.isClosed) _posiciones.add(position);
      return LocationModel(
        latitude: position.latitude,
        longitude: position.longitude,
        address: 'Ubicación actual',
      );
    } catch (_) {
      throw const LocationUnavailableException();
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
          notificationTitle: 'ZIPA Conductor — en línea',
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

    // Arranque en frío: el último fix que el teléfono YA tiene guardado.
    //
    // El GPS tarda entre unos segundos y más de un minuto en dar su primera
    // lectura propia, y hasta entonces `_lastPosition` era null. Eso no era un
    // detalle: sin posición el mapa del home no se centra, no sale latido (así
    // que el conductor no es despachable) y, al aceptar un viaje, `_trazarTramo`
    // se va sin dibujar nada — el conductor acepta y se queda mirando una
    // pantalla sin trayecto sin saber por qué. Android y iOS guardan la última
    // posición conocida y la devuelven al instante; usarla mientras llega la
    // primera de verdad es lo que hace que la pantalla nazca con algo.
    //
    // No contradice la regla de no inventar posiciones: esto NO es una
    // coordenada fabricada, es una lectura real del propio GPS, solo que de hace
    // un rato. Se descarta si es vieja: a partir de cierto tiempo ya no dice
    // dónde está el conductor, dice dónde estuvo, y para el despacho eso es tan
    // falso como el obelisco. En cuanto llega el primer fix propio, lo pisa.
    unawaited(_sembrarUltimaConocida());

    // Listen to the position stream to keep _lastPosition fresh. onError evita
    // que un fallo del stream (p. ej. web sin permiso) propague una excepción;
    // el heartbeat de respaldo mantiene al conductor asignable igualmente.
    _positionSub = Geolocator.getPositionStream(
      locationSettings: _platformSettings(),
    ).listen(
      (pos) {
        final erraBanner = _lastPosition == null;
        _lastPosition = pos;
        if (!_posiciones.isClosed) _posiciones.add(pos);
        // Primer fix tras conectarse a ciegas: se avisa para que el banner de
        // "sin ubicación real" se retire solo. Sin esto quedaba puesto toda la
        // jornada aunque el GPS hubiera enganchado a los diez segundos.
        if (erraBanner) onFixChanged?.call(true);
      },
      onError: (Object _) {},
    );

    _batchTimer = Timer.periodic(
      Duration(seconds: AppConstants.locationBatchIntervalSeconds),
      (_) => _sendLocationBatch(),
    );

    // Reporta de inmediato (sin esperar el primer intervalo) para que el
    // conductor sea asignable apenas se pone en línea.
    _sendLocationBatch();

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
    final ws = DriverWsService();
    if (!ws.isConnected) return;
    // Durante un viaje, la pantalla de viaje activo transmite la posición
    // sincronizada con la ruta y el id del viaje; aquí solo alimentamos el
    // matching geoespacial cuando el conductor está libre, para no duplicar
    // los `location_update` del viaje.
    if (ws.activeTripId != null) return;
    // Sin fix real no se reporta nada: ver `hasRealFix`. Un latido inventado
    // pone al conductor en el mapa del cliente donde no está.
    final pos = _lastPosition;
    if (pos == null) return;
    ws.sendLocationUpdate(pos.latitude, pos.longitude);
  }

  /// Cancels any active timer and releases resources.
  /// Call this when the app is terminated or the driver goes offline.
  void dispose() {
    stopTracking();
  }
}
