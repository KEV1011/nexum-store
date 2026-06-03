import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/transport/domain/entities/'
    'transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/'
    'transport_provider.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Dio que rechaza toda petición de inmediato, simulando un backend ausente.
Dio _failingDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException(requestOptions: options, error: 'offline'),
      ),
    ),
  );
  return dio;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // El despacho en segundo plano consulta el token en secure storage para
  // intentar conectar el WebSocket. Lo simulamos devolviendo null (sin sesión)
  // para que `connect()` regrese false de forma limpia y caiga a simulación.
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    const channel =
        MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => null);
  });

  tearDown(() {
    const channel =
        MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('TransportNotifier.request (offline-first)', () {
    test('devuelve un id y registra el viaje sin depender del backend',
        () async {
      final notifier = TransportNotifier(_failingDio(), TransportWsService());
      addTearDown(notifier.dispose);

      final id = await notifier.request(
        serviceType: TransportServiceType.transporte,
        origin: 'Centro, Pamplona',
        destination: 'Cra. 6 #8-45',
      );

      // El id se genera localmente y el viaje queda disponible de inmediato
      // para que la hoja de pago y el seguimiento puedan abrirse sin esperar.
      expect(id, isNotEmpty);
      final trip = notifier.state.byId(id);
      expect(trip, isNotNull);
      expect(trip!.status, TransportStatus.searching);
      expect(trip.originAddress, 'Centro, Pamplona');
      expect(notifier.state.isLoading, isFalse);
    });

    test('un envío conserva los datos del destinatario', () async {
      final notifier = TransportNotifier(_failingDio(), TransportWsService());
      addTearDown(notifier.dispose);

      final id = await notifier.request(
        serviceType: TransportServiceType.envios,
        origin: 'Tienda',
        destination: 'Casa del cliente',
        recipientName: 'María López',
        recipientPhone: '3101234567',
        packageDescription: 'Caja mediana',
      );

      final trip = notifier.state.byId(id);
      expect(trip, isNotNull);
      expect(trip!.recipientName, 'María López');
      expect(trip.recipientPhone, '3101234567');
      expect(trip.packageDescription, 'Caja mediana');
    });
  });
}
