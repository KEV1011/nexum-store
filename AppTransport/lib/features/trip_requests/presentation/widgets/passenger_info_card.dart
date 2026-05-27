import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';

/// Tarjeta que muestra la información básica del pasajero.
///
/// Layout horizontal:
///   [Avatar circular] → [Nombre en negrita] [★ rating] [X viajes]
///
/// El avatar carga la imagen desde [PassengerEntity.photoUrl] con un
/// fallback de ícono de persona cuando la URL falla o no carga.
class PassengerInfoCard extends StatelessWidget {
  const PassengerInfoCard({
    super.key,
    required this.passenger,
  });

  final PassengerEntity passenger;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // ── Avatar ────────────────────────────────────────────────────────
        _PassengerAvatar(photoUrl: passenger.photoUrl, name: passenger.name),

        const SizedBox(width: 14),

        // ── Info ──────────────────────────────────────────────────────────
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Nombre
              Text(
                passenger.name,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: AppColors.textPrimary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),

              const SizedBox(height: 4),

              // Rating + viajes
              Row(
                children: [
                  _StarRating(rating: passenger.rating),
                  const SizedBox(width: 4),
                  Text(
                    passenger.rating.toStringAsFixed(1),
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Icon(
                    Icons.directions_car_rounded,
                    size: 14,
                    color: AppColors.textSecondary,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    '${passenger.totalTrips} viajes',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── _PassengerAvatar ──────────────────────────────────────────────────────────

class _PassengerAvatar extends StatelessWidget {
  const _PassengerAvatar({
    required this.photoUrl,
    required this.name,
  });

  final String photoUrl;
  final String name;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: 32,
      backgroundColor: AppColors.divider,
      child: ClipOval(
        child: Image.network(
          photoUrl,
          width: 64,
          height: 64,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) {
            return Container(
              width: 64,
              height: 64,
              color: AppColors.secondaryLight,
              child: Center(
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 24,
                  ),
                ),
              ),
            );
          },
          loadingBuilder: (context, child, loadingProgress) {
            if (loadingProgress == null) return child;
            return Container(
              width: 64,
              height: 64,
              color: AppColors.divider,
              child: const Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor:
                        AlwaysStoppedAnimation<Color>(AppColors.primary),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ── _StarRating ───────────────────────────────────────────────────────────────

class _StarRating extends StatelessWidget {
  const _StarRating({required this.rating});

  final double rating;

  @override
  Widget build(BuildContext context) {
    const total = 5;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(total, (index) {
        final filled = index < rating.floor();
        final halfFilled = !filled && (index < rating);
        return Icon(
          filled
              ? Icons.star_rounded
              : halfFilled
                  ? Icons.star_half_rounded
                  : Icons.star_outline_rounded,
          size: 14,
          color: AppColors.star,
        );
      }),
    );
  }
}
