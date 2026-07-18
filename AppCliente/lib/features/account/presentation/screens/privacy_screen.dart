import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/safe_back.dart';

/// Privacidad y manejo de datos. Explica de forma clara qué datos usa ZIPA y
/// para qué (Ley 1581 de 2012 de protección de datos personales — Colombia).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Privacidad y datos'),
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
            body: 'Usamos tu ubicación para mostrarte servicios cerca, calcular '
                'tarifas y compartir tu punto de recogida con el conductor '
                'durante el servicio. No la compartimos con terceros con fines '
                'publicitarios.',
          ),
          _Section(
            icon: Icons.person_rounded,
            title: 'Datos de tu cuenta',
            body: 'Nombre, teléfono y correo se usan para crear tu cuenta, '
                'contactarte por un servicio y darte soporte. Tu número real no '
                'se muestra al conductor: la comunicación es por el chat de la app.',
          ),
          _Section(
            icon: Icons.credit_card_rounded,
            title: 'Pagos',
            body: 'Los pagos en línea los procesa Wompi (Bancolombia), vigilado '
                'por la Superintendencia Financiera. ZIPA NO almacena los datos '
                'de tu tarjeta.',
          ),
          _Section(
            icon: Icons.photo_camera_rounded,
            title: 'Verificación',
            body: 'Si decides verificar tu identidad, la selfie y el documento '
                'se usan solo para confirmar que eres tú y dar seguridad a la '
                'comunidad. Se guardan de forma restringida.',
          ),
          _Section(
            icon: Icons.delete_outline_rounded,
            title: 'Tus derechos',
            body: 'Puedes solicitar acceder, actualizar o eliminar tus datos '
                'escribiendo a soporte desde «Ayuda y soporte». Atenderemos tu '
                'solicitud conforme a la Ley 1581 de 2012.',
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
        color: AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          const Icon(Icons.shield_rounded, color: AppColors.primaryDim),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'Cuidamos tus datos y solo los usamos para prestarte el servicio. '
              'Aquí te contamos qué recogemos y para qué.',
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryDim,
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
      'ZIPA · Tratamiento de datos conforme a la Ley 1581 de 2012 (Colombia).',
      textAlign: TextAlign.center,
      style: TextStyle(
        fontFamily: 'Inter',
        fontSize: 11,
        color: context.textTertiaryColor,
      ),
    );
  }
}
