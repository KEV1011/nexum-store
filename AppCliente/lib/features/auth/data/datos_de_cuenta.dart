/// Los datos guardados en el teléfono son de UNA cuenta, no del teléfono.
///
/// POR QUÉ EXISTE. El historial de viajes y envíos, los pedidos, las
/// direcciones, los favoritos y el método de pago se guardan en el dispositivo
/// (en la web, en el navegador). Cerrar sesión solo borraba el token: quien
/// entraba después con OTRA cuenta en el mismo teléfono o navegador veía los
/// envíos, las direcciones de casa y los pedidos de la anterior. Es una fuga
/// de datos personales, no un detalle de interfaz.
///
/// LA REGLA: los datos guardados llevan DUEÑO (el id de la cuenta). Al entrar
/// una cuenta distinta del dueño, se borran antes de enseñar nada. Al cerrar
/// sesión, se borran siempre.
///
/// Lo que es del TELÉFONO y no de la persona (tema claro u oscuro, haber visto
/// la bienvenida) NO se toca: no dice nada de nadie y borrarlo solo molesta.
library;

import 'package:shared_preferences/shared_preferences.dart';

/// Claves con datos DE LA CUENTA. `datos_de_cuenta_test.dart` falla si algún
/// archivo de `lib/` escribe en SharedPreferences sin que su clave esté aquí o
/// en [clavesDelDispositivo]: una clave nueva sin clasificar es exactamente
/// como nació esta fuga.
const clavesDeCuenta = <String>[
  'nexum_transport_v1', // viajes y envíos
  'nexum_orders_v1', // pedidos
  'nexum_addresses_v1', // direcciones guardadas (la casa de alguien)
  'nexum_favorites_v1', // comercios favoritos
  'nexum_metodo_pago', // método de pago elegido
  'nx_pay_method', // método de pago (pantalla de Cuenta)
];

/// Claves del TELÉFONO: sobreviven al cambio de cuenta a propósito.
const clavesDelDispositivo = <String>[
  'nexum_theme_dark',
  'onboarding_complete',
];

/// Quién es el dueño de lo guardado.
const claveDuenoDeDatos = 'nexum_datos_dueno';

enum AccionDatos {
  /// Los datos son de esta misma cuenta.
  conservar,

  /// No había dueño apuntado y se toma como de esta cuenta.
  adoptar,

  /// Son de otra cuenta (o no se sabe de quién): se borran.
  borrar,
}

/// Qué hacer con lo guardado cuando entra [cuentaId].
///
/// [esRestauracion]: la app arranca con una sesión YA abierta (nadie ha
/// escrito teléfono ni código). Ahí, sin dueño apuntado, lo guardado es casi
/// seguro de esa misma persona —las versiones anteriores no apuntaban dueño—
/// y borrarlo le haría perder sus direcciones al actualizar. En cambio, en un
/// INICIO DE SESIÓN sin dueño apuntado no hay forma de saber de quién es: pudo
/// dejarlo la cuenta anterior antes de esta versión. Ahí se borra, porque
/// enseñarle a alguien la casa de otro es mucho peor que perder una caché que
/// el servidor vuelve a llenar.
AccionDatos accionAlEntrar({
  required String? dueno,
  required String cuentaId,
  required bool hayDatos,
  required bool esRestauracion,
}) {
  if (dueno == cuentaId) return AccionDatos.conservar;
  if (dueno != null) return AccionDatos.borrar;
  if (esRestauracion || !hayDatos) return AccionDatos.adoptar;
  return AccionDatos.borrar;
}

/// Borra todo lo que es de la cuenta (y su dueño). Lo del teléfono se queda.
Future<void> borrarDatosDeCuenta(SharedPreferences p) async {
  for (final k in clavesDeCuenta) {
    await p.remove(k);
  }
  await p.remove(claveDuenoDeDatos);
}

/// Deja lo guardado listo para [cuentaId]. Devuelve `true` si hubo que borrar
/// (y entonces lo que esté cargado EN MEMORIA también es de otra cuenta).
Future<bool> prepararDatosDeCuenta(
  SharedPreferences p,
  String cuentaId, {
  required bool esRestauracion,
}) async {
  final accion = accionAlEntrar(
    dueno: p.getString(claveDuenoDeDatos),
    cuentaId: cuentaId,
    hayDatos: clavesDeCuenta.any(p.containsKey),
    esRestauracion: esRestauracion,
  );
  if (accion == AccionDatos.borrar) await borrarDatosDeCuenta(p);
  if (accion != AccionDatos.conservar) {
    await p.setString(claveDuenoDeDatos, cuentaId);
  }
  return accion == AccionDatos.borrar;
}
