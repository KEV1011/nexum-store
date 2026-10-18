import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/auth/data/repositories/auth_repository.dart';
import 'package:nexum_client/features/auth/domain/entities/client_entity.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';

/// La sesión NO se pierde al volver de otra app.
///
/// Cuando el sistema mata la app en segundo plano, al volver arranca de cero y
/// el splash decide a dónde ir. Leía el estado de la sesión sin esperar a que
/// terminara de leerse —el constructor lo pone en «cargando» antes del primer
/// `await`—, así que mandaba al login a quien tenía la sesión intacta.

/// Repositorio que tarda como un almacén seguro lento al despertar.
class _RepoLento implements AuthRepository {
  _RepoLento({required this.conToken, this.demora = const Duration(milliseconds: 300)});

  final bool conToken;
  final Duration demora;

  @override
  Future<bool> isAuthenticated() async {
    await Future<void>.delayed(demora);
    return conToken;
  }

  @override
  Future<ClientEntity?> getStoredClient() async =>
      const ClientEntity(id: 'u1', phone: '+573001112233', name: 'Ana');

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Repositorio cuyo almacén no responde nunca.
class _RepoColgado implements AuthRepository {
  @override
  Future<bool> isAuthenticated() => Completer<bool>().future;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('listo() espera a que la sesión termine de leerse', () {
    test('justo al crearse el estado es «cargando» (el defecto que había)', () {
      final n = AuthNotifier(_RepoLento(conToken: true), Dio());
      expect(n.state, isA<AuthLoading>());
    });

    test('con sesión guardada, listo() la entrega aunque el almacén tarde', () async {
      final n = AuthNotifier(_RepoLento(conToken: true), Dio());
      final s = await n.listo();
      expect(s, isA<AuthAuthenticated>());
      expect((s as AuthAuthenticated).client.name, 'Ana');
    });

    test('sin sesión, listo() dice que no hay sesión', () async {
      final n = AuthNotifier(_RepoLento(conToken: false), Dio());
      expect(await n.listo(), isA<AuthUnauthenticated>());
    });

    test('un almacén colgado no deja la app en el splash para siempre', () async {
      final n = AuthNotifier(_RepoColgado(), Dio());
      final s = await n.listo(espera: const Duration(milliseconds: 200));
      expect(s, isNot(isA<AuthAuthenticated>()));
    });
  });

  group('un 401 solo cierra la sesión si la petición llevaba el token', () {
    RequestOptions conCabecera(String? auth) {
      final o = RequestOptions(path: '/client/trips/active');
      if (auth != null) o.headers['Authorization'] = auth;
      return o;
    }

    test('token enviado y rechazado: sí', () {
      expect(tokenRechazado(conCabecera('Bearer abc.def.ghi'), 401), isTrue);
    });

    test('la petición salió sin token (el almacén tardó): NO se borra', () {
      expect(tokenRechazado(conCabecera(null), 401), isFalse);
      expect(tokenRechazado(conCabecera('Bearer '), 401), isFalse);
    });

    test('otros códigos no tocan la sesión', () {
      expect(tokenRechazado(conCabecera('Bearer abc'), 403), isFalse);
      expect(tokenRechazado(conCabecera('Bearer abc'), 500), isFalse);
      expect(tokenRechazado(conCabecera('Bearer abc'), null), isFalse);
    });
  });

  test('el splash ESPERA a la sesión antes de decidir', () {
    final fuente =
        File('lib/app/router/app_router.dart').readAsStringSync();
    expect(fuente, contains('await ref.read(authProvider.notifier).listo()'));
    // Leer el estado a secas en el splash es el defecto que esto corrige.
    expect(fuente, isNot(contains('final auth = ref.read(authProvider);')));
  });
}
