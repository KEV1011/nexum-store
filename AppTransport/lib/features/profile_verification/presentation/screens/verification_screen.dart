import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/features/profile_verification/domain/entities/driver_profile_entity.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_kyc_provider.dart';

class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  bool _uploading = false;
  bool _kycBusy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(driverProfileProvider.notifier).load();
      ref.read(driverKycProvider.notifier).load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverProfileProvider);
    final notifier = ref.read(driverProfileProvider.notifier);
    final profile = state.profile;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Verificación de cuenta'),
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
      ),
      body: state.isLoading && profile == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : profile == null
              ? Center(child: Text(state.error ?? 'No se pudo cargar el perfil.'))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () => notifier.load(),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      _StatusBanner(profile: profile),
                      const SizedBox(height: 20),
                      const Text(
                        'Documentos requeridos',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Sube cada documento legible y vigente. Solo podrás recibir '
                        'viajes cuando todos estén aprobados.',
                        style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                      ),
                      const SizedBox(height: 12),
                      if (_uploading)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 8),
                          child: LinearProgressIndicator(color: AppColors.primary),
                        ),
                      ...profile.documents.map(
                        (doc) => _DocumentCard(
                          doc: doc,
                          onUpload: _uploading ? null : () => _upload(doc),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const Text(
                        'Verificación de identidad',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Toma una selfie para confirmar que eres tú. Protege a los '
                        'pasajeros y a tu cuenta contra suplantación.',
                        style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                      ),
                      const SizedBox(height: 12),
                      _KycCard(
                        busy: _kycBusy,
                        onTakeSelfie: _kycBusy ? null : _takeSelfie,
                        onSubmit: _kycBusy ? null : _submitKyc,
                      ),
                    ],
                  ),
                ),
    );
  }

  Future<void> _takeSelfie() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _kycBusy = true);
    String? err;
    try {
      final bytes = await picked.readAsBytes();
      err = await ref.read(driverKycProvider.notifier).uploadSelfie(bytes, picked.name);
    } catch (_) {
      err = 'No se pudo subir la selfie.';
    }
    if (!mounted) return;
    setState(() => _kycBusy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Selfie subida. Ahora envía tu verificación.'),
        backgroundColor: err == null ? AppColors.primary : null,
      ),
    );
  }

  Future<void> _submitKyc() async {
    setState(() => _kycBusy = true);
    final err = await ref.read(driverKycProvider.notifier).submit();
    if (!mounted) return;
    setState(() => _kycBusy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Verificación enviada. Queda en revisión.'),
        backgroundColor: err == null ? AppColors.primary : null,
      ),
    );
  }

  Future<void> _upload(DriverDocument doc) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked == null || !mounted) return;

    setState(() => _uploading = true);
    final notifier = ref.read(driverProfileProvider.notifier);

    bool ok;
    try {
      // XFile.readAsBytes funciona en móvil y web; en web `picked.path` es una
      // URL blob, no una ruta de archivo, por lo que hay que leer los bytes.
      final bytes = await picked.readAsBytes();
      ok = await notifier.uploadDocument(doc.type, bytes, picked.name);
    } catch (_) {
      ok = false;
    }

    if (!mounted) return;
    setState(() => _uploading = false);

    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${doc.label} enviado. Queda en revisión.'),
          backgroundColor: AppColors.primary,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo subir el documento.')),
      );
    }
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.profile});

  final DriverProfileEntity profile;

  @override
  Widget build(BuildContext context) {
    final verified = profile.isVerified;
    final color = verified ? AppColors.success : AppColors.warning;
    final progress = profile.requiredDocsCount == 0
        ? 0.0
        : profile.approvedDocsCount / profile.requiredDocsCount;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color, color.withValues(alpha: 0.78)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                verified ? Icons.verified_rounded : Icons.shield_outlined,
                color: Colors.white,
                size: 30,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  verified ? 'Cuenta verificada' : 'Verificación pendiente',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            verified
                ? 'Ya puedes recibir solicitudes de viaje.'
                : '${profile.approvedDocsCount} de ${profile.requiredDocsCount} documentos aprobados.',
            style: const TextStyle(color: Colors.white, fontSize: 13.5),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 7,
              backgroundColor: Colors.white24,
              valueColor: const AlwaysStoppedAnimation(Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _KycCard extends ConsumerWidget {
  const _KycCard({required this.busy, required this.onTakeSelfie, required this.onSubmit});

  final bool busy;
  final VoidCallback? onTakeSelfie;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kyc = ref.watch(driverKycProvider);
    final ({Color color, IconData icon, String label, String detail}) s = switch (kyc.status) {
      'VERIFIED' => (
          color: AppColors.success,
          icon: Icons.verified_user_rounded,
          label: 'Identidad verificada',
          detail: 'Tu identidad quedó confirmada.',
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
          label: 'Identidad sin verificar',
          detail: 'Toma una selfie y envía tu verificación.',
        ),
    };

    final verified = kyc.status == 'VERIFIED';
    final inReview = kyc.status == 'IN_REVIEW';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: s.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(s.icon, color: s.color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.label,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                    const SizedBox(height: 2),
                    Text(s.detail, style: TextStyle(fontSize: 12.5, color: s.color)),
                  ],
                ),
              ),
            ],
          ),
          if (!verified) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Icon(
                  kyc.hasSelfie ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                  size: 18,
                  color: kyc.hasSelfie ? AppColors.success : context.textSecondaryColor,
                ),
                const SizedBox(width: 8),
                Text(
                  kyc.hasSelfie ? 'Selfie subida' : 'Falta la selfie',
                  style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 4),
                child: LinearProgressIndicator(color: AppColors.primary),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onTakeSelfie,
                      icon: const Icon(Icons.camera_alt_outlined, size: 18),
                      label: Text(kyc.hasSelfie ? 'Repetir selfie' : 'Tomar selfie'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: (kyc.canSubmit && !inReview) ? onSubmit : null,
                      style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
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

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({required this.doc, required this.onUpload});

  final DriverDocument doc;
  final VoidCallback? onUpload;

  @override
  Widget build(BuildContext context) {
    final canUpload =
        doc.status == DocumentStatus.missing || doc.status == DocumentStatus.rejected;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: doc.status.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(doc.status.icon, color: doc.status.color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doc.label,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
                ),
                const SizedBox(height: 2),
                Text(
                  doc.status == DocumentStatus.rejected && doc.rejectionReason != null
                      ? doc.rejectionReason!
                      : doc.status.label,
                  style: TextStyle(fontSize: 12.5, color: doc.status.color),
                ),
              ],
            ),
          ),
          if (canUpload)
            TextButton(
              onPressed: onUpload,
              child: Text(
                doc.status == DocumentStatus.rejected ? 'Reenviar' : 'Subir',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            )
          else
            Icon(doc.status.icon, color: doc.status.color, size: 20),
        ],
      ),
    );
  }
}
