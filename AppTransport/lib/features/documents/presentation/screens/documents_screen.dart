import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';

// ── Models ────────────────────────────────────────────────────────────────────

enum _DocStatus { vigente, porVencer, vencido, pendiente }

extension _DocStatusX on _DocStatus {
  String get label => switch (this) {
        _DocStatus.vigente => 'Vigente',
        _DocStatus.porVencer => 'Por vencer',
        _DocStatus.vencido => 'Vencido',
        _DocStatus.pendiente => 'Pendiente',
      };

  Color get color => switch (this) {
        _DocStatus.vigente => AppColors.success,
        _DocStatus.porVencer => AppColors.warning,
        _DocStatus.vencido => AppColors.error,
        _DocStatus.pendiente => AppColors.textSecondary,
      };

  Color get bgColor => switch (this) {
        _DocStatus.vigente => AppColors.successContainer,
        _DocStatus.porVencer => AppColors.warningContainer,
        _DocStatus.vencido => AppColors.errorContainer,
        _DocStatus.pendiente => AppColors.surfaceVariantLight,
      };

  IconData get statusIcon => switch (this) {
        _DocStatus.vigente => Icons.check_circle_rounded,
        _DocStatus.porVencer => Icons.warning_rounded,
        _DocStatus.vencido => Icons.cancel_rounded,
        _DocStatus.pendiente => Icons.upload_file_rounded,
      };
}

class _Doc {
  _Doc({
    required this.name,
    required this.icon,
    required this.status,
    this.expiry,
    this.subtitle,
  });

  final String name;
  final IconData icon;
  _DocStatus status;
  final String? expiry;
  final String? subtitle;
}

// ── Screen ────────────────────────────────────────────────────────────────────

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  late final List<_Doc> _docs;

  @override
  void initState() {
    super.initState();
    _docs = [
      _Doc(
        name: 'Licencia de conducción',
        icon: Icons.badge_rounded,
        status: _DocStatus.vigente,
        expiry: '15 ago 2026',
        subtitle: 'Categoría A2 · CC 1.094.847.221',
      ),
      _Doc(
        name: 'SOAT',
        icon: Icons.shield_rounded,
        status: _DocStatus.porVencer,
        expiry: '30 nov 2025',
        subtitle: 'Chevrolet Spark GT · KGB-742',
      ),
      _Doc(
        name: 'Revisión técnico-mecánica',
        icon: Icons.build_circle_rounded,
        status: _DocStatus.vencido,
        expiry: '01 dic 2024',
        subtitle: 'Requiere renovación urgente',
      ),
      _Doc(
        name: 'Antecedentes penales',
        icon: Icons.policy_rounded,
        status: _DocStatus.vigente,
        expiry: '01 jun 2026',
        subtitle: 'Certificado judicial vigente',
      ),
      _Doc(
        name: 'Foto del vehículo',
        icon: Icons.directions_car_rounded,
        status: _DocStatus.vigente,
        subtitle: 'Vista frontal actualizada',
      ),
    ];
  }

  void _simulateUpload(int index) {
    HapticFeedback.mediumImpact();
    setState(() => _docs[index].status = _DocStatus.vigente);
    AppSnackbar.showSuccess(
      context,
      '${_docs[index].name} actualizado correctamente.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final validCount = _docs
        .where((d) => d.status == _DocStatus.vigente)
        .length;
    final total = _docs.length;
    final hasIssues = _docs.any(
      (d) =>
          d.status == _DocStatus.vencido ||
          d.status == _DocStatus.porVencer,
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Mis documentos')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // ── Summary banner ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            decoration: BoxDecoration(
              color: hasIssues
                  ? AppColors.warningContainer
                  : AppColors.successContainer,
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: Row(
              children: [
                Icon(
                  hasIssues
                      ? Icons.info_rounded
                      : Icons.check_circle_rounded,
                  color: hasIssues
                      ? AppColors.warning
                      : AppColors.success,
                  size: 20,
                ),
                const SizedBox(width: AppConstants.spacingS),
                Expanded(
                  child: Text(
                    hasIssues
                        ? '$validCount de $total documentos en regla. '
                            'Actualiza los vencidos para seguir activo.'
                        : 'Todos tus documentos están en regla.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: hasIssues
                          ? AppColors.warning
                          : AppColors.success,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // ── Document cards ─────────────────────────────────────────────
          ...List.generate(_docs.length, (i) {
            final doc = _docs[i];
            return Padding(
              padding: const EdgeInsets.only(
                bottom: AppConstants.spacingM,
              ),
              child: _DocCard(
                doc: doc,
                onUpload: doc.status != _DocStatus.vigente
                    ? () => _simulateUpload(i)
                    : null,
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _DocCard extends StatelessWidget {
  const _DocCard({required this.doc, this.onUpload});

  final _Doc doc;
  final VoidCallback? onUpload;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final needsUrgent = doc.status == _DocStatus.vencido;

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius:
            BorderRadius.circular(AppConstants.radiusMedium),
        side: BorderSide(
          color: needsUrgent
              ? AppColors.error.withValues(alpha: 0.35)
              : AppColors.outlineLight,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: doc.status.bgColor,
                    borderRadius: BorderRadius.circular(
                      AppConstants.radiusSmall,
                    ),
                  ),
                  child: Icon(
                    doc.icon,
                    color: doc.status.color,
                    size: 20,
                  ),
                ),
                const SizedBox(width: AppConstants.spacingM),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        doc.name,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (doc.subtitle != null)
                        Text(
                          doc.subtitle!,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppConstants.spacingS),
                // Status chip
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: doc.status.bgColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        doc.status.statusIcon,
                        size: 12,
                        color: doc.status.color,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        doc.status.label,
                        style: TextStyle(
                          color: doc.status.color,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            // Expiry row
            if (doc.expiry != null) ...[
              const SizedBox(height: AppConstants.spacingS),
              Row(
                children: [
                  const Icon(
                    Icons.calendar_today_rounded,
                    size: 12,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Vence: ${doc.expiry}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],

            // Upload / renew button
            if (onUpload != null) ...[
              const SizedBox(height: AppConstants.spacingM),
              ElevatedButton.icon(
                onPressed: onUpload,
                icon: const Icon(Icons.upload_rounded, size: 16),
                label: Text(
                  needsUrgent
                      ? 'Renovar documento'
                      : 'Subir documento',
                ),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size.fromHeight(
                    AppConstants.minTouchTarget,
                  ),
                  backgroundColor: needsUrgent
                      ? AppColors.error
                      : AppColors.warning,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
