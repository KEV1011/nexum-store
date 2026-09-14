import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

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

  ZipaIconName.movilidad: Icons.directions_car_outlined,
  ZipaIconName.restaurantes: Icons.restaurant_menu_rounded,
  ZipaIconName.envios: Icons.inventory_2_outlined,
  ZipaIconName.intermunicipal: Icons.map_outlined,

  ZipaIconName.sinFoto: Icons.image_outlined,
  ZipaIconName.sinConexion: Icons.wifi_off_rounded,
  ZipaIconName.sinResultados: Icons.search_off_rounded,
  ZipaIconName.fueraDeCobertura: Icons.location_off_rounded,
  ZipaIconName.cerrado: Icons.schedule_rounded,
  ZipaIconName.verificado: Icons.shield_outlined,
};

/// Un icono de sistema: de línea, monocromo, en uno de los dos tamaños.
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
    return Icon(
      _glifos[nombre]!,
      size: size.px,
      color: color ?? context.zTexto2,
    );
  }
}

/// Solo para las pruebas: permite recorrer el catálogo sin exponer el mapa.
@visibleForTesting
Map<ZipaIconName, IconData> get glifosParaPruebas => _glifos;
