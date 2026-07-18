import 'package:flutter/material.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

/// Pantalla de bienvenida mientras se inicializa la app.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  // Esmeralda hondo — igual que el splash nativo para una transición sin costura.
  static const _zipaGreen = Color(0xFF0A7D57);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _zipaGreen,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Marca ZIPA (Zip-Pin blanco con la Z calada).
            Image.asset(
              'assets/icons/splash_logo.png',
              width: 168,
              height: 200,
              fit: BoxFit.contain,
            ),
            const SizedBox(height: AppConstants.spacingS),
            Text(
              'Tu ciudad, en un zip',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.85),
              ),
            ),
            const SizedBox(height: AppConstants.spacingXXL),
            const SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation(Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
