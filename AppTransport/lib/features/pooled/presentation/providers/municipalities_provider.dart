import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/lista_json.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';

/// Municipios a los que se puede viajar, traídos del backend.
///
/// Antes eran siete escritos dentro de la app: publicar una salida a cualquier
/// otro pueblo era imposible, y una oferta intermunicipal desde uno de ellos se
/// mostraba como «Pamplona». Ahora la lista vive en el servidor y la app la lee
/// al abrir la pantalla, así que un municipio nuevo aparece solo.
///
/// Si la petición falla se conservan los siete de siempre: es preferible una
/// lista corta a un desplegable vacío.
class MunicipalitiesNotifier extends StateNotifier<List<PooledCity>> {
  MunicipalitiesNotifier() : super(PooledCity.values) {
    // ignore: discarded_futures — carga en segundo plano al construir.
    load();
  }

  bool _cargando = false;

  Future<void> load() async {
    if (_cargando) return;
    _cargando = true;
    try {
      final res =
          await DioClient().dio.get<Map<String, dynamic>>('/geo/municipios');
      // MUNICIPIO A MUNICIPIO: con un `map` sobre la lista entera, una sola
      // fila ilegible saltaba al `catch` de abajo y la app se quedaba con el
      // respaldo de siete ciudades, sin ninguna pista de por qué.
      final municipios = listaDeJson(
        res.data?['data'],
        (m) => PooledCity(
          m['slug'] as String,
          m['name'] as String,
          (m['lat'] as num?)?.toDouble(),
          (m['lng'] as num?)?.toDouble(),
        ),
      );
      // Vacío = no se publica: el respaldo de siete es mejor que ninguna.
      if (municipios.isEmpty) return;
      // Se publica en la clase para que todo lo que lee `PooledCity.values` o
      // `fromApi` —desplegables, ofertas intermunicipales, salidas publicadas—
      // vea la lista completa sin pasarla por parámetro.
      PooledCity.replaceAll(municipios);
      if (mounted) state = municipios;
    } catch (_) {
      // Sin red: se queda con el respaldo de siete.
    } finally {
      _cargando = false;
    }
  }
}

final municipalitiesProvider =
    StateNotifierProvider<MunicipalitiesNotifier, List<PooledCity>>(
  (ref) => MunicipalitiesNotifier(),
);
