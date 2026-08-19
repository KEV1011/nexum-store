import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/shared/widgets/vehicle_glyph.dart';

/// Los colores que necesita la ficha. Se pasan juntos y no sueltos para que
/// una pantalla no pueda vestirla a medias (fondo oscuro con texto oscuro).
class DriverCardPalette {
  const DriverCardPalette({
    required this.surface,
    required this.outline,
    required this.textPrimary,
    required this.textSecondary,
    required this.textDim,
    required this.accent,
    required this.avatarBg,
    required this.thumbBg,
  });

  /// La paleta normal de la app.
  factory DriverCardPalette.deTema(BuildContext context) => DriverCardPalette(
        surface: Theme.of(context).colorScheme.surface,
        outline: context.outlineColor,
        textPrimary: context.textPrimaryColor,
        textSecondary: context.textSecondaryColor,
        textDim: context.textTertiaryColor,
        accent: AppColors.primary,
        avatarBg: AppColors.primaryContainer,
        thumbBg: context.surfaceVariantColor,
      );

  /// El tema nocturno del intermunicipal.
  factory DriverCardPalette.intercity() => DriverCardPalette(
        surface: AppColors.intercitySurface,
        outline: AppColors.primary.withValues(alpha: 0.3),
        textPrimary: Colors.white,
        textSecondary: AppColors.intercityTextDim,
        textDim: AppColors.intercityTextDim,
        accent: AppColors.primary,
        avatarBg: AppColors.primary.withValues(alpha: 0.15),
        thumbBg: AppColors.primary.withValues(alpha: 0.10),
      );

  final Color surface;
  final Color outline;
  final Color textPrimary;
  final Color textSecondary;
  final Color textDim;
  final Color accent;
  final Color avatarBg;
  final Color thumbBg;
}

/// La ficha de quien viene a recogerte: foto, calificación, verificación y el
/// vehículo con su placa.
///
/// Vive en `shared/` y no dentro de una pantalla porque la misma pregunta
/// —"¿quién viene y en qué carro?"— aparece en viajes, envíos, mandados,
/// pedidos e intermunicipal. Con una copia por pantalla, cinco pantallas
/// terminan contestándola de cinco maneras distintas.
///
/// **Nada se inventa cuando el dato falta**: sin foto van las iniciales, sin
/// calificación no hay estrella, sin verificación no hay sello. La tarjeta se
/// degrada; no rellena huecos con valores por defecto que serían mentira.
class DriverInfoCard extends StatelessWidget {
  const DriverInfoCard({
    super.key,
    this.name,
    this.photoUrl,
    this.rating,
    this.since,
    this.verified = false,
    this.vehicleDescription,
    this.plate,
    this.vehiclePhotoUrl,
    this.vehicleType,
    this.fallbackGlyph = VehicleGlyphKind.car,
    this.esEntrega = false,
    this.subtitle,
    this.actions = const [],
    this.palette,
  });

  /// Colores propios cuando la pantalla no sigue el tema de la app. El
  /// intermunicipal tiene su tema nocturno hecho a mano: en vez de arrancarlo
  /// —es una decisión de marca, no un descuido— la tarjeta aprende a vestirse
  /// de oscuro y el resto de la pantalla se queda como está.
  final DriverCardPalette? palette;

  final String? name;
  final String? photoUrl;
  final double? rating;
  final DateTime? since;
  final bool verified;

  /// "Blanco Toyota Corolla" ya compuesto por quien llama.
  final String? vehicleDescription;
  final String? plate;
  final String? vehiclePhotoUrl;

  /// Tipo del backend (PARTICULAR|TAXI|MOTO|TURBO|CAMION|MULA) para el dibujo
  /// cuando no hay foto del vehículo.
  final String? vehicleType;
  final VehicleGlyphKind fallbackGlyph;

  /// El servicio es un pedido o un mandado. Hace que una moto se dibuje como
  /// moto de reparto (la del cajón), que es lo que la persona espera ver.
  final bool esEntrega;

  /// Texto libre bajo el nombre cuando no hay verificación ni antigüedad
  /// (p. ej. "Repartidor asignado").
  final String? subtitle;

  /// Botones a la derecha del nombre: chat, contacto seguro, llamar…
  final List<Widget> actions;

  bool get _hasVehicle => plate != null || vehicleDescription != null;

  @override
  Widget build(BuildContext context) {
    final p = palette ?? DriverCardPalette.deTema(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: p.outline),
        boxShadow: const [BoxShadow(color: AppColors.shadow, blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              DriverAvatar(
                photoUrl: photoUrl, name: name, rating: rating, palette: p,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name ?? 'Conductor',
                      style: TextStyle(
                        color: p.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    if (verified)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.verified_user_rounded,
                              size: 13, color: p.accent),
                          const SizedBox(width: 4),
                          Text(
                            'Identidad verificada',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: p.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    if (since != null)
                      Text(
                        'Conductor desde ${since!.year}',
                        style: TextStyle(fontSize: 11.5, color: p.textDim),
                      ),
                    if (!verified && since == null && subtitle != null)
                      Text(
                        subtitle!,
                        style: TextStyle(fontSize: 12, color: p.textSecondary),
                      ),
                  ],
                ),
              ),
              ...actions,
            ],
          ),
          if (_hasVehicle) ...[
            const SizedBox(height: 14),
            Divider(height: 1, color: p.outline),
            const SizedBox(height: 14),
            VehicleRow(
              description: vehicleDescription,
              plate: plate,
              photoUrl: vehiclePhotoUrl,
              vehicleType: vehicleType,
              fallbackGlyph: fallbackGlyph,
              esEntrega: esEntrega,
              palette: p,
            ),
          ],
        ],
      ),
    );
  }
}

/// Foto del conductor con su calificación en una insignia sobre la esquina.
///
/// Sin foto no se pone un muñeco genérico: se ponen sus iniciales, que al menos
/// son suyas. La estrella solo aparece si hay calificación — un "5.0" por
/// defecto en alguien recién llegado sería mentira.
class DriverAvatar extends StatelessWidget {
  const DriverAvatar({
    super.key, this.photoUrl, this.name, this.rating, this.palette,
  });

  final String? photoUrl;
  final String? name;
  final double? rating;
  final DriverCardPalette? palette;

  String get _iniciales {
    final partes = (name ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes.first.substring(0, 1) + partes[1].substring(0, 1))
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final p = palette ?? DriverCardPalette.deTema(context);
    final url = photoUrl == null ? null : ApiConfig.resolveUrl(photoUrl!);
    return SizedBox(
      width: 56,
      height: 60,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: p.avatarBg,
              shape: BoxShape.circle,
              image: url != null
                  ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover)
                  : null,
            ),
            alignment: Alignment.center,
            child: url != null
                ? null
                : Text(
                    _iniciales,
                    style: TextStyle(
                      color: p.accent,
                      fontWeight: FontWeight.w800,
                      fontSize: 19,
                    ),
                  ),
          ),
          if (rating != null)
            Positioned(
              left: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: const [
                    BoxShadow(color: AppColors.shadow, blurRadius: 4),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star_rounded,
                        size: 12, color: AppColors.starText),
                    const SizedBox(width: 2),
                    Text(
                      rating!.toStringAsFixed(1),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// El vehículo: su foto, "Blanco Toyota Corolla" y la placa en un recuadro
/// aparte, grande y con las letras separadas.
///
/// La placa se lee de lejos y bajo presión —el carro ya está parado delante—,
/// así que no puede ir dentro de un renglón de texto en gris.
class VehicleRow extends StatelessWidget {
  const VehicleRow({
    super.key,
    this.description,
    this.plate,
    this.photoUrl,
    this.vehicleType,
    this.fallbackGlyph = VehicleGlyphKind.car,
    this.esEntrega = false,
    this.palette,
  });

  final DriverCardPalette? palette;
  final String? description;
  final String? plate;
  final String? photoUrl;
  final String? vehicleType;
  final VehicleGlyphKind fallbackGlyph;

  /// El servicio es un pedido o un mandado. Hace que una moto se dibuje como
  /// moto de reparto (la del cajón), que es lo que la persona espera ver.
  final bool esEntrega;

  @override
  Widget build(BuildContext context) {
    final p = palette ?? DriverCardPalette.deTema(context);
    return Row(
      children: [
        Container(
          width: 76,
          height: 52,
          decoration: BoxDecoration(
            color: p.thumbBg,
            borderRadius: BorderRadius.circular(10),
          ),
          clipBehavior: Clip.antiAlias,
          child: photoUrl != null
              ? Image.network(
                  ApiConfig.resolveUrl(photoUrl!),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _dibujo(p),
                )
              : _dibujo(p),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (description != null)
                Text(
                  description!,
                  style: TextStyle(
                    color: p.textPrimary,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              if (plate != null) ...[
                const SizedBox(height: 6),
                PlateBox(plate: plate!, color: p.textPrimary),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _dibujo(DriverCardPalette p) => Center(
        child: Icon(
          vehicleGlyphIcon(
            vehicleGlyphKindFor(vehicleType,
                fallback: fallbackGlyph, entrega: esEntrega),
          ),
          size: 26,
          color: p.textDim,
        ),
      );
}

/// La placa en su recuadro, como en la vida real.
class PlateBox extends StatelessWidget {
  const PlateBox({required this.plate, this.color, super.key});

  final String plate;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? context.textPrimaryColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c, width: 1.6),
      ),
      child: Text(
        plate.toUpperCase(),
        style: TextStyle(
          color: c,
          fontSize: 17,
          fontWeight: FontWeight.w800,
          letterSpacing: 2.5,
        ),
      ),
    );
  }
}
