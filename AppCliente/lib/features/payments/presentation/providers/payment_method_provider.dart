import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/app_config_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Cómo va a pagar el pasajero.
enum MetodoPago {
  efectivo,
  enLinea;

  String get etiqueta => switch (this) {
        MetodoPago.efectivo => 'Efectivo',
        MetodoPago.enLinea => 'Pago en línea',
      };

  String get detalle => switch (this) {
        MetodoPago.efectivo => 'Le pagas al conductor al llegar',
        MetodoPago.enLinea => 'Tarjeta, Nequi o PSE',
      };
}

/// Método de pago elegido, recordado entre viajes.
///
/// Antes esto no existía: el pago se preguntaba en una hoja que salía DESPUÉS
/// de crear el viaje. Eso tenía dos problemas. Uno de orden —si la persona
/// cerraba la hoja, el viaje ya estaba buscando conductor sin método de pago
/// decidido— y uno de costumbre: había que volver a elegir en cada viaje,
/// cuando casi todo el mundo paga siempre igual.
///
/// Se guarda en el teléfono. Es una preferencia de esta app en este dispositivo,
/// no un dato de la cuenta: no hay nada que sincronizar ni que proteger.
class MetodoPagoNotifier extends StateNotifier<MetodoPago> {
  MetodoPagoNotifier() : super(MetodoPago.efectivo) {
    _cargar();
  }

  static const _clave = 'nexum_metodo_pago';

  Future<void> _cargar() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final guardado = prefs.getString(_clave);
      if (guardado == MetodoPago.enLinea.name) state = MetodoPago.enLinea;
    } catch (_) {
      // Sin preferencias guardadas se queda el efectivo, que es el método que
      // siempre está disponible.
    }
  }

  Future<void> elegir(MetodoPago metodo) async {
    state = metodo;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_clave, metodo.name);
    } catch (_) {
      // Que no se pueda recordar no impide usarlo en este viaje.
    }
  }
}

final metodoPagoProvider =
    StateNotifierProvider<MetodoPagoNotifier, MetodoPago>(
  (ref) => MetodoPagoNotifier(),
);

/// El método REALMENTE utilizable ahora mismo.
///
/// Sin llaves de Wompi el pago en línea no cobra nada, así que aunque quedara
/// guardado de antes (o de una versión con pasarela activa) se cae a efectivo:
/// más vale eso que un botón que promete cobrar y no cobra.
final metodoPagoEfectivoProvider = Provider<MetodoPago>((ref) {
  final elegido = ref.watch(metodoPagoProvider);
  final disponible = ref.watch(appConfigProvider).valueOrNull?.pagoEnLinea ?? false;
  if (elegido == MetodoPago.enLinea && !disponible) return MetodoPago.efectivo;
  return elegido;
});
