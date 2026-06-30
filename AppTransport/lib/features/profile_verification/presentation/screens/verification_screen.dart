import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/features/profile_verification/domain/entities/driver_profile_entity.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';

class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(driverProfileProvider.notifier).load(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverProfileProvider);
    final notifier = ref.read(driverProfileProvider.notifier);
    final profile = state.profile;

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Verificación de cuenta'),
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
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
                      const Text(
                        'Sube cada documento legible y vigente. Solo podrás recibir '
                        'viajes cuando todos estén aprobados.',
                        style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
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
                    ],
                  ),
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
        color: AppColors.cardLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.outlineLight),
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
