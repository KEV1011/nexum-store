import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/intercity/domain/entities/'
    'intercity_entity.dart';
import 'package:nexum_client/features/intercity/presentation/providers/'
    'intercity_provider.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

/// Dio que rechaza toda petición de inmediato, simulando un backend ausente
/// (como en el demo). Así verificamos el comportamiento *offline-first* sin
/// esperar al `connectTimeout` real.
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

IntercityRequestEntity _sampleRequest() => IntercityRequestEntity(
      id: 'IC_test',
      origin: IntercityCity.pamplona,
      destination: IntercityCity.cucuta,
      departureTime: DateTime.now().add(const Duration(hours: 2)),
      seats: IntercitySeats.one,
      offeredFare: 25000,
      status: IntercityStatus.searching,
      createdAt: DateTime.now(),
    );

void main() {
  group('IntercityNotifier.createRequest (offline-first)', () {
    test('fija la solicitud activa aunque el backend no responda', () async {
      final notifier = IntercityNotifier(_failingDio(), TransportWsService());
      addTearDown(notifier.dispose);

      expect(notifier.state.active, isNull);

      await notifier.createRequest(_sampleRequest());

      // Tras la solicitud, la pantalla de estado debe tener un viaje activo
      // listo para mostrar — sin haber dependido de una respuesta del servidor.
      expect(notifier.state.active, isNotNull);
      expect(notifier.state.active!.origin, IntercityCity.pamplona);
      expect(notifier.state.active!.destination, IntercityCity.cucuta);
      expect(notifier.state.active!.status, IntercityStatus.searching);
      // El indicador de carga no debe quedar atascado encendido.
      expect(notifier.state.isLoading, isFalse);
    });

    test('el estado activo queda disponible de forma sincrónica', () {
      final notifier = IntercityNotifier(_failingDio(), TransportWsService());
      addTearDown(notifier.dispose);

      // No esperamos (await) la solicitud: validamos que `active` ya está
      // disponible en el mismo turno del event loop, que es lo que permite
      // navegar a la pantalla de estado sin bloquear el botón.
      // ignore: unawaited_futures
      notifier.createRequest(_sampleRequest());

      expect(notifier.state.active, isNotNull);
      expect(notifier.state.active!.id, 'IC_test');
    });
  });
}
