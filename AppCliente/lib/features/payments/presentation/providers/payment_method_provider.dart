import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/app_config_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Cómo va a pagar el pasajero.
///
/// El catálogo de verdad vive en el backend (`lib/metodos-pago.ts`) y llega por
/// `GET /client/config`: la etiqueta y el detalle que se pintan salen de ahí
/// cuando el servidor los manda. Esta lista es el respaldo —lo que se enseña
/// mientras carga la configuración o si el servidor es más viejo que la app— y
/// es también la que decide el icono, que sí tiene que ser local.
///
/// Lo que separa unos de otros es **quién recibe la plata**. Las billeteras no
/// las cobra la plataforma: el pasajero le transfiere al conductor y lo
/// acuerdan por el chat. Decir lo contrario haría que el conductor lo dejara
/// bajarse sin cobrar.
enum MetodoPago {
  efectivo,
  nequi,
  daviplata,
  bancolombia,
  transferencia,
  enLinea;

  String get etiqueta => switch (this) {
        MetodoPago.efectivo => 'Efectivo',
        MetodoPago.nequi => 'Nequi',
        MetodoPago.daviplata => 'Daviplata',
        MetodoPago.bancolombia => 'Bancolombia',
        MetodoPago.transferencia => 'Otra transferencia',
        MetodoPago.enLinea => 'Pago en línea',
      };

  String get detalle => switch (this) {
        MetodoPago.efectivo => 'Le pagas al conductor al llegar',
        // Se dice con todas las letras que NO lo cobra la plataforma: el
        // pasajero le transfiere al conductor y lo acuerdan por el chat del
        // viaje. Llamarlo "pago en la app" sería mentir sobre quién cobra.
        MetodoPago.nequi ||
        MetodoPago.daviplata ||
        MetodoPago.transferencia =>
          'Le transfieres al conductor; acuerdan el número por el chat',
        MetodoPago.bancolombia =>
          'Transferencia o QR; acuerdan la cuenta por el chat',
        MetodoPago.enLinea => 'Tarjeta, PSE o Nequi, cobrado por la app',
      };

  /// Lo que entiende el backend. Es el identificador estable: la etiqueta
  /// puede cambiar, esto no.
  String get valorApi => switch (this) {
        MetodoPago.efectivo => 'efectivo',
        MetodoPago.nequi => 'nequi',
        MetodoPago.daviplata => 'daviplata',
        MetodoPago.bancolombia => 'bancolombia',
        MetodoPago.transferencia => 'transferencia',
        MetodoPago.enLinea => 'en_linea',
      };

  /// Si necesita la pasarela configurada para poder ofrecerse.
  ///
  /// Solo el pago en línea. Las billeteras se acuerdan entre pasajero y
  /// conductor, así que están disponibles siempre.
  bool get exigePasarela => this == MetodoPago.enLinea;

  static MetodoPago? porValorApi(String? valor) {
    for (final m in MetodoPago.values) {
      if (m.valorApi == valor) return m;
    }
    return null;
  }
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
      for (final m in MetodoPago.values) {
        if (m.name == guardado) { state = m; break; }
      }
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
  if (elegido.exigePasarela && !disponible) return MetodoPago.efectivo;
  return elegido;
});

/// Los métodos que se le pueden ofrecer al pasajero, en orden.
///
/// Manda el servidor cuando responde: así, añadir un método allí lo hace
/// aparecer sin publicar una versión nueva de la app. Si no ha respondido
/// todavía —o es un servidor viejo que no manda la lista— se usa el catálogo
/// local, filtrando el pago en línea si no hay pasarela.
final metodosDePagoProvider = Provider<List<MetodoPago>>((ref) {
  final config = ref.watch(appConfigProvider).valueOrNull;
  final pasarela = config?.pagoEnLinea ?? false;

  final delServidor = config?.metodosPago ?? const <String>[];
  if (delServidor.isNotEmpty) {
    final resueltos = <MetodoPago>[
      for (final v in delServidor)
        if (MetodoPago.porValorApi(v) case final m?) m,
    ];
    // Un método que el servidor manda y esta app no conoce se ignora: pintar
    // una opción sin nombre ni icono es peor que no ofrecerla. Y si no quedara
    // ninguno reconocible, se cae al catálogo local en vez de dejar la lista
    // vacía y al pasajero sin poder elegir nada.
    if (resueltos.isNotEmpty) return resueltos;
  }

  return [
    for (final m in MetodoPago.values)
      if (!m.exigePasarela || pasarela) m,
  ];
});
