import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/shared/widgets/tile_disk_cache.dart';

/// Pase de corta duración para los tiles del mapa.
///
/// Una capa de tiles no puede poner cabeceras: el permiso viaja en la URL de
/// CADA imagen, y una panorámica son decenas. Antes ahí iba el JWT de sesión de
/// 30 días, que acaba en los registros del servidor, en cualquier proxy y en el
/// historial. Este pase dura dos horas y solo sirve para pedir mapas: si se
/// filtra, lo peor que se puede hacer con él es mirar mapas hasta que venza.
///
/// Se renueva solo poco antes de vencer, para que una sesión larga no vea el
/// mapa caer a OpenStreetMap a mitad de camino.
final mapTileTicketProvider = FutureProvider<String?>((ref) async {
  Timer? renovacion;
  ref.onDispose(() => renovacion?.cancel());

  try {
    final res = await ref
        .read(apiClientProvider)
        .get<Map<String, dynamic>>('/geo/tile-ticket');
    final data = res.data?['data'] as Map<String, dynamic>?;
    final ticket = data?['ticket'] as String?;
    if (ticket == null || ticket.isEmpty) return null;

    final vidaS = (data?['expiresIn'] as num?)?.toInt() ?? 7200;
    renovacion = Timer(
      Duration(seconds: (vidaS * 0.9).round()),
      ref.invalidateSelf,
    );
    return ticket;
  } catch (_) {
    // Sin sesión, sin red o backend dormido: OpenStreetMap. El mapa nunca se
    // queda gris por no haber podido pedir un pase.
    return null;
  }
});

/// Color del suelo del mapa, el mismo `#1f2429` del estilo oscuro del backend.
///
/// `MapOptions` pinta gris CLARO por defecto, y ese gris asoma en cada hueco
/// mientras las teselas cargan y en los bordes al arrastrar. Sobre un mapa
/// oscuro eso son destellos blancos en toda la pantalla, que es justo lo que
/// delata que el modo oscuro está pegado por encima en vez de ser el diseño.
const Color mapaFondoOscuro = Color(0xFF1F2429);

/// Vuelve oscura una tesela clara: invertir y girar el tono 180°.
///
/// Es el respaldo, no el plan A. El mapa oscuro DE VERDAD lo pinta Google con
/// el estilo que el backend fija al abrir la sesión de teselas
/// (`ESTILO_MAPA_OSCURO`), donde cada capa —vías, agua, parques— lleva su color
/// elegido. Pero sin `GOOGLE_MAPS_API_KEY` no hay teselas de Google y el mapa
/// cae a OpenStreetMap, que solo existe en claro: dejarlo así sería tener la
/// app oscura con un rectángulo blanco en medio.
///
/// Invertir sin más volvería el agua naranja y los parques morados, porque
/// invertir un color le da su opuesto; el giro de tono de 180° los devuelve a
/// su familia (agua azul oscuro, parque verde oscuro). Es una aproximación
/// —una cartografía diseñada siempre se verá mejor—, pero es honesta y no
/// depende de ningún tercero.
/// Las dos operaciones COMPUESTAS en una sola matriz.
///
/// Antes eran dos `ColorFiltered` anidados, y eso no es gratis: cada uno obliga
/// a Flutter a un `saveLayer` del tamaño de la capa, y el mapa ocupa la pantalla
/// entera. Eran dos búferes a pantalla completa reservados, pintados y
/// compuestos en CADA frame mientras se arrastra el mapa — con el mapa quieto no
/// se nota, pero al mover el dedo es justo la carga que hace que se sienta
/// trabado. Componer dos matrices de color es multiplicarlas (la 5.ª columna es
/// el desplazamiento), y aquí sale exacto porque invertir nunca se sale del
/// rango [0,255] y por tanto no hay recorte intermedio que se pierda al fundir.
///
/// Verificado color a color contra la cadena de dos filtros —blanco, agua,
/// parque, vía, texto y negro dan el mismo resultado— en `tools/matriz-mapa.py`.
const _oscurecerMatriz = ColorFilter.matrix(<double>[
  0.574, -1.43, -0.144, 0, 255, //
  -0.426, -0.43, -0.144, 0, 255, //
  -0.426, -1.43, 0.856, 0, 255, //
  0, 0, 0, 1, 0, //
]);

Widget _oscurecer(Widget capa) =>
    ColorFiltered(colorFilter: _oscurecerMatriz, child: capa);

/// Capa de tiles del mapa **real de Google** (Map Tiles API), servida por el
/// backend en `/geo/tile/{z}/{x}/{y}` con la key server-side (la app nunca ve
/// la key). El backend abre la sesión con el estilo oscuro, así que las
/// teselas llegan ya oscuras.
///
/// Mientras el pase carga —o si la app está sin autenticar— cae a
/// OpenStreetMap oscurecido, para no dejar el mapa en gris ni en blanco.
class GoogleMapTiles extends ConsumerWidget {
  const GoogleMapTiles({super.key});

  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticket = ref.watch(mapTileTicketProvider).valueOrNull;
    // Teselas guardadas en el teléfono: sin esto cada vez que se abre un
    // mapa se vuelven a descargar las 15-25 de la vista, aunque sean las
    // mismas de hace un minuto. En web devuelve null (ya cachea el
    // navegador) y flutter_map usa su proveedor de siempre.
    final cache = crearTileDiskCache();
    if (ticket == null || ticket.isEmpty) {
      return _oscurecer(
        TileLayer(
          urlTemplate: _osm,
          tileProvider: cache,
          // AQUÍ NO se activa `retinaMode`, y es a propósito.
          //
          // Sin plantilla `{r}`, flutter_map simula la alta densidad pidiendo
          // las teselas UN ZOOM MÁS ARRIBA y encogiéndolas: cuatro imágenes por
          // cada una. Con la llave de Google eso es lo correcto (abajo se activa)
          // porque son teselas que se pagan y se sirven. Contra
          // `tile.openstreetmap.org` no: su política de uso prohíbe
          // explícitamente que una app distribuida tire de sus servidores, y lo
          // hacen cumplir limitando y bloqueando. Multiplicar por cuatro las
          // peticiones de cada panorámica es pedir que nos corten — y cuando
          // cortan, lo que queda es el mapa a parches que se ve en el teléfono.
          //
          // Se pierde algo de nitidez en pantallas densas. Un mapa un poco menos
          // fino se lee; uno a parches, no.
          userAgentPackageName: 'com.nexum.client',
        ),
      );
    }
    // Los tiles de Google Map Tiles API son 256 px, el default de flutter_map.
    // fallbackUrl: si el tile del backend falla (Render no desplegado, dormido,
    // 404/401 o Map Tiles API sin habilitar) flutter_map usa OpenStreetMap por
    // tile — el mapa NUNCA queda en blanco.
    return TileLayer(
      urlTemplate: '${ApiConfig.baseUrl}/geo/tile/{z}/{x}/{y}?t=$ticket',
      tileProvider: cache,
      fallbackUrl: _osm,
      retinaMode: RetinaMode.isHighDensity(context),
      userAgentPackageName: 'com.nexum.client',
    );
  }
}
