import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Estado vacío reutilizable: icono, título, mensaje y una acción opcional que
/// invita a actuar.
///
/// Va centrado. Si lo usas dentro de un `CustomScrollView`, envuélvelo en un
/// `SliverFillRemaining(hasScrollBody: false, child: EmptyState(...))`.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    super.key,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  /// Icono representativo del contenido ausente.
  final IconData icon;

  /// Título corto y claro (p. ej. "Aún no tienes pedidos").
  final String title;

  /// Mensaje opcional que invita a actuar.
  final String? message;

  /// Texto del botón de acción (requiere [onAction]).
  final String? actionLabel;

  /// Acción opcional, típicamente para llevar al usuario a empezar.
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingXL,
          vertical: AppConstants.spacingL,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64, color: context.textTertiaryColor),
            const SizedBox(height: AppConstants.spacingM),
            Text(
              title,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: AppConstants.spacingXS),
              Text(
                message!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: context.textSecondaryColor,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppConstants.spacingL),
              OutlinedButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
