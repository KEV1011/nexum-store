/// Con qué nombre se presenta la marca donde está el usuario.
///
/// En Pamplona la app dice **ZIPA/SANTURBÁN** y no «ZIPA» a secas: el operador
/// de allí quiere que se note que la plataforma es de su tierra, y en un pueblo
/// eso pesa más que un nombre genérico. ZIPA va a crecer a otras ciudades, así
/// que la zona no está escrita aquí — la resuelve el servidor contra la tabla de
/// municipios, y sumar una región es editar una fila.
///
/// Se guarda la última conocida en el teléfono para que al volver a abrir la app
/// el nombre salga de inmediato, sin el parpadeo de esperar al GPS y a la red.
/// Nunca se inventa: sin zona resuelta, «ZIPA».
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/network/api_client.dart';

const _kZonaGuardada = 'zipa_zona_marca_v1';

class ZonaMarca {
  const ZonaMarca({this.municipio, this.zona});

  /// Municipio resuelto, o null si no se pudo saber.
  final String? municipio;

  /// Zona configurada para ese municipio ('Santurbán'), o null.
  final String? zona;

  /// Lo que se pinta. Sin zona, la marca sola — nunca «ZIPA/» ni un hueco.
  String get etiqueta {
    final z = zona?.trim();
    return (z == null || z.isEmpty)
        ? AppConstants.appName
        : '${AppConstants.appName}/${z.toUpperCase()}';
  }

  /// ¿Hay algo que decir además de la marca? Lo usa la interfaz para decidir si
  /// enseña la etiqueta o su texto de siempre.
  bool get tieneZona => (zona?.trim().isNotEmpty ?? false);
}

class ZonaMarcaNotifier extends StateNotifier<ZonaMarca> {
  ZonaMarcaNotifier(this._ref) : super(const ZonaMarca()) {
    unawaited(_cargarGuardada());
  }

  final Ref _ref;
  bool _resolviendo = false;

  /// La última zona conocida, para que la app abra ya con el nombre puesto.
  Future<void> _cargarGuardada() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final z = prefs.getString(_kZonaGuardada);
      if (z == null || z.isEmpty || !mounted) return;
      // Solo si todavía no se resolvió la de verdad: la fresca manda.
      if (state.zona == null) state = ZonaMarca(zona: z);
    } catch (_) {
      // Sin preferencias: se espera al GPS, como la primera vez.
    }
  }

  /// Pregunta al servidor con qué nombre se presenta la marca en [lat],[lng].
  ///
  /// No necesita `GOOGLE_MAPS_API_KEY`: el servidor lo resuelve por el municipio
  /// más cercano de su propia tabla.
  Future<void> resolver(double lat, double lng) async {
    if (_resolviendo) return;
    _resolviendo = true;
    try {
      final res = await _ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/geo/zona',
        queryParameters: {'lat': lat, 'lng': lng},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null || !mounted) return;
      final zona = data['zona'] as String?;
      state = ZonaMarca(
        municipio: data['municipio'] as String?,
        zona: zona,
      );
      final prefs = await SharedPreferences.getInstance();
      if (zona != null && zona.isNotEmpty) {
        await prefs.setString(_kZonaGuardada, zona);
      } else {
        // Se mudó a una ciudad sin zona: se borra la vieja en vez de dejarla
        // puesta diciendo que sigue en Santurbán.
        await prefs.remove(_kZonaGuardada);
      }
    } catch (_) {
      // Sin red o servidor viejo sin la ruta: se queda lo que hubiera. La marca
      // a secas es una respuesta correcta, no un error que enseñar.
    } finally {
      _resolviendo = false;
    }
  }
}

final zonaMarcaProvider =
    StateNotifierProvider<ZonaMarcaNotifier, ZonaMarca>(ZonaMarcaNotifier.new);
