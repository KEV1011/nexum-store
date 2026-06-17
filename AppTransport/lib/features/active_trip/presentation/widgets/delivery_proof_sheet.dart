import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';

/// Proof-of-delivery data collected at the end of an Envíos trip.
class DeliveryProof {
  const DeliveryProof({
    required this.hasSignature,
    this.photoPath,
  });

  final String? photoPath;
  final bool hasSignature;
}

/// Bottom sheet que recoge prueba de entrega para viajes de reparto
/// (pedido o paquete): foto opcional + firma del destinatario.
class DeliveryProofSheet extends StatefulWidget {
  const DeliveryProofSheet({
    required this.recipientName,
    required this.workMode,
    super.key,
  });

  final String recipientName;
  final WorkMode workMode;

  static Future<DeliveryProof?> show(
    BuildContext context, {
    required String recipientName,
    required WorkMode workMode,
  }) =>
      showModalBottomSheet<DeliveryProof>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Colors.transparent,
        builder: (_) => DeliveryProofSheet(
          recipientName: recipientName,
          workMode: workMode,
        ),
      );

  @override
  State<DeliveryProofSheet> createState() =>
      _DeliveryProofSheetState();
}

class _DeliveryProofSheetState extends State<DeliveryProofSheet> {
  // ── Photo ──────────────────────────────────────────────────────────
  String? _photoPath;
  bool _takingPhoto = false;

  // ── Signature ──────────────────────────────────────────────────────
  final List<List<Offset>> _strokes = [];
  List<Offset> _currentStroke = [];
  bool get _hasSignature => _strokes.isNotEmpty;

  bool get _canConfirm => _photoPath != null || _hasSignature;

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
      // Camera unavailable in some environments — silent fallback
    } finally {
      if (mounted) setState(() => _takingPhoto = false);
    }
  }

  void _clearSignature() {
    HapticFeedback.selectionClick();
    setState(() {
      _strokes.clear();
      _currentStroke = [];
    });
  }

  void _confirm() {
    HapticFeedback.mediumImpact();
    Navigator.of(context).pop(
      DeliveryProof(hasSignature: _hasSignature, photoPath: _photoPath),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = widget.workMode.color;
    final isPaquete = widget.workMode == WorkMode.paquete;
    final isMandado = widget.workMode == WorkMode.mandado;
    final photoLabel = isMandado
        ? 'Foto de lo entregado'
        : isPaquete
            ? 'Foto del paquete entregado'
            : 'Foto del pedido entregado';

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
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

          // Header
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
                    Icons.verified_rounded,
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
                            ? 'Prueba de entrega · Mandado'
                            : isPaquete
                                ? 'Prueba de entrega · Paquete'
                                : 'Prueba de entrega · Pedido',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'Destinatario: ${widget.recipientName}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),
          const Divider(height: 1),

          // Scrollable body
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppConstants.spacingL),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Photo section ─────────────────────────────────
                  _SectionHeader(
                    icon: Icons.photo_camera_rounded,
                    label: photoLabel,
                    color: accent,
                    badge: _photoPath != null ? '✓ Capturada' : null,
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

                  // ── Signature section ─────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: _SectionHeader(
                          icon: Icons.draw_rounded,
                          label: 'Firma del destinatario',
                          color: accent,
                          badge: _hasSignature ? '✓ Firmado' : null,
                        ),
                      ),
                      if (_hasSignature)
                        GestureDetector(
                          onTap: _clearSignature,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.refresh_rounded,
                                  size: 14,
                                  color: AppColors.textSecondary,
                                ),
                                const SizedBox(width: 4),
                                const Text(
                                  'Borrar',
                                  style: TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppConstants.spacingXS),
                  Text(
                    'El destinatario firma directamente en pantalla.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppConstants.spacingM),
                  _SignaturePad(
                    strokes: _strokes,
                    accentColor: accent,
                    onPanStart: (d) {
                      setState(() {
                        _currentStroke = [d.localPosition];
                        _strokes.add(_currentStroke);
                      });
                    },
                    onPanUpdate: (d) {
                      setState(
                        () => _currentStroke.add(d.localPosition),
                      );
                    },
                  ),

                  const SizedBox(height: AppConstants.spacingXL),

                  // ── Confirm button ────────────────────────────────
                  AnimatedOpacity(
                    opacity: _canConfirm ? 1.0 : 0.55,
                    duration: const Duration(milliseconds: 200),
                    child: ElevatedButton.icon(
                      onPressed: _canConfirm ? _confirm : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: accent,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(
                            AppConstants.radiusMedium,
                          ),
                        ),
                      ),
                      icon: const Icon(Icons.check_circle_rounded),
                      label: const Text(
                        'Confirmar entrega',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),

                  if (!_canConfirm) ...[
                    const SizedBox(height: AppConstants.spacingS),
                    Text(
                      'Captura una foto o la firma para continuar.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.textSecondary,
                      ),
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

// ── Sub-widgets ──────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.color,
    this.badge,
  });

  final IconData icon;
  final String label;
  final Color color;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
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
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              badge!,
              style: TextStyle(
                color: color,
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
            borderRadius:
                BorderRadius.circular(AppConstants.radiusMedium),
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
        ],
      );
    }

    return GestureDetector(
      onTap: takingPhoto ? null : onTap,
      child: Container(
        height: 160,
        decoration: BoxDecoration(
          color: accentColor.withValues(alpha: 0.06),
          border: Border.all(
            color: accentColor.withValues(alpha: 0.3),
            width: 1.5,
          ),
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
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
                  Icon(
                    Icons.add_a_photo_rounded,
                    size: 40,
                    color: accentColor,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Fotografiar el paquete entregado',
                    style: TextStyle(
                      color: accentColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Asegúrate de que sea visible',
                    style: TextStyle(
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

class _SignaturePad extends StatelessWidget {
  const _SignaturePad({
    required this.strokes,
    required this.accentColor,
    required this.onPanStart,
    required this.onPanUpdate,
  });

  final List<List<Offset>> strokes;
  final Color accentColor;
  final GestureDragStartCallback onPanStart;
  final GestureDragUpdateCallback onPanUpdate;

  @override
  Widget build(BuildContext context) {
    final isEmpty = strokes.isEmpty;
    return GestureDetector(
      onPanStart: onPanStart,
      onPanUpdate: onPanUpdate,
      child: Container(
        height: 180,
        decoration: BoxDecoration(
          color: isEmpty
              ? accentColor.withValues(alpha: 0.04)
              : Colors.white,
          border: Border.all(
            color: accentColor
                .withValues(alpha: isEmpty ? 0.25 : 0.6),
            width: isEmpty ? 1.5 : 2,
          ),
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: ClipRRect(
          borderRadius:
              BorderRadius.circular(AppConstants.radiusMedium),
          child: Stack(
            children: [
              CustomPaint(
                painter: _StrokePainter(strokes: strokes),
                size: Size.infinite,
              ),
              if (isEmpty)
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.gesture_rounded,
                        size: 32,
                        color: accentColor.withValues(alpha: 0.35),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Firmar aquí',
                        style: TextStyle(
                          color: accentColor.withValues(alpha: 0.45),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StrokePainter extends CustomPainter {
  const _StrokePainter({required this.strokes});

  final List<List<Offset>> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.textPrimary
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      if (stroke.isEmpty) continue;
      if (stroke.length == 1) {
        canvas.drawCircle(
          stroke[0],
          1.4,
          paint..style = PaintingStyle.fill,
        );
        paint.style = PaintingStyle.stroke;
        continue;
      }
      final path = Path()..moveTo(stroke[0].dx, stroke[0].dy);
      for (var i = 1; i < stroke.length - 1; i++) {
        final mid = Offset(
          (stroke[i].dx + stroke[i + 1].dx) / 2,
          (stroke[i].dy + stroke[i + 1].dy) / 2,
        );
        path.quadraticBezierTo(
          stroke[i].dx,
          stroke[i].dy,
          mid.dx,
          mid.dy,
        );
      }
      path.lineTo(stroke.last.dx, stroke.last.dy);
      canvas.drawPath(path, paint);
    }
  }

  // Always repaint — stroke list is mutated in place during drawing.
  @override
  bool shouldRepaint(_StrokePainter old) => true;
}
