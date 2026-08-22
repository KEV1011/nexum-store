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

/// Marcador de vehículo estilo Google Maps: chip circular blanco con el ícono
/// oficial de Google (Material Icons) que se desliza por la ruta A→B. Los íconos miran a la
/// DERECHA y se voltean automáticamente cuando el conductor va hacia el oeste,
/// para que el vehículo siempre "mire" hacia donde avanza.
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

  static const double markerWidth = 66;
  static const double markerHeight = 52;

  /// Ilustración del vehículo, si existe una para este tipo.
  String? get _ilustracion => vehicleGlyphAsset(kind);

  /// La ilustración mira a la izquierda (hacia el oeste). Se voltea cuando el
  /// vehículo avanza hacia el este, que es media rosa de los vientos.
  bool get _vaHaciaElEste {
    final r = headingDegrees % 360;
    return r >= 0 && r < 180;
  }

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
          if (_ilustracion != null)
            // Ilustración real del vehículo. NO gira con el rumbo, al revés
            // que el dibujo cenital: está en tres cuartos, y girar una vista en
            // perspectiva deja el carro tumbado de lado en cuanto el viaje va
            // hacia el norte o el sur. Lo que sí se hace es voltearla para que
            // mire hacia donde avanza, que es lo único que esa vista puede
            // representar con honestidad.
            Transform.flip(
              flipX: _vaHaciaElEste,
              child: Image.asset(
                _ilustracion!,
                width: markerWidth,
                fit: BoxFit.contain,
                filterQuality: FilterQuality.medium,
                // Sin el archivo (o si no carga) vuelve el dibujo de siempre:
                // el mapa no se queda nunca sin vehículo.
                errorBuilder: (_, __, ___) => _cenital(),
              ),
            )
          else
            _cenital(),
        ],
      ),
    );
  }

  /// El vehículo dibujado en código, visto desde arriba y girado al rumbo.
  Widget _cenital() {
    return Transform.rotate(
      angle: radianesDeRumbo(headingDegrees),
      child: SizedBox(
        width: 30,
        height: 44,
        child: CustomPaint(
          painter: VehicleTopDownPainter(
            kind: _dibujo,
            body: color ?? _carroceria,
          ),
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
String? vehicleGlyphAsset(VehicleGlyphKind kind) => switch (kind) {
      VehicleGlyphKind.taxi => 'assets/vehicles/taxi.png',
      _ => null,
    };

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
