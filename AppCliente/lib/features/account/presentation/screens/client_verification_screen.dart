import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/account/presentation/providers/client_kyc_provider.dart';

/// Verificación de identidad del pasajero (anti-robo): selfie + envío.
class ClientVerificationScreen extends ConsumerStatefulWidget {
  const ClientVerificationScreen({super.key});

  @override
  ConsumerState<ClientVerificationScreen> createState() => _ClientVerificationScreenState();
}

class _ClientVerificationScreenState extends ConsumerState<ClientVerificationScreen> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(clientKycProvider.notifier).load());
  }

  Future<void> _takeSelfie() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    String? err;
    try {
      err = await ref.read(clientKycProvider.notifier).uploadSelfie(await picked.readAsBytes(), picked.name);
    } catch (_) {
      err = 'No se pudo subir la selfie.';
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) {
      AppSnackbar.showError(context, err);
    } else {
      AppSnackbar.showSuccess(context, 'Selfie subida. Ahora envía tu verificación.');
    }
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final err = await ref.read(clientKycProvider.notifier).submit();
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) {
      AppSnackbar.showError(context, err);
    } else {
      AppSnackbar.showSuccess(context, 'Verificación enviada. Queda en revisión.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final kyc = ref.watch(clientKycProvider);
    final verified = kyc.status == 'VERIFIED';
    final inReview = kyc.status == 'IN_REVIEW';

    final ({Color color, IconData icon, String label, String detail}) s = switch (kyc.status) {
      'VERIFIED' => (
          color: AppColors.success,
          icon: Icons.verified_user_rounded,
          label: 'Identidad verificada',
          detail: 'Los conductores ven que eres un pasajero verificado.',
        ),
      'IN_REVIEW' => (
          color: AppColors.warning,
          icon: Icons.hourglass_top_rounded,
          label: 'En revisión',
          detail: 'Estamos validando tu identidad. Te avisaremos.',
        ),
      'REJECTED' => (
          color: AppColors.error,
          icon: Icons.gpp_bad_rounded,
          label: 'Verificación rechazada',
          detail: 'No pudimos confirmar tu identidad. Toma una nueva selfie y reenvía.',
        ),
      _ => (
          color: AppColors.warning,
          icon: Icons.badge_outlined,
          label: 'Sin verificar',
          detail: 'Verifícate para dar confianza al conductor y viajar más seguro.',
        ),
    };

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Verificación de identidad'),
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [s.color, s.color.withValues(alpha: 0.78)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Icon(s.icon, color: Colors.white, size: 30),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.label,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(s.detail,
                          style: const TextStyle(color: Colors.white, fontSize: 12.5)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (!verified) ...[
            Row(
              children: [
                Icon(kyc.hasSelfie ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                    size: 18,
                    color: kyc.hasSelfie ? AppColors.success : context.textSecondaryColor),
                const SizedBox(width: 8),
                Text(kyc.hasSelfie ? 'Selfie subida' : 'Falta la selfie',
                    style: TextStyle(fontSize: 13.5, color: context.textSecondaryColor)),
              ],
            ),
            const SizedBox(height: 16),
            if (_busy)
              const Center(child: CircularProgressIndicator(color: AppColors.primary))
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _takeSelfie,
                      icon: const Icon(Icons.camera_alt_outlined, size: 18),
                      label: Text(kyc.hasSelfie ? 'Repetir selfie' : 'Tomar selfie'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: (kyc.canSubmit && !inReview) ? _submit : null,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(kyc.status == 'REJECTED' ? 'Reenviar' : 'Enviar'),
                    ),
                  ),
                ],
              ),
          ],
        ],
      ),
    );
  }
}
