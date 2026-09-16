import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_glifos.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

export 'package:nexum_client/app/theme/zipa_glifos.dart' show ZipaGlifo;

// ── Iconos de sistema de ZIPA ────────────────────────────────────────────────
//
// Punto de entrada ÚNICO. Ningún widget instancia un icono por su cuenta.
//
// La regla no se sostiene con disciplina, se sostiene por construcción: aquí no
// se recibe un `IconData`, se recibe un valor de [ZipaIconName]. No hay forma
// de colar un glifo suelto, ni de pedir 23 píxeles, ni de cambiar a la variante
// rellena — porque nada de eso es un parámetro.
//
// EL ESTADO ACTIVO NO CAMBIA EL GLIFO. Se expresa con color y con el
// contenedor. Un icono que pasa de línea a relleno al seleccionarse cambia de
// peso visual y hace saltar la fila entera.
//
// SOBRE EL PAQUETE DE ICONOS
//
// El encargo pedía `tabler_icons_flutter`. No se puede: su última versión
// publicada (2.11.0, de hace dos años) declara `sdk: '>=2.12.0 <3.0.0'` y esta
// app va con Dart 3.12, así que `flutter pub get` no resuelve. Comprobado
// contra la API de pub.dev, no contra la ficha.
//
// La alternativa que nombra el encargo, `phosphor_flutter` 2.1.0, sí admite
// Dart 3 (`<4.0.0`). Se deja SIN añadir a la espera de confirmación, porque
// cambiar de familia de iconos es una decisión de marca y no un detalle
// técnico. Mientras tanto se usa Material **Outlined**, que ya viene con
// Flutter: es de línea, rejilla de 24, no añade peso al APK y —lo que decidió
// la elección— sus nombres se pueden verificar contra los que esta app ya
// compila, cosa que con un paquete nuevo no se puede hacer sin un SDK local.
//
// Cambiar de familia después es tocar UN mapa, el de aquí abajo. Ese es
// justamente el motivo de que exista este archivo.
//
// LOS CUATRO SERVICIOS SON GLIFOS PROPIOS
//
// Taxi, campana de servir, caja y buseta están DIBUJADOS por nosotros
// (`zipa_glifos.dart`), no traídos de ninguna familia. Son las cuatro puertas
// de la home: lo primero que se ve al abrir la app, y con los iconos de
// catálogo esa pantalla era la de todo el mundo. El resto del catálogo sigue en
// Material a propósito — en una lupa o un chevron, un glifo propio no aporta
// nada y solo sería deuda.
//
// Eso no rompe el punto de entrada único: quien los usa sigue pidiendo un
// [ZipaIconName] y sigue sin poder elegir tamaño ni relleno. El que decide si
// un nombre se dibuja o se toma de Material es este archivo, y nadie más.

/// Los dos únicos tamaños. No hay un tercero ni valores libres.
enum ZipaIconSize {
  /// Barra inferior y acciones principales.
  nav(20),

  /// Dentro de una línea de texto: metadatos, chevrons, badges.
  inline(16);

  const ZipaIconSize(this.px);
  final double px;
}

/// El catálogo cerrado. Añadir un icono a la app es añadirlo aquí.
enum ZipaIconName {
  // Navegación
  inicio,
  pedidos,
  favoritos,
  cuenta,

  // Cabecera y acciones
  buscar,
  chevron,
  campana,
  ubicacion,
  cerrar,
  reintentar,

  // Servicios (solo como respaldo de línea; la tarjeta usa la ilustración)
  movilidad,
  restaurantes,
  envios,
  intermunicipal,

  // Estados
  sinFoto,
  sinConexion,
  sinResultados,
  fueraDeCobertura,
  cerrado,
  verificado,

  /// La nota de un comercio. Entró porque el carrusel la pintaba con «★», y
  /// un emoji lo dibuja el sistema operativo: se ve distinto en cada teléfono
  /// y no es de la marca. Hay una prueba que lo prohíbe en toda la app.
  estrella,
}

/// El glifo de cada nombre. Es el ÚNICO sitio donde vive la familia de iconos.
const Map<ZipaIconName, IconData> _glifos = {
  ZipaIconName.inicio: Icons.storefront_outlined,
  ZipaIconName.pedidos: Icons.receipt_long_outlined,
  ZipaIconName.favoritos: Icons.favorite_border_rounded,
  ZipaIconName.cuenta: Icons.person_outline_rounded,

  ZipaIconName.buscar: Icons.search_rounded,
  ZipaIconName.chevron: Icons.chevron_right_rounded,
  ZipaIconName.campana: Icons.notifications_outlined,
  ZipaIconName.ubicacion: Icons.location_on_outlined,
  ZipaIconName.cerrar: Icons.close_rounded,
  ZipaIconName.reintentar: Icons.refresh_rounded,

  ZipaIconName.movilidad: Icons.local_taxi_rounded,
  ZipaIconName.restaurantes: Icons.restaurant_rounded,
  ZipaIconName.envios: Icons.inventory_2_rounded,
  ZipaIconName.intermunicipal: Icons.airport_shuttle_rounded,

  ZipaIconName.sinFoto: Icons.image_outlined,
  ZipaIconName.sinConexion: Icons.wifi_off_rounded,
  ZipaIconName.sinResultados: Icons.search_off_rounded,
  ZipaIconName.fueraDeCobertura: Icons.location_off_rounded,
  ZipaIconName.cerrado: Icons.schedule_rounded,
  ZipaIconName.verificado: Icons.shield_outlined,
  ZipaIconName.estrella: Icons.star_rounded,
};

/// Los nombres que se dibujan con glifo PROPIO en vez de con el de Material.
///
/// Son las cuatro puertas de la home: lo primero que se ve al abrir la app y lo
/// único que la distingue de cualquier otra. El resto del catálogo sigue en
/// Material a propósito — en un chevron o una lupa, un icono propio no aporta
/// nada y solo sería deuda que mantener.
///
/// Los cuatro conservan además su entrada en `_glifos`, y no por descuido: es
/// la red de seguridad. Si mañana se retira un glifo pintado, el icono no
/// desaparece de la pantalla, vuelve al de Material. Y es lo que deja que la
/// prueba del catálogo siga exigiendo que TODO nombre tenga glifo.
const Map<ZipaIconName, ZipaGlifo> _pintados = {
  ZipaIconName.movilidad: ZipaGlifo.movilidad,
  ZipaIconName.restaurantes: ZipaGlifo.restaurantes,
  ZipaIconName.envios: ZipaGlifo.envios,
  ZipaIconName.intermunicipal: ZipaGlifo.intermunicipal,
};

/// Un icono de sistema: monocromo, en uno de los dos tamaños.
class ZipaIcon extends StatelessWidget {
  const ZipaIcon(
    this.nombre, {
    this.size = ZipaIconSize.nav,
    this.color,
    super.key,
  });

  final ZipaIconName nombre;
  final ZipaIconSize size;

  /// Sin color explícito toma el texto secundario, que es lo que quiere un
  /// icono de sistema el 90 % de las veces.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tinta = color ?? context.zTexto2;
    final propio = _pintados[nombre];
    if (propio != null) {
      return SizedBox(
        width: size.px,
        height: size.px,
        child: CustomPaint(
          painter: ZipaGlifoPainter(glifo: propio, color: tinta),
          // El glifo es lo único que hay dentro: sin esto, `CustomPaint` se
          // estira a lo que le den en vez de al cuadro que se le pidió.
          size: Size.square(size.px),
        ),
      );
    }
    return Icon(_glifos[nombre]!, size: size.px, color: tinta);
  }
}

/// Solo para las pruebas: permite recorrer el catálogo sin exponer el mapa.
@visibleForTesting
Map<ZipaIconName, IconData> get glifosParaPruebas => _glifos;

/// Solo para las pruebas: qué nombres llevan glifo propio.
@visibleForTesting
Map<ZipaIconName, ZipaGlifo> get pintadosParaPruebas => _pintados;
