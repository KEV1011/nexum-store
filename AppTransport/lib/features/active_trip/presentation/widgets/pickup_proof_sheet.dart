import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';

// ── Model ─────────────────────────────────────────────────────────────────────

/// Proof of order pickup at the restaurant / local.
/// [photoPath] is required. For mandado mode [actualCost] captures what
/// the driver spent so the server can relay it to the client.
class PickupProof {
  const PickupProof({required this.photoPath, this.orderRef, this.actualCost});

  final String photoPath;
  final String? orderRef;
  final double? actualCost;
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

/// Bottom sheet shown when the driver is at the restaurant/local
/// and is about to pick up the order.
///
/// Requires a photo of the order (mandatory) and optionally an
/// order reference note. This creates an immutable audit trail
/// that protects both the restaurant and the driver.
class PickupProofSheet extends StatefulWidget {
  const PickupProofSheet({
    required this.businessName,
    required this.workMode,
    super.key,
  });

  final String businessName;
  final WorkMode workMode;

  static Future<PickupProof?> show(
    BuildContext context, {
    required String businessName,
    required WorkMode workMode,
  }) =>
      showModalBottomSheet<PickupProof>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => PickupProofSheet(
          businessName: businessName,
          workMode: workMode,
        ),
      );

  @override
  State<PickupProofSheet> createState() =>
      _PickupProofSheetState();
}

class _PickupProofSheetState extends State<PickupProofSheet> {
  String? _photoPath;
  bool _takingPhoto = false;
  final _orderRefCtrl = TextEditingController();
  final _costCtrl = TextEditingController();

  bool get _canConfirm => _photoPath != null;

  @override
  void dispose() {
    _orderRefCtrl.dispose();
    _costCtrl.dispose();
    super.dispose();
  }

  Future<void> _capturePhoto() async {
    setState(() => _takingPhoto = true);
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
        maxWidth: 1280,
      );
      if (mounted && file != null) {
        setState(() => _photoPath = file.path);
      }
    } catch (_) {
      // Camera unavailable — no-op (handled by disabled confirm)
    } finally {
      if (mounted) setState(() => _takingPhoto = false);
    }
  }

  void _confirm() {
    HapticFeedback.mediumImpact();
    final rawCost = _costCtrl.text.replaceAll(RegExp(r'[^0-9.]'), '');
    Navigator.of(context).pop(
      PickupProof(
        photoPath: _photoPath!,
        orderRef: _orderRefCtrl.text.trim().isEmpty
            ? null
            : _orderRefCtrl.text.trim(),
        actualCost: rawCost.isEmpty ? null : double.tryParse(rawCost),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mode = widget.workMode;
    final isPaquete = mode == WorkMode.paquete;
    final isMandado = mode == WorkMode.mandado;
    final accent = mode.color;

    final photoLabel = isMandado
        ? 'Foto de la compra / comprobante'
        : isPaquete
            ? 'Foto del paquete'
            : 'Foto del pedido';
    final photoHint = isMandado
        ? 'Fotografía lo comprado y el recibo antes de salir.'
        : isPaquete
            ? 'Fotografía el paquete antes de retirarlo.'
            : 'Fotografía todos los artículos antes de salir del local.';
    final refLabel = isMandado
        ? 'Total gastado / referencia'
        : isPaquete
            ? 'Referencia del paquete'
            : 'Referencia del pedido';
    final refHint = isMandado
        ? 'Ej: \$32.400 · factura #119'
        : isPaquete
            ? 'Ej: Caja azul · frágil'
            : 'Ej: #4521 · 2 hamburguesas';
    final protectMsg = isMandado
        ? 'Protege al cliente y a ti. La foto del recibo certifica lo que se gastó.'
        : isPaquete
            ? 'Protege al remitente y a ti. La foto certifica el estado del paquete al retirarlo.'
            : 'Protege al restaurante y a ti. La foto certifica que el pedido salió completo.';
    final confirmLabel = isMandado
        ? 'Mandado realizado · Iniciar entrega'
        : isPaquete
            ? 'Paquete recogido · Iniciar entrega'
            : 'Pedido recogido · Iniciar entrega';
    final requireMsg = isMandado
        ? 'Debes fotografiar la compra o el recibo para continuar.'
        : isPaquete
            ? 'Debes fotografiar el paquete para continuar.'
            : 'Debes fotografiar el pedido para continuar.';

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Drag handle ─────────────────────────────────────────
          const SizedBox(height: 12),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.outlineLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),

          // ── Header ──────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingL,
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.camera_alt_rounded,
                    color: accent,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isMandado
                            ? 'Prueba del mandado'
                            : isPaquete
                                ? 'Prueba de recogida · Paquete'
                                : 'Prueba de recogida · Pedido',
                        style:
                            theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        widget.businessName,
                        style:
                            theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // ── Why this matters banner ──────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingL,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
                vertical: AppConstants.spacingS,
              ),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(
                  AppConstants.radiusMedium,
                ),
                border: Border.all(
                  color: accent.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.shield_rounded,
                    size: 16,
                    color: accent.withValues(alpha: 0.7),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      protectMsg,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: accent.withValues(alpha: 0.85),
                        fontSize: 11.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 12),
          const Divider(height: 1),

          // ── Scrollable body ──────────────────────────────────────
          Flexible(
            child: SingleChildScrollView(
              padding:
                  const EdgeInsets.all(AppConstants.spacingL),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Photo (required) ────────────────────────────
                  _SectionLabel(
                    icon: Icons.photo_camera_rounded,
                    label: photoLabel,
                    color: accent,
                    badge: _photoPath != null
                        ? '✓ Capturada'
                        : 'Requerida',
                    badgeIsWarning: _photoPath == null,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    photoHint,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  _PhotoCapture(
                    photoPath: _photoPath,
                    takingPhoto: _takingPhoto,
                    accentColor: accent,
                    onTap: _capturePhoto,
                    onRetake: _capturePhoto,
                  ),

                  const SizedBox(height: AppConstants.spacingXL),

                  // ── Cost (mandado only) ─────────────────────────
                  if (isMandado) ...[
                    _SectionLabel(
                      icon: Icons.monetization_on_outlined,
                      label: 'Costo real del mandado',
                      color: accent,
                      badge: 'Para el cliente',
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Ingresa cuánto gastaste para que el cliente lo vea.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingM),
                    TextField(
                      controller: _costCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: false),
                      decoration: InputDecoration(
                        hintText: 'Ej: 32400',
                        prefixText: '\$  ',
                        prefixIcon: Icon(
                          Icons.attach_money_rounded,
                          color: accent.withValues(alpha: 0.6),
                          size: 18,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(
                            AppConstants.radiusMedium,
                          ),
                          borderSide: BorderSide(color: accent, width: 2),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppConstants.spacingXL),
                  ],

                  // ── Reference (optional) ────────────────────────
                  _SectionLabel(
                    icon: Icons.receipt_long_rounded,
                    label: refLabel,
                    color: accent,
                    badge: 'Opcional',
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  TextField(
                    controller: _orderRefCtrl,
                    keyboardType: TextInputType.text,
                    textCapitalization:
                        TextCapitalization.sentences,
                    maxLength: 60,
                    decoration: InputDecoration(
                      hintText: refHint,
                      prefixIcon: Icon(
                        Icons.tag_rounded,
                        color: accent.withValues(alpha: 0.6),
                        size: 18,
                      ),
                      counterText: '',
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(
                          AppConstants.radiusMedium,
                        ),
                        borderSide: BorderSide(
                          color: accent,
                          width: 2,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: AppConstants.spacingXL),

                  // ── Confirm button ──────────────────────────────
                  AnimatedOpacity(
                    opacity: _canConfirm ? 1.0 : 0.45,
                    duration:
                        const Duration(milliseconds: 200),
                    child: ElevatedButton.icon(
                      onPressed: _canConfirm ? _confirm : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: accent,
                        foregroundColor: Colors.white,
                        minimumSize:
                            const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(
                            AppConstants.radiusMedium,
                          ),
                        ),
                      ),
                      icon: const Icon(
                        Icons.local_shipping_rounded,
                      ),
                      label: Text(
                        confirmLabel,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ),

                  if (!_canConfirm) ...[
                    const SizedBox(height: AppConstants.spacingS),
                    Row(
                      mainAxisAlignment:
                          MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.info_outline_rounded,
                          size: 13,
                          color: AppColors.textSecondary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          requireMsg,
                          style:
                              theme.textTheme.bodySmall
                                  ?.copyWith(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: AppConstants.spacingM),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.icon,
    required this.label,
    required this.color,
    this.badge,
    this.badgeIsWarning = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final String? badge;
  final bool badgeIsWarning;

  @override
  Widget build(BuildContext context) {
    final badgeColor =
        badgeIsWarning ? AppColors.warning : color;
    return Row(
      children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style:
              Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
        ),
        if (badge != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 7,
              vertical: 2,
            ),
            decoration: BoxDecoration(
              color: badgeColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              badge!,
              style: TextStyle(
                color: badgeColor,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _PhotoCapture extends StatelessWidget {
  const _PhotoCapture({
    required this.photoPath,
    required this.takingPhoto,
    required this.accentColor,
    required this.onTap,
    required this.onRetake,
  });

  final String? photoPath;
  final bool takingPhoto;
  final Color accentColor;
  final VoidCallback onTap;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    if (photoPath != null) {
      return Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(
              AppConstants.radiusMedium,
            ),
            child: Image(
              image: (kIsWeb
                  ? NetworkImage(photoPath!)
                  : FileImage(File(photoPath!))) as ImageProvider,
              height: 200,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: GestureDetector(
              onTap: onRetake,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.refresh_rounded,
                      color: Colors.white,
                      size: 14,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Retomar',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: 8,
            left: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 8,
                vertical: 4,
              ),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.check_circle_rounded,
                    color: Colors.white,
                    size: 12,
                  ),
                  SizedBox(width: 4),
                  Text(
                    'Pedido fotografiado',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return GestureDetector(
      onTap: takingPhoto ? null : onTap,
      child: Container(
        height: 180,
        decoration: BoxDecoration(
          color: accentColor.withValues(alpha: 0.06),
          border: Border.all(
            color: accentColor.withValues(alpha: 0.35),
            width: 1.5,
            style: BorderStyle.solid,
          ),
          borderRadius: BorderRadius.circular(
            AppConstants.radiusMedium,
          ),
        ),
        child: takingPhoto
            ? Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: accentColor,
                ),
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: accentColor.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.add_a_photo_rounded,
                      size: 36,
                      color: accentColor,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Fotografiar el pedido',
                    style: TextStyle(
                      color: accentColor,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Incluye todos los artículos del pedido',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
