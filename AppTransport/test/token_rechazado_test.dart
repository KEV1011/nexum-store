import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/network/interceptors/auth_interceptor.dart';

/// Un 401 solo saca al conductor al login si su petición llevaba el token.
///
/// Si el almacén seguro tarda al volver del segundo plano, la petición sale
/// sin token y el servidor responde 401; antes eso borraba un token válido.
void main() {
  RequestOptions conCabecera(String? auth) {
    final o = RequestOptions(path: '/driver/profile');
    if (auth != null) o.headers['Authorization'] = auth;
    return o;
  }

  test('token enviado y rechazado: se cierra la sesión', () {
    expect(tokenRechazado(conCabecera('Bearer abc.def.ghi'), 401), isTrue);
  });

  test('petición sin token: NO se borra el guardado', () {
    expect(tokenRechazado(conCabecera(null), 401), isFalse);
    expect(tokenRechazado(conCabecera('Bearer '), 401), isFalse);
  });

  test('otros códigos no tocan la sesión', () {
    expect(tokenRechazado(conCabecera('Bearer abc'), 403), isFalse);
    expect(tokenRechazado(conCabecera('Bearer abc'), null), isFalse);
  });
}
