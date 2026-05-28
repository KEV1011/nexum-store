import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

class SafetyScreen extends StatelessWidget {
  const SafetyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Centro de seguridad')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          // SOS card
          Container(
            decoration: BoxDecoration(
              color: AppColors.error,
              borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
            ),
            padding: const EdgeInsets.all(AppConstants.spacingL),
            child: Column(
              children: [
                const Icon(Icons.sos_rounded, color: Colors.white, size: 56),
                const SizedBox(height: AppConstants.spacingM),
                Text(
                  'Botón de emergencia',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppConstants.spacingS),
                Text(
                  'Presiona si estás en peligro. Alertará a Nexum y a tus contactos de emergencia.',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: Colors.white70),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppConstants.spacingL),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _confirmSos(context),
                    icon: const Icon(Icons.warning_amber_rounded),
                    label: const Text('ACTIVAR SOS'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppColors.error,
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        letterSpacing: 1,
                      ),
                      minimumSize: const Size.fromHeight(52),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Emergency contacts
          Text(
            'Contactos de emergencia',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          _ContactTile(
            name: 'María García',
            relation: 'Familiar',
            phone: '+57 315 123 4567',
            onTap: () {},
          ),
          const SizedBox(height: AppConstants.spacingS),
          OutlinedButton.icon(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Próximamente disponible')),
            ),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Agregar contacto'),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Safety tips
          Text(
            'Consejos de seguridad',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._safetyTips.map(
            (tip) => _SafetyTip(icon: tip.$1, title: tip.$2, body: tip.$3),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // Trusted number
          Card(
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.infoContainer,
                      borderRadius:
                          BorderRadius.circular(AppConstants.radiusMedium),
                    ),
                    child: const Icon(Icons.local_police_rounded,
                        color: AppColors.info, size: 24),
                  ),
                  const SizedBox(width: AppConstants.spacingM),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Línea de emergencias',
                          style: theme.textTheme.bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        const Text(
                          '123 (Policía) · 125 (Bomberos)',
                          style: TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 13,
                          ),
                        ),
                      ],
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

  void _confirmSos(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar SOS'),
        content: const Text(
          '¿Confirmas que necesitas ayuda de emergencia? Se notificará a Nexum y a tus contactos.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('🚨 SOS activado. Ayuda en camino.'),
                  backgroundColor: AppColors.error,
                ),
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('Confirmar SOS'),
          ),
        ],
      ),
    );
  }
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({
    required this.name,
    required this.relation,
    required this.phone,
    required this.onTap,
  });

  final String name;
  final String relation;
  final String phone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.errorContainer,
            child: Text(
              name[0],
              style: const TextStyle(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  '$relation · $phone',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onTap,
            icon: const Icon(Icons.phone_rounded, color: AppColors.primary),
          ),
        ],
      ),
    );
  }
}

class _SafetyTip extends StatelessWidget {
  const _SafetyTip({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.warningContainer,
              borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
            ),
            child: Icon(icon, size: 16, color: AppColors.warning),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  body,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

const _safetyTips = [
  (
    Icons.verified_user_rounded,
    'Verifica al pasajero',
    'Confirma nombre y foto antes de iniciar el viaje.',
  ),
  (
    Icons.share_location_rounded,
    'Comparte tu ruta',
    'Activa la función de compartir ubicación con familiares.',
  ),
  (
    Icons.do_not_disturb_rounded,
    'No aceptes desvíos sospechosos',
    'Sigue siempre la ruta indicada en la app.',
  ),
  (
    Icons.brightness_1,
    'Confía en tu instinto',
    'Si algo no te parece bien, cancela el viaje con seguridad.',
  ),
];
