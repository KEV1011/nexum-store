import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_client/shared/widgets/zipa_logo.dart';

/// Entrada desde el enlace que llegó por WhatsApp.
///
/// El pasajero toca el enlace del chat y cae aquí con un código de un solo uso
/// en la URL (detrás del `#`, así que no viaja al servidor que sirve la web).
/// Esta pantalla lo canjea por la sesión de siempre y sigue al inicio.
///
/// No pide nada: si pidiera confirmación, la mitad de la gente que llega desde
/// un chat se quedaría mirando un botón sin entender qué le están pidiendo.
class EntrarConEnlaceScreen extends ConsumerStatefulWidget {
  const EntrarConEnlaceScreen({required this.codigo, super.key});

  final String? codigo;

  @override
  ConsumerState<EntrarConEnlaceScreen> createState() => _EntrarConEnlaceScreenState();
}

class _EntrarConEnlaceScreenState extends ConsumerState<EntrarConEnlaceScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    // Después del primer frame: canjear durante el build dejaría el router
    // navegando desde dentro de la construcción de una pantalla.
    WidgetsBinding.instance.addPostFrameCallback((_) => _canjear());
  }

  Future<void> _canjear() async {
    final codigo = widget.codigo?.trim() ?? '';
    if (codigo.isEmpty) {
      setState(() => _error = 'El enlace está incompleto. Escríbenos otra vez por WhatsApp.');
      return;
    }

    final motivo = await ref.read(authProvider.notifier).entrarConEnlace(codigo);
    if (!mounted) return;

    if (motivo != null) {
      setState(() => _error = motivo);
      return;
    }
    context.go(AppRoutes.home);
  }

  @override
  Widget build(BuildContext context) {
    const verdeZipa = Color(0xFF0A7D57);

    return Scaffold(
      backgroundColor: verdeZipa,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingXL),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const ZipaLogo(size: 110),
              const SizedBox(height: AppConstants.spacingXL),
              if (_error == null) ...[
                Text(
                  'Entrando…',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
                const SizedBox(height: AppConstants.spacingL),
                const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    valueColor: AlwaysStoppedAnimation(Colors.white),
                  ),
                ),
              ] else ...[
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    height: 1.45,
                    color: Colors.white.withValues(alpha: 0.95),
                  ),
                ),
                const SizedBox(height: AppConstants.spacingXL),
                // Salida siempre disponible: con el enlace vencido, el camino
                // normal es entrar con el teléfono de toda la vida.
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: verdeZipa,
                    minimumSize: const Size.fromHeight(50),
                  ),
                  onPressed: () => context.go(AppRoutes.login),
                  child: const Text('Entrar con mi teléfono'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
