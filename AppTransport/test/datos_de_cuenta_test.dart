import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/auth/data/datos_de_cuenta.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lo guardado en el teléfono del conductor es de UNA cuenta.
///
/// La fuga que esto cierra: cerrar sesión borraba solo el token, y el
/// historial de viajes —nombres de pasajeros, direcciones de recogida y
/// destino, lo que ganó en cada uno— quedaba en el teléfono para el siguiente
/// conductor. Y el «Cerrar sesión» del perfil iba por su cuenta (`deleteAll`
/// del almacén seguro) sin pasar por ninguna de las dos limpiezas.
void main() {
  group('qué hacer con lo guardado al entrar', () {
    test('misma cuenta: se conserva', () {
      expect(
        accionAlEntrar(dueno: 'a', cuentaId: 'a', hayDatos: true, esRestauracion: false),
        AccionDatos.conservar,
      );
    });

    test('otra cuenta: se borra', () {
      expect(
        accionAlEntrar(dueno: 'a', cuentaId: 'b', hayDatos: true, esRestauracion: false),
        AccionDatos.borrar,
      );
    });

    test('sin dueño en un inicio de sesión: no se sabe de quién es, se borra', () {
      expect(
        accionAlEntrar(dueno: null, cuentaId: 'b', hayDatos: true, esRestauracion: false),
        AccionDatos.borrar,
      );
    });
  });

  group('sobre SharedPreferences de verdad', () {
    Map<String, Object> deAna() => {
          claveDuenoDeDatos: 'ana',
          'nexum_trip_history_v1': '[{"passenger":"Pasajero de Ana"}]',
          'nexum_theme_dark': true,
          'onboarding_complete': true,
          'nexum_app_de_mapas': 'waze',
        };

    test('entra Luis donde estuvo Ana: no queda el historial de Ana', () async {
      SharedPreferences.setMockInitialValues(deAna());
      final p = await SharedPreferences.getInstance();

      expect(await prepararDatosDeCuenta(p, 'luis', esRestauracion: false), isTrue);
      for (final k in clavesDeCuenta) {
        expect(p.containsKey(k), isFalse, reason: '$k sigue con datos de Ana');
      }
      expect(p.getString(claveDuenoDeDatos), 'luis');
      // Lo del teléfono no es de nadie y se queda.
      expect(p.getBool('nexum_theme_dark'), isTrue);
      expect(p.getString('nexum_app_de_mapas'), 'waze');
    });

    test('cerrar sesión borra lo de la cuenta y deja lo del teléfono', () async {
      SharedPreferences.setMockInitialValues(deAna());
      final p = await SharedPreferences.getInstance();

      await borrarDatosDeCuenta(p);

      for (final k in [...clavesDeCuenta, claveDuenoDeDatos]) {
        expect(p.containsKey(k), isFalse, reason: k);
      }
      expect(p.getBool('onboarding_complete'), isTrue);
    });
  });

  group('guardas sobre el código', () {
    final fuentes = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .toList();
    final constantes = <String, String>{};
    final defConst = RegExp(
      r'''(?:static\s+)?const\s+(?:String\s+)?(\w+)\s*=\s*'([^']+)';''',
    );
    for (final f in fuentes) {
      for (final m in defConst.allMatches(f.readAsStringSync())) {
        constantes[m.group(1)!] = m.group(2)!;
      }
    }

    test('toda clave que se guarda está clasificada (cuenta o teléfono)', () {
      // Una clave nueva sin clasificar es exactamente como nació la fuga:
      // nadie la borraba al cambiar de cuenta.
      final escritura = RegExp(
        r'''\.set(?:String|StringList|Bool|Int|Double)\(\s*([\w.]+|'[^']+')''',
      );
      final permitidas = {
        ...clavesDeCuenta,
        ...clavesDelDispositivo,
        claveDuenoDeDatos,
      };
      final sinClasificar = <String>[];
      var vistas = 0;
      for (final f in fuentes) {
        for (final m in escritura.allMatches(f.readAsStringSync())) {
          final arg = m.group(1)!;
          final clave = arg.startsWith("'")
              ? arg.substring(1, arg.length - 1)
              : constantes[arg.split('.').last];
          if (clave == null) {
            sinClasificar.add('${f.path}: no se pudo leer la clave «$arg»');
            continue;
          }
          vistas++;
          if (!permitidas.contains(clave)) {
            sinClasificar.add('${f.path}: «$clave»');
          }
        }
      }
      expect(vistas, greaterThan(3), reason: 'el detector no está viendo nada');
      expect(
        sinClasificar,
        isEmpty,
        reason: 'Añade la clave a clavesDeCuenta (se borra al cambiar de '
            'cuenta) o a clavesDelDispositivo (tema, bienvenida…).',
      );
    });

    test('las claves de cuenta existen de verdad en el código', () {
      final usadas = constantes.values.toSet();
      for (final k in clavesDeCuenta) {
        expect(usadas.contains(k), isTrue, reason: '«$k» no aparece en lib/');
      }
    });

    test('la regla es la MISMA que en la app del pasajero', () {
      // Dos copias de la regla de dueño acaban decidiendo distinto: se compara
      // todo desde «Quién es el dueño» (las listas de claves sí difieren).
      String cola(String ruta) {
        final s = File(ruta).readAsStringSync();
        final i = s.indexOf('/// Quién es el dueño de lo guardado.');
        expect(i, greaterThan(-1), reason: ruta);
        return s.substring(i);
      }

      const propia = 'lib/features/auth/data/datos_de_cuenta.dart';
      const otra = '../AppCliente/lib/features/auth/data/datos_de_cuenta.dart';
      if (!File(otra).existsSync()) return; // solo esta app en el checkout
      expect(cola(propia), cola(otra));
    });

    test('cerrar sesión borra los datos y suelta la memoria', () {
      final repo = File(
        'lib/features/auth/data/repositories/auth_repository_impl.dart',
      ).readAsStringSync();
      final logout = repo.substring(repo.indexOf('Future<void> logout()'));
      expect(logout, contains('borrarDatosDeCuenta('));
      expect(logout, contains('_alCambiarDeCuenta?.call()'));

      final soltar = File(
        'lib/features/auth/presentation/providers/soltar_datos_de_cuenta.dart',
      ).readAsStringSync();
      for (final p in [
        'tripHistoryProvider',
        'earningsBreakdownProvider',
        'walletProvider',
        'driverProfileProvider',
        'editableProfileProvider',
      ]) {
        expect(soltar, contains('invalidate($p)'), reason: p);
      }

      final proveedor = File(
        'lib/features/auth/presentation/providers/auth_provider.dart',
      ).readAsStringSync();
      expect(proveedor, contains('alCambiarDeCuenta: () => soltarDatosDeCuenta(ref)'));
    });

    test('ningún «Cerrar sesión» se salta la puerta del repositorio', () {
      // El del perfil hacía `deleteAll()` del almacén seguro y se iba al login:
      // sin borrar el historial ni soltar los proveedores.
      for (final f in fuentes) {
        final s = f.readAsStringSync();
        expect(s.contains('.deleteAll('), isFalse, reason: f.path);
      }
    });
  });
}
