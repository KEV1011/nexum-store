import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';

/// Privacidad y manejo de datos del conductor (Ley 1581 de 2012 — Colombia).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacidad de datos'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => safeBack(context),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: const [
          _Intro(),
          SizedBox(height: AppConstants.spacingM),
          _Section(
            icon: Icons.location_on_rounded,
            title: 'Ubicación',
            body: 'Tu ubicación se usa para asignarte servicios cerca y para '
                'mostrar tu avance al pasajero durante un viaje. Al desconectarte '
                'dejamos de rastrearla.',
          ),
          _Section(
            icon: Icons.badge_rounded,
            title: 'Documentos e identidad',
            body: 'Cédula, licencia, SOAT y selfie se usan para verificar que '
                'puedes operar de forma legal y segura. Se guardan de forma '
                'restringida y no se comparten con fines publicitarios.',
          ),
          _Section(
            icon: Icons.phone_rounded,
            title: 'Tu número',
            body: 'Tu número real no se muestra al pasajero: la comunicación es '
                'por el chat de la app. Así proteges tu privacidad.',
          ),
          _Section(
            icon: Icons.account_balance_wallet_rounded,
            title: 'Ganancias y pagos',
            body: 'Registramos tus viajes y liquidaciones para calcular tus '
                'ganancias. Los datos bancarios se usan solo para pagarte.',
          ),
          _Section(
            icon: Icons.delete_outline_rounded,
            title: 'Tus derechos',
            body: 'Puedes acceder, actualizar o eliminar tus datos escribiendo a '
                'soporte. Atenderemos tu solicitud conforme a la Ley 1581 de 2012.',
          ),
          SizedBox(height: AppConstants.spacingM),
          _Footer(),
        ],
      ),
    );
  }
}

class _Intro extends StatelessWidget {
  const _Intro();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          const Icon(Icons.shield_rounded, color: AppColors.primary),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'Cuidamos tus datos y solo los usamos para que puedas trabajar '
              'con Nexum de forma segura.',
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingM),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppColors.primary),
              const SizedBox(width: AppConstants.spacingS),
              Text(
                title,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            body,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              height: 1.4,
              color: context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Text(
      'Nexum · Tratamiento de datos conforme a la Ley 1581 de 2012 (Colombia).',
      textAlign: TextAlign.center,
      style: TextStyle(
        fontFamily: 'Inter',
        fontSize: 11,
        color: context.textTertiaryColor,
      ),
    );
  }
}
