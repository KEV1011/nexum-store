import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'favorites_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';

/// Tarjeta de negocio con área de imagen y detalles.
class BusinessCard extends StatelessWidget {
  const BusinessCard({
    required this.business,
    required this.onTap,
    super.key,
  });

  final BusinessEntity business;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: isDark ? AppColors.cardDark : AppColors.surfaceLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
            border: Border.all(
              color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
            ),
            boxShadow: isDark
                ? null
                : const [
                    BoxShadow(
                      color: AppColors.shadow,
                      blurRadius: 8,
                      offset: Offset(0, 2),
                    ),
                  ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Illustration area ───────────────────────────────────────
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppConstants.radiusLarge),
                ),
                child: Stack(
                  children: [
                    _CoverHeader(business: business),
                    if (!business.isOpen)
                      Container(
                        height: 108,
                        color: Colors.black.withValues(alpha: 0.48),
                        alignment: Alignment.center,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'Cerrado',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: _FavoriteButton(businessId: business.id),
                    ),
                    if (business.isOpen)
                      Positioned(
                        bottom: 8,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.45),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.circle,
                                size: 7,
                                color: AppColors.success,
                              ),
                              const SizedBox(width: 4),
                              const Text(
                                'Abierto',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // ── Details area ────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM,
                  AppConstants.spacingS,
                  AppConstants.spacingM,
                  AppConstants.spacingM,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            business.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        const Icon(
                          Icons.star_rounded,
                          color: AppColors.star,
                          size: 15,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          business.rating.toStringAsFixed(1),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _MetaChip(
                          icon: Icons.schedule_rounded,
                          label: '${business.etaMinutes} min',
                        ),
                        const SizedBox(width: AppConstants.spacingM),
                        _MetaChip(
                          icon: Icons.pedal_bike_rounded,
                          label:
                              business.deliveryFee == 0
                                  ? 'Gratis'
                                  : CurrencyFormatter.format(
                                      business.deliveryFee,
                                    ),
                          highlight: business.deliveryFee == 0,
                        ),
                        const SizedBox(width: AppConstants.spacingM),
                        _MetaChip(
                          icon: Icons.storefront_outlined,
                          label: business.category.label,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FavoriteButton extends ConsumerWidget {
  const _FavoriteButton({required this.businessId});

  final String businessId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isFav = ref.watch(favoritesProvider).contains(businessId);
    return GestureDetector(
      onTap: () => ref.read(favoritesProvider.notifier).toggle(businessId),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.9),
          shape: BoxShape.circle,
          boxShadow: const [
            BoxShadow(
              color: AppColors.shadow,
              blurRadius: 6,
            ),
          ],
        ),
        child: Icon(
          isFav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          color: isFav ? AppColors.error : AppColors.textTertiary,
          size: 17,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    required this.label,
    this.highlight = false,
  });

  final IconData icon;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final color = highlight ? AppColors.success : AppColors.textSecondary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 3),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
            color: color,
          ),
        ),
      ],
    );
  }
}

/// Portada de la tarjeta: foto del local si existe; si no (o si falla la carga),
/// gradiente + ícono de la categoría.
class _CoverHeader extends StatelessWidget {
  const _CoverHeader({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    final gradient = Container(
      height: 108,
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            business.category.color.withValues(alpha: 0.7),
            business.category.color,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -12,
            bottom: -12,
            child: Icon(
              business.category.icon,
              size: 90,
              color: Colors.white.withValues(alpha: 0.15),
            ),
          ),
          Center(
            child: Icon(
              business.category.icon,
              size: 44,
              color: Colors.white.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );

    final url = business.imageUrl;
    if (url == null || url.isEmpty) return gradient;

    return Image.network(
      ApiConfig.resolveUrl(url),
      height: 108,
      width: double.infinity,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => gradient,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : gradient,
    );
  }
}
