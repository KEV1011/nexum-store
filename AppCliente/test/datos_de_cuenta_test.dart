import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/auth/data/datos_de_cuenta.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Los datos guardados en el teléfono son de UNA cuenta.
///
/// La fuga que esto cierra: cerrar sesión borraba solo el token, y quien
/// entraba después con otra cuenta en el mismo teléfono o navegador veía los
/// envíos, los pedidos y las direcciones de casa del anterior.
void main() {
  group('qué hacer con lo guardado al entrar', () {
    test('mismos datos, misma cuenta: se conservan', () {
      expect(
        accionAlEntrar(dueno: 'a', cuentaId: 'a', hayDatos: true, esRestauracion: false),
        AccionDatos.conservar,
      );
    });

    test('datos de OTRA cuenta: se borran, entre como entre', () {
      for (final restauracion in [true, false]) {
        expect(
          accionAlEntrar(dueno: 'a', cuentaId: 'b', hayDatos: true, esRestauracion: restauracion),
          AccionDatos.borrar,
        );
      }
    });

    test('sin dueño en un INICIO de sesión: no se sabe de quién son, se borran', () {
      // Los dejó la cuenta anterior con una versión que no apuntaba dueño.
      expect(
        accionAlEntrar(dueno: null, cuentaId: 'b', hayDatos: true, esRestauracion: false),
        AccionDatos.borrar,
      );
    });

    test('sin dueño al RESTAURAR la sesión: son de quien ya estaba dentro', () {
      // Actualizar la app no puede costarle a nadie sus direcciones guardadas.
      expect(
        accionAlEntrar(dueno: null, cuentaId: 'a', hayDatos: true, esRestauracion: true),
        AccionDatos.adoptar,
      );
    });

    test('sin datos no hay nada que borrar', () {
      expect(
        accionAlEntrar(dueno: null, cuentaId: 'a', hayDatos: false, esRestauracion: false),
        AccionDatos.adoptar,
      );
    });
  });

  group('sobre SharedPreferences de verdad', () {
    Map<String, Object> deAna() => {
          claveDuenoDeDatos: 'ana',
          'nexum_transport_v1': <String>['{"id":"envio-de-ana"}'],
          'nexum_addresses_v1': '[{"label":"Casa de Ana"}]',
          'nexum_orders_v1': '[]',
          'nexum_theme_dark': true,
          'onboarding_complete': true,
        };

    test('entra Luis donde estuvo Ana: no queda NADA de Ana', () async {
      SharedPreferences.setMockInitialValues(deAna());
      final p = await SharedPreferences.getInstance();

      final borro = await prepararDatosDeCuenta(p, 'luis', esRestauracion: false);

      expect(borro, isTrue);
      for (final k in clavesDeCuenta) {
        expect(p.containsKey(k), isFalse, reason: '$k sigue con datos de Ana');
      }
      expect(p.getString(claveDuenoDeDatos), 'luis');
      // Lo del teléfono no es de nadie y se queda.
      expect(p.getBool('nexum_theme_dark'), isTrue);
      expect(p.getBool('onboarding_complete'), isTrue);
    });

    test('vuelve Ana a su propio teléfono: sus datos siguen ahí', () async {
      SharedPreferences.setMockInitialValues(deAna());
      final p = await SharedPreferences.getInstance();

      final borro = await prepararDatosDeCuenta(p, 'ana', esRestauracion: false);

      expect(borro, isFalse);
      expect(p.getStringList('nexum_transport_v1'), isNotEmpty);
    });

    test('cerrar sesión borra lo de la cuenta y deja lo del teléfono', () async {
      SharedPreferences.setMockInitialValues(deAna());
      final p = await SharedPreferences.getInstance();

      await borrarDatosDeCuenta(p);

      for (final k in [...clavesDeCuenta, claveDuenoDeDatos]) {
        expect(p.containsKey(k), isFalse, reason: k);
      }
      expect(p.getBool('nexum_theme_dark'), isTrue);
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
      expect(vistas, greaterThan(5), reason: 'el detector no está viendo nada');
      expect(
        sinClasificar,
        isEmpty,
        reason: 'Añade la clave a clavesDeCuenta (se borra al cambiar de '
            'cuenta) o a clavesDelDispositivo (tema, bienvenida…).',
      );
    });

    test('las claves de cuenta existen de verdad en el código', () {
      // Una clave mal escrita aquí no borraría nada y la prueba de arriba no
      // lo vería.
      final usadas = constantes.values.toSet();
      for (final k in clavesDeCuenta) {
        expect(usadas.contains(k), isTrue, reason: '«$k» no aparece en lib/');
      }
    });

    test('al cambiar de cuenta se suelta también lo cargado en memoria', () {
      final fuente = File(
        'lib/features/auth/presentation/providers/soltar_datos_de_cuenta.dart',
      ).readAsStringSync();
      for (final p in [
        'transportProvider',
        'ordersProvider',
        'errandProvider',
        'intercityProvider',
        'addressesProvider',
        'favoritesProvider',
        'clientProfileProvider',
        'cartProvider',
      ]) {
        expect(fuente, contains('invalidate($p)'), reason: p);
      }
      final repo = File(
        'lib/features/auth/data/repositories/auth_repository.dart',
      ).readAsStringSync();
      final logout = repo.substring(repo.indexOf('Future<void> logout()'));
      expect(logout, contains('borrarDatosDeCuenta('));
      expect(logout, contains('_alCambiarDeCuenta?.call()'));
    });
  });
}
