import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/lista_json.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart';

/// Municipios a los que se puede viajar, traídos del backend.
///
/// Antes eran siete escritos dentro de la app: agregar un pueblo exigía
/// compilar y repartir un APK nuevo. Ahora la lista vive en el servidor y la
/// app la lee al arrancar, así que un municipio nuevo aparece solo.
///
/// Si la petición falla se conservan los siete de siempre: es preferible una
/// lista corta a una pantalla vacía.
class MunicipalitiesNotifier extends StateNotifier<List<IntercityCity>> {
  MunicipalitiesNotifier(this._ref) : super(IntercityCity.values) {
    unawaitedLoad();
  }

  final Ref _ref;
  bool _cargando = false;

  void unawaitedLoad() {
    // ignore: discarded_futures — carga en segundo plano al construir.
    load();
  }

  Future<void> load() async {
    if (_cargando) return;
    _cargando = true;
    try {
      final res = await _ref
          .read(apiClientProvider)
          .get<Map<String, dynamic>>('/geo/municipios');
      // MUNICIPIO A MUNICIPIO: con un `map` sobre la lista entera, una sola
      // fila ilegible saltaba al `catch` de abajo y la app se quedaba con el
      // respaldo de siete ciudades — justo el síntoma que ya se reportó
      // («sigue saliendo la lista de siete»), sin ninguna pista de por qué.
      final municipios = listaDeJson(
        res.data?['data'],
        (m) => IntercityCity(
          m['slug'] as String,
          m['name'] as String,
          m['department'] as String? ?? '',
          // Centroide del backend: es lo que dibuja la ruta en el mapa.
          (m['lat'] as num?)?.toDouble(),
          (m['lng'] as num?)?.toDouble(),
        ),
      );
      // Vacío = no se publica: dejaría el buscador sin una sola ciudad, y el
      // respaldo de siete es mejor que ninguna.
      if (municipios.isEmpty) return;
      // Se publica en la clase para que todo lo que lee `IntercityCity.values`
      // —desplegables, parseo de reservas, buscador de cupos— vea la lista
      // completa sin tener que pasarla por parámetro.
      IntercityCity.replaceAll(municipios);
      if (mounted) state = municipios;
    } catch (_) {
      // Sin red: se queda con el respaldo de siete.
    } finally {
      _cargando = false;
    }
  }
}

final municipalitiesProvider =
    StateNotifierProvider<MunicipalitiesNotifier, List<IntercityCity>>(
  MunicipalitiesNotifier.new,
);
