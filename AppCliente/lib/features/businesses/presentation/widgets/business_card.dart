import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';

/// Tarjeta de un negocio en la lista principal.
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
      color: isDark ? AppColors.cardDark : AppColors.cardLight,
      borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
            border: Border.all(
              color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: business.category.containerColor,
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusMedium),
                ),
                child: Icon(
                  business.category.icon,
                  color: business.category.color,
                  size: 28,
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            business.name,
                            style: const TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: AppConstants.spacingS),
                        const Icon(
                          Icons.star_rounded,
                          color: AppColors.star,
                          size: 16,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          business.rating.toStringAsFixed(1),
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      business.category.label,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingS),
                    Row(
                      children: [
                        _MetaChip(
                          icon: Icons.schedule_rounded,
                          label: '${business.etaMinutes} min',
                        ),
                        const SizedBox(width: AppConstants.spacingS),
                        _MetaChip(
                          icon: Icons.pedal_bike_rounded,
                          label:
                              CurrencyFormatter.format(business.deliveryFee),
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

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.textSecondary,
          ),
        ),
      ],
    );
  }
}
