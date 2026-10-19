/// El ingreso del conductor, contra la forma REAL que manda el backend.
///
/// Es la puerta de todo: si esto falla, no hay app. Y ya falló una vez por
/// aquí —`(d['rating'] as num).toDouble()` sobre un conductor sin
/// calificaciones, que desde que `Driver.rating` es nullable es TODO conductor
/// nuevo—, así que lo que se fija no es el camino feliz (ese ya lo cubre
/// `verify_otp_usecase_test` con el datasource de mentira) sino los casos que
/// el servidor sí produce y que rompen un casteo duro.
///
/// Las respuestas de este fichero están copiadas de `_driverToDTO` de
/// `backend/src/services/auth.service.ts`: es la única forma de que la prueba
/// mida el contrato y no mi idea del contrato.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_datasource.dart';
import 'package:nexum_driver/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/usecases/register_driver_usecase.dart';

/// Datasource que devuelve lo que se le diga, o lanza lo que se le diga.
class FakeAuthDataSource implements AuthDataSource {
  FakeAuthDataSource({this.respuesta, this.error});

  final Map<String, dynamic>? respuesta;
  final Object? error;

  @override
  Future<bool> sendOtp(String phoneNumber) async => true;

  @override
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async =>
      _responder();

  @override
  Future<Map<String, dynamic>> registerDriver(Map<String, dynamic> data) async =>
      _responder();

  Map<String, dynamic> _responder() {
    if (error != null) throw error!;
    return respuesta!;
  }
}

/// La ficha del conductor tal como la arma `_driverToDTO`.
///
/// Ojo con `vehiculo: false`: el backend NO manda null cuando el conductor no
/// tiene vehículo activo, manda el objeto con los campos en blanco. Es el caso
/// de un conductor que una empresa afilió por teléfono y a quien todavía no le
/// registró el carro.
Map<String, dynamic> ficha({
  double? rating,
  int totalTrips = 0,
  bool vehiculo = true,
}) =>
    <String, dynamic>{
      'id': 'drv-1',
      'name': 'Nelson Villamizar',
      'phone': '+573002223344',
      'rating': rating,
      'totalTrips': totalTrips,
      'vehicle': vehiculo
          ? <String, dynamic>{
              'brand': 'Chevrolet',
              'model': 'Spark GT',
              'year': 2020,
              'plate': 'KGB742',
              'color': 'Blanco',
            }
          : <String, dynamic>{
              'brand': '',
              'model': '',
              'year': 0,
              'plate': '',
              'color': '',
            },
      'bankAccount': <String, dynamic>{'bank': '', 'type': '', 'number': ''},
    };

AuthRepositoryImpl repo({Map<String, dynamic>? respuesta, Object? error}) =>
    AuthRepositoryImpl(
      dataSource: FakeAuthDataSource(respuesta: respuesta, error: error),
      secureStorage: const FlutterSecureStorage(),
    );

Future<String?> guardado(String clave) =>
    const FlutterSecureStorage().read(key: clave);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // Sin plataforma nativa en las pruebas: almacén en memoria del plugin.
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  group('los datos guardados son del conductor que entró', () {
    // El historial de viajes (pasajeros, direcciones, ganancias) vive en el
    // teléfono. Cerrar sesión solo borraba el token y el siguiente conductor
    // lo veía todo.
    const historial = 'nexum_trip_history_v1';

    test('entra OTRO conductor: no ve el historial del anterior', () async {
      SharedPreferences.setMockInitialValues({
        'nexum_datos_dueno': 'drv-anterior',
        historial: '[{"passenger":"Pasajero del anterior"}]',
      });
      var soltados = 0;
      final r = await AuthRepositoryImpl(
        dataSource: FakeAuthDataSource(respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(),
        }),
        secureStorage: const FlutterSecureStorage(),
        alCambiarDeCuenta: () => soltados++,
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.failure, isNull, reason: '${r.failure?.message}');
      final p = await SharedPreferences.getInstance();
      expect(p.containsKey(historial), isFalse);
      expect(p.getString('nexum_datos_dueno'), 'drv-1');
      expect(soltados, 1, reason: 'lo cargado en memoria también es del otro');
    });

    test('vuelve el MISMO conductor: su historial sigue ahí', () async {
      SharedPreferences.setMockInitialValues({
        'nexum_datos_dueno': 'drv-1',
        historial: '[{"passenger":"Suyo"}]',
      });
      await repo(respuesta: <String, dynamic>{
        'token': 'jwt-1',
        'isRegistered': true,
        'driver': ficha(),
      }).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      final p = await SharedPreferences.getInstance();
      expect(p.getString(historial), isNotNull);
    });

    test('un número NUEVO (va al registro) no hereda nada', () async {
      SharedPreferences.setMockInitialValues({
        'nexum_datos_dueno': 'drv-anterior',
        historial: '[{"passenger":"Pasajero del anterior"}]',
      });
      await repo(respuesta: <String, dynamic>{
        'token': 'jwt-1',
        'isRegistered': false,
      }).verifyOtp(phoneNumber: '+573009998877', otpCode: '123456');

      final p = await SharedPreferences.getInstance();
      expect(p.containsKey(historial), isFalse);
    });

    test('cerrar sesión borra el historial y la marca de registro', () async {
      SharedPreferences.setMockInitialValues({
        'nexum_datos_dueno': 'drv-1',
        historial: '[{"passenger":"Suyo"}]',
        'nexum_theme_dark': true,
      });
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.authTokenKey: 'jwt-1',
        AppConstants.needsRegistrationKey: '+573002223344',
      });
      var soltados = 0;
      await AuthRepositoryImpl(
        dataSource: FakeAuthDataSource(),
        secureStorage: const FlutterSecureStorage(),
        alCambiarDeCuenta: () => soltados++,
      ).logout();

      final p = await SharedPreferences.getInstance();
      expect(p.containsKey(historial), isFalse);
      expect(p.getBool('nexum_theme_dark'), isTrue, reason: 'es del teléfono');
      expect(await guardado(AppConstants.needsRegistrationKey), isNull);
      expect(soltados, 1);
    });
  });

  group('verificar el código', () {
    test('un conductor SIN calificaciones entra, y su nota es null', () async {
      // LA COMPROBACIÓN QUE JUSTIFICA EL FICHERO. Con `as num` esto lanzaba,
      // el motivo acababa en `UnexpectedFailure(e.toString())` y el conductor
      // leía un error de tipos en vez de entrar. Y no es un caso raro: es
      // todo conductor nuevo desde que se quitó el 5,0 de fábrica.
      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(),
        },
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.failure, isNull, reason: '${r.failure?.message}');
      expect(r.driver, isNotNull);
      expect(r.driver!.rating, isNull, reason: 'no se inventa una nota');
      expect(r.isRegistered, isTrue);
    });

    test('con calificaciones se lee la nota', () async {
      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(rating: 4.87, totalTrips: 312),
        },
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.driver!.rating, 4.87);
      expect(r.driver!.totalTrips, 312);
    });

    test('un conductor afiliado SIN vehículo todavía también entra', () async {
      // La empresa lo afilió por teléfono y aún no le registró el carro. Si
      // esto fallara, el conductor no podría ni abrir la app para enterarse.
      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(vehiculo: false),
        },
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.failure, isNull, reason: '${r.failure?.message}');
      expect(r.driver!.vehiclePlate, isEmpty);
    });

    test('el token queda guardado: es la sesión', () async {
      await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-nelson',
          'isRegistered': true,
          'driver': ficha(),
        },
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(await guardado(AppConstants.authTokenKey), 'jwt-nelson');
    });

    test('a un conductor ya registrado se le LIMPIA la marca de registro',
        () async {
      // Si se quedara puesta de un registro que se interrumpió, el router lo
      // mandaría al formulario de registro en cada arranque, para siempre.
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.needsRegistrationKey: '+573002223344',
      });

      await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(),
        },
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(await guardado(AppConstants.needsRegistrationKey), isNull);
    });

    test('un conductor nuevo: sin ficha, con token y marcado para registrarse',
        () async {
      // El token hace falta AQUÍ: es con el que se postea el registro. Y la
      // marca lleva el teléfono porque el formulario lo da por bueno sin
      // volver a pedir el código.
      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-nuevo',
          'isRegistered': false,
          'driver': <String, dynamic>{},
        },
      ).verifyOtp(phoneNumber: '+573009998877', otpCode: '123456');

      expect(r.failure, isNull);
      expect(r.driver, isNull);
      expect(r.isRegistered, isFalse);
      expect(await guardado(AppConstants.authTokenKey), 'jwt-nuevo');
      expect(
        await guardado(AppConstants.needsRegistrationKey),
        '+573009998877',
      );
    });

    test('sin `isRegistered` se asume registrado', () async {
      // Compatibilidad con un backend anterior a ese campo: dar por nuevo a
      // quien ya está registrado lo mandaría a registrarse otra vez y la
      // placa chocaría con la suya propia.
      final r = await repo(
        respuesta: <String, dynamic>{'token': 'jwt-1', 'driver': ficha()},
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.isRegistered, isTrue);
      expect(r.driver, isNotNull);
    });

    test('código equivocado: el motivo es ESE y no un error genérico',
        () async {
      final r = await repo(error: const InvalidOtpException())
          .verifyOtp(phoneNumber: '+573002223344', otpCode: '000000');

      expect(r.failure, isA<InvalidOtpFailure>());
      expect(r.driver, isNull);
    });

    test('sin conexión se dice que es la red, con el texto del servicio',
        () async {
      final r = await repo(
        error: const NetworkException(message: 'Sin conexión a internet.'),
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.failure, isA<NetworkFailure>());
      expect(r.failure!.message, 'Sin conexión a internet.');
    });

    test('una respuesta sin token falla, no revienta ni abre sesión',
        () async {
      final r = await repo(
        respuesta: <String, dynamic>{'isRegistered': true, 'driver': ficha()},
      ).verifyOtp(phoneNumber: '+573002223344', otpCode: '123456');

      expect(r.failure, isNotNull);
      expect(r.driver, isNull);
      expect(
        await guardado(AppConstants.authTokenKey),
        isNull,
        reason: 'sin token no puede quedar sesión a medias',
      );
    });
  });

  group('registrar al conductor', () {
    const params = RegisterDriverParams(
      phone: '+573002223344',
      fullName: 'Nelson Villamizar',
      documentType: 'CC',
      documentNumber: '1090123456',
      vehicleBrand: 'Chevrolet',
      vehicleModel: 'Spark GT',
      vehicleYear: 2020,
      vehiclePlate: 'KGB742',
      vehicleColor: 'Blanco',
      vehicleType: 'taxi',
      bankName: 'Bancolombia',
      bankAccountType: 'ahorros',
      bankAccountNumber: '12345678901',
      acceptedTerms: true,
    );

    test('al registrarse queda la sesión y se borra la marca', () async {
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.needsRegistrationKey: '+573002223344',
      });

      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-registrado',
          'isRegistered': true,
          'driver': ficha(),
        },
      ).registerDriver(params);

      expect(r.isRight(), isTrue);
      expect(await guardado(AppConstants.authTokenKey), 'jwt-registrado');
      expect(await guardado(AppConstants.needsRegistrationKey), isNull);
    });

    test('un conductor recién registrado no nace verificado', () async {
      // Lo verifica un admin con sus documentos a la vista; nacer verificado
      // sería ponerlo a recibir pasajeros sin que nadie viera la licencia.
      final r = await repo(
        respuesta: <String, dynamic>{
          'token': 'jwt-1',
          'isRegistered': true,
          'driver': ficha(),
        },
      ).registerDriver(params);

      final d = r.fold<DriverEntity?>((_) => null, (ficha) => ficha);
      expect(d?.isVerified, isFalse);
    });

    test('el motivo que escribió el servidor llega tal cual', () async {
      // Es el arreglo que hizo que «Error del servidor (400)» pasara a decir
      // qué hay que corregir. Si el repositorio lo tradujera, se perdería.
      const motivo = 'La placa KGB742 ya está registrada a nombre de otro '
          'conductor. Si el vehículo es tuyo, escribe a soporte.';
      final r = await repo(error: const ServerException(message: motivo))
          .registerDriver(params);

      final f = r.fold<Failure?>((fallo) => fallo, (_) => null);
      expect(f, isA<ServerFailure>());
      expect(f!.message, motivo);
    });

    test('si falla el registro NO queda sesión abierta', () async {
      final r = await repo(error: const ServerException(message: 'x'))
          .registerDriver(params);

      expect(r.isLeft(), isTrue);
      expect(await guardado(AppConstants.authTokenKey), isNull);
    });
  });

  group('la sesión guardada', () {
    test('con token hay sesión', () async {
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.authTokenKey: 'jwt-1',
      });
      expect(await repo().isAuthenticated(), isTrue);
    });

    test('un token vacío NO es sesión', () async {
      // Un string en blanco pasaría un `!= null` y dejaría al conductor
      // dentro de la app sin poder hacer una sola petición.
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.authTokenKey: '',
      });
      expect(await repo().isAuthenticated(), isFalse);
    });

    test('sin nada guardado no hay sesión', () async {
      expect(await repo().isAuthenticated(), isFalse);
    });

    test('al salir se borra el token', () async {
      FlutterSecureStorage.setMockInitialValues({
        AppConstants.authTokenKey: 'jwt-1',
      });
      await repo().logout();
      expect(await guardado(AppConstants.authTokenKey), isNull);
    });
  });
}
