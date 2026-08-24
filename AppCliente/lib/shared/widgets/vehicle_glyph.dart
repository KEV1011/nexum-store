import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'package:nexum_client/shared/widgets/vehicle_top_down.dart';

/// Tipo de vehículo para el marcador del mapa.
///
/// Son cinco y no tres porque el backend YA distingue seis tipos de vehículo
/// (PARTICULAR, TAXI, MOTO, TURBO, CAMION, MULA) y aquí se aplastaban en
/// carro/moto/camión: un taxi salía con el mismo icono que un particular. No
/// nos faltaban iconos — tirábamos el detalle que ya teníamos.
///
/// TURBO, CAMION y MULA sí comparten glifo a propósito: Material Icons no tiene
/// tres camiones que se distingan de un vistazo a 22 px, y tres iconos que se
/// ven iguales no informan de nada; solo dan la falsa impresión de que sí.
enum VehicleGlyphKind {
  /// Carro particular.
  car,

  /// Taxi (el del cartel en el techo).
  taxi,

  /// Moto de pasajeros.
  moto,

  /// Moto de reparto: la del cajón detrás. Es el glifo de pedidos y mandados,
  /// para que quien espera comida no vea el mismo icono que quien espera una
  /// carrera.
  delivery,

  /// Turbo, camión o mula.
  truck,
}

/// Marcador del vehículo sobre el mapa: la ilustración cenital girada hacia
/// donde avanza, con un halo claro detrás que la separa del mapa oscuro.
///
/// El arte sale de `tools/procesar-vehiculos.py`; los tipos que aún no tienen
/// ilustración se dibujan en código (`VehicleTopDownPainter`), que también es
/// el respaldo si un archivo faltara en el paquete.
class VehicleGlyph extends StatelessWidget {
  const VehicleGlyph({
    required this.kind,
    required this.headingDegrees,
    this.pulse,
    this.animate = true,
    this.color,
    super.key,
  });

  final VehicleGlyphKind kind;

  /// Rumbo en grados (0 = norte, 90 = este). Gira el vehículo entero.
  final double headingDegrees;

  /// Pulso opcional para el halo "en vivo".
  final Animation<double>? pulse;
  final bool animate;

  /// Anula el color de la carrocería. Null = el propio del tipo (taxi
  /// amarillo, camión gris azulado…), que es lo que se quiere casi siempre.
  final Color? color;

  // El marcador es cuadrado y del lado del arte: así el vehículo cabe girado
  // en cualquier rumbo sin recortarse. El camión, que es el más largo, mide 87
  // de diagonal — por eso 96 y no menos. Lo que sobra es transparente.
  static const double markerWidth = _ladoArte;
  static const double markerHeight = _ladoArte;

  /// Traduce el tipo del marcador al del dibujo cenital.
  VehicleTopDownKind get _dibujo => switch (kind) {
        VehicleGlyphKind.car => VehicleTopDownKind.car,
        VehicleGlyphKind.taxi => VehicleTopDownKind.taxi,
        VehicleGlyphKind.moto => VehicleTopDownKind.moto,
        VehicleGlyphKind.delivery => VehicleTopDownKind.delivery,
        VehicleGlyphKind.truck => VehicleTopDownKind.truck,
      };

  /// Color de la carrocería según el tipo. Un taxi amarillo y una moto de
  /// reparto en su color son reconocibles de un vistazo sobre el mapa.
  Color get _carroceria => switch (kind) {
        VehicleGlyphKind.taxi => const Color(0xFFF6C445),
        VehicleGlyphKind.moto => const Color(0xFF37474F),
        VehicleGlyphKind.delivery => const Color(0xFF37474F),
        VehicleGlyphKind.truck => const Color(0xFF546E7A),
        VehicleGlyphKind.car => const Color(0xFF2F3640),
      };


  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: markerWidth,
      height: markerHeight,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // Halo "en vivo".
          if (animate && pulse != null)
            AnimatedBuilder(
              animation: pulse!,
              builder: (context, _) {
                final t = pulse!.value;
                return Container(
                  width: 34 + 26 * t,
                  height: 34 + 26 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF1A73E8)
                        .withValues(alpha: 0.18 * (1 - t)),
                  ),
                );
              },
            ),
          // El vehículo VISTO DESDE ARRIBA, girado hacia donde avanza.
          //
          // Antes esto era un chip circular blanco con un icono de Material
          // dentro —el carro de perfil— que se volteaba en horizontal según el
          // rumbo. Se leía como "hay un carro aquí", pero no se parecía a lo
          // que enseñan las demás plataformas sobre el mapa, y con solo dos
          // orientaciones (izquierda/derecha) un vehículo que iba hacia el
          // norte se dibujaba igual que uno que iba al sur.
          _cenital(),
        ],
      ),
    );
  }

  /// Ilustración cenital de este tipo, o null si no tiene y hay que dibujarlo.
  ///
  /// El repartidor NO tiene imagen a propósito: su seña es el cajón detrás del
  /// asiento, que es lo que distingue «te traen la comida» de «viene tu
  /// carrera». Usar aquí la moto de pasajeros borraría esa diferencia, así que
  /// ese caso sigue con el dibujo en código, que sí lleva el cajón.
  String? get _ilustracion => switch (kind) {
        VehicleGlyphKind.taxi => 'assets/vehicles/taxi.png',
        VehicleGlyphKind.car => 'assets/vehicles/particular.png',
        VehicleGlyphKind.moto => 'assets/vehicles/moto.png',
        VehicleGlyphKind.truck => 'assets/vehicles/camion.png',
        VehicleGlyphKind.delivery => null,
      };

  /// Lado del lienzo de las ilustraciones (ver `tools/procesar-vehiculos.py`).
  static const double _ladoArte = 96;

  Widget get _dibujado => SizedBox(
        width: 30,
        height: 44,
        child: CustomPaint(
          painter: VehicleTopDownPainter(
            kind: _dibujo,
            body: color ?? _carroceria,
          ),
        ),
      );

  /// El vehículo visto desde arriba, girado al rumbo.
  ///
  /// Las ilustraciones vienen en un lienzo cuadrado con el vehículo centrado,
  /// así que rotarlas es exacto: giran sobre su eje en vez de orbitar.
  Widget _cenital() {
    final ruta = _ilustracion;
    final vehiculo = ruta == null
        ? _dibujado
        : Image.asset(
            ruta,
            width: _ladoArte,
            height: _ladoArte,
            filterQuality: FilterQuality.medium,
            // Si el archivo faltara en el paquete, el mapa no se queda sin
            // vehículo: vuelve al dibujo en código.
            errorBuilder: (_, __, ___) => _dibujado,
          );

    return Transform.rotate(
      angle: radianesDeRumbo(headingDegrees),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Halo de contraste, pegado a la silueta.
          //
          // Hace falta porque el mapa es oscuro: el particular es azul marino
          // (#1E293B) y el suelo del mapa es #1f2429 — casi el mismo nivel de
          // oscuridad, así que sin esto el carro se pierde. Probado sobre el
          // color real del mapa antes de elegir los valores: más ancho o más
          // opaco y el taxi y el camión, que ya son claros, parecen encendidos.
          _Halo(child: vehiculo),
          vehiculo,
        ],
      ),
    );
  }
}

/// Silueta blanca difuminada detrás del vehículo, para separarlo del mapa.
class _Halo extends StatelessWidget {
  const _Halo({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Transform.scale(
      scale: 1.10,
      child: ImageFiltered(
        imageFilter: ui.ImageFilter.blur(sigmaX: 2, sigmaY: 2),
        child: ColorFiltered(
          // srcIn = pinta de blanco conservando la transparencia del vehículo,
          // es decir su silueta exacta.
          colorFilter: const ColorFilter.mode(
            Color(0x96FFFFFF),
            BlendMode.srcIn,
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Ilustración del vehículo, o null si ese tipo aún no tiene una.
///
/// Los tipos sin ilustración siguen con el dibujo cenital en el mapa y con el
/// ícono de Material fuera de él. Se añaden de uno en uno según lleguen los
/// archivos: media flota ilustrada y media no se vería peor que ninguna.
/// Ícono de Material Icons (Apache 2.0, de Google y libre) para cada tipo.
///
/// Es el mismo ícono del marcador, también para usarlo fuera del mapa (p. ej.
/// la miniatura del vehículo en la ficha del conductor cuando la empresa no
/// subió una foto real). Una sola fuente: si cambia el del mapa, cambia el de
/// la ficha.
///
/// Los vehículos que dibuja Google Maps en su navegación NO se pueden usar:
/// son contenido de Google Maps y sus términos prohíben reutilizarlo fuera de
/// un mapa suyo. Material Icons sí es de Google y sí es libre.
IconData vehicleGlyphIcon(VehicleGlyphKind kind) => switch (kind) {
      VehicleGlyphKind.car => Icons.directions_car,
      VehicleGlyphKind.taxi => Icons.local_taxi,
      VehicleGlyphKind.moto => Icons.two_wheeler,
      VehicleGlyphKind.delivery => Icons.delivery_dining,
      VehicleGlyphKind.truck => Icons.local_shipping,
    };

/// Traduce el tipo REAL del vehículo del backend (PARTICULAR|TAXI|MOTO|TURBO|
/// CAMION|MULA) al glifo del mapa. [fallback] cubre datos faltantes
/// (histórico/APK viejo) — nunca rompe un mapa por dato faltante.
///
/// [entrega] marca que el servicio es un pedido o un mandado. Convierte la moto
/// en moto de reparto: el dato del vehículo dice "MOTO" en los dos casos, así
/// que sin esto el cajón de reparto no aparecería nunca. No toca los carros —
/// un domicilio en carro sigue siendo un carro.
VehicleGlyphKind vehicleGlyphKindFor(
  String? vehicleType, {
  VehicleGlyphKind fallback = VehicleGlyphKind.car,
  bool entrega = false,
}) {
  final tipo = switch (vehicleType?.toUpperCase()) {
    'MOTO' => VehicleGlyphKind.moto,
    'TURBO' || 'CAMION' || 'MULA' => VehicleGlyphKind.truck,
    'TAXI' => VehicleGlyphKind.taxi,
    'PARTICULAR' => VehicleGlyphKind.car,
    _ => fallback,
  };
  if (entrega && tipo == VehicleGlyphKind.moto) return VehicleGlyphKind.delivery;
  return tipo;
}
