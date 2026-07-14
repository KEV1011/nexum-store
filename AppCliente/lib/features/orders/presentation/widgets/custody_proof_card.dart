import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/date_formatter.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';

/// Tarjeta de cadena de custodia.
///
/// Muestra prueba de salida del local + prueba de entrega. Cuando el
/// repartidor subió la FOTO real (pickupPhotoPath/deliveryPhotoPath), se
/// muestra la imagen (tap = pantalla completa); si la prueba fue solo firma
/// o la foto no carga, queda el recibo estilizado con los datos del pedido.
class CustodyProofCard extends StatelessWidget {
  const CustodyProofCard({required this.order, super.key});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Header(order: order),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              Expanded(
                child: _ProofSlot(
                  label: 'Salida del local',
                  captured: order.hasPickupProof,
                  timestamp: order.pickedUpAt,
                  type: _ProofType.pickup,
                  driverName: order.driverName,
                  productLines: order.lines.take(2).toList(),
                  photoUrl: order.pickupPhotoPath,
                  order: order,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: _ProofSlot(
                  label: 'Entrega a ti',
                  captured: order.hasDeliveryProof,
                  timestamp: order.deliveredAt,
                  type: _ProofType.delivery,
                  driverName: order.driverName,
                  hasSignature: order.hasSignature,
                  photoUrl: order.deliveryPhotoPath,
                  order: order,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(
          Icons.verified_user_rounded,
          color: AppColors.primary,
          size: 18,
        ),
        const SizedBox(width: AppConstants.spacingS),
        const Expanded(
          child: Text(
            'Cadena de custodia',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        if (order.hasFullCustody)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.successContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'Completa',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.primaryDim,
              ),
            ),
          ),
      ],
    );
  }
}

enum _ProofType { pickup, delivery }

class _ProofSlot extends StatelessWidget {
  const _ProofSlot({
    required this.label,
    required this.captured,
    required this.type,
    required this.order,
    this.timestamp,
    this.driverName,
    this.productLines = const [],
    this.hasSignature = false,
    this.photoUrl,
  });

  final String label;
  final bool captured;
  final _ProofType type;
  final CustomerOrderEntity order;
  final DateTime? timestamp;
  final String? driverName;
  final List<OrderLineEntity> productLines;
  final bool hasSignature;

  /// Foto REAL subida por el repartidor; null = prueba solo por firma/estado.
  final String? photoUrl;

  @override
  Widget build(BuildContext context) {
    final url = photoUrl;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: 4 / 3,
          child: captured
              ? (url != null
                  ? _RealPhoto(
                      url: url,
                      type: type,
                      timestamp: timestamp,
                      hasSignature: hasSignature,
                      fallback: _CapturedPhoto(
                        type: type,
                        timestamp: timestamp,
                        driverName: driverName,
                        productLines: productLines,
                        hasSignature: hasSignature,
                      ),
                    )
                  : _CapturedPhoto(
                      type: type,
                      timestamp: timestamp,
                      driverName: driverName,
                      productLines: productLines,
                      hasSignature: hasSignature,
                    ))
              : _PendingSlot(type: type),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: captured ? null : AppColors.textTertiary,
          ),
        ),
        Row(
          children: [
            Icon(
              captured
                  ? Icons.check_circle_rounded
                  : Icons.hourglass_empty_rounded,
              size: 12,
              color: captured ? AppColors.primary : AppColors.textTertiary,
            ),
            const SizedBox(width: 3),
            Text(
              captured ? 'Verificada' : 'Pendiente',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 11,
                color:
                    captured ? AppColors.primary : AppColors.textTertiary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Foto REAL de custodia subida por el repartidor. Tap = pantalla completa
/// con zoom. Si la imagen no carga (sin red, archivo purgado del disco
/// efímero), cae al recibo estilizado [fallback].
class _RealPhoto extends StatelessWidget {
  const _RealPhoto({
    required this.url,
    required this.type,
    required this.fallback,
    this.timestamp,
    this.hasSignature = false,
  });

  final String url;
  final _ProofType type;
  final Widget fallback;
  final DateTime? timestamp;
  final bool hasSignature;

  void _openFullScreen(BuildContext context) {
    final resolved = ApiConfig.resolveUrl(url);
    showDialog<void>(
      context: context,
      barrierColor: Colors.black87,
      builder: (ctx) => GestureDetector(
        onTap: () => Navigator.of(ctx).pop(),
        child: Stack(
          children: [
            Center(
              child: InteractiveViewer(
                maxScale: 4,
                child: Image.network(resolved, fit: BoxFit.contain),
              ),
            ),
            Positioned(
              top: 40,
              right: 20,
              child: IconButton(
                onPressed: () => Navigator.of(ctx).pop(),
                icon: const Icon(Icons.close_rounded,
                    color: Colors.white, size: 28),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final resolved = ApiConfig.resolveUrl(url);
    return GestureDetector(
      onTap: () => _openFullScreen(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              resolved,
              fit: BoxFit.cover,
              loadingBuilder: (ctx, child, progress) => progress == null
                  ? child
                  : const ColoredBox(
                      color: AppColors.surfaceVariantLight,
                      child: Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
              errorBuilder: (ctx, _, __) => fallback,
            ),
            // Scrim inferior con hora y firma — legible sobre cualquier foto.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(6, 14, 6, 5),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: 0.55),
                    ],
                  ),
                ),
                child: Row(
                  children: [
                    if (timestamp != null)
                      Text(
                        DateFormatter.formatTime(timestamp!),
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    const Spacer(),
                    if (type == _ProofType.delivery && hasSignature)
                      const Row(
                        children: [
                          Icon(Icons.draw_rounded,
                              color: Colors.white, size: 11),
                          SizedBox(width: 3),
                          Text(
                            'Firmado',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 9,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            // Badge verificado (misma señal que el recibo estilizado).
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  size: 10,
                  color: AppColors.primaryDim,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Widget que renderiza una "foto" de custodia con los datos reales del pedido.
///
/// Se usa cuando la prueba fue solo firma (sin foto) o como fallback si la
/// imagen real no carga: un recibo estilizado con los datos del pedido.
class _CapturedPhoto extends StatelessWidget {
  const _CapturedPhoto({
    required this.type,
    required this.productLines,
    this.timestamp,
    this.driverName,
    this.hasSignature = false,
  });

  final _ProofType type;
  final DateTime? timestamp;
  final String? driverName;
  final List<OrderLineEntity> productLines;
  final bool hasSignature;

  @override
  Widget build(BuildContext context) {
    final isPickup = type == _ProofType.pickup;

    final gradient = isPickup
        ? const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1B5E20), Color(0xFF2E7D32)],
          )
        : const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0D47A1), Color(0xFF1565C0)],
          );

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
      child: Container(
        decoration: BoxDecoration(gradient: gradient),
        child: Stack(
          children: [
            // Patrón de grilla de cámara (sutil).
            CustomPaint(
              painter: _GridPainter(),
              child: const SizedBox.expand(),
            ),
            // Contenido central.
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        isPickup
                            ? Icons.restaurant_rounded
                            : Icons.home_rounded,
                        color: Colors.white,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          isPickup ? 'Recogido' : 'Entregado',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  // Productos (solo en pickup).
                  if (isPickup && productLines.isNotEmpty) ...[
                    for (final line in productLines)
                      Text(
                        '${line.quantity}× ${line.productName}',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 9,
                          color: Colors.white.withValues(alpha: 0.9),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 2),
                  ],
                  // Firma (solo en delivery).
                  if (!isPickup && hasSignature) ...[
                    Row(
                      children: [
                        const Icon(
                          Icons.draw_rounded,
                          color: Colors.white,
                          size: 11,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          'Firmado',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 9,
                            color: Colors.white.withValues(alpha: 0.9),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                  ],
                  // Conductor.
                  if (driverName != null)
                    Text(
                      driverName!.split(' ').first,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 9,
                        color: Colors.white.withValues(alpha: 0.7),
                      ),
                    ),
                  // Timestamp.
                  if (timestamp != null)
                    Text(
                      DateFormatter.formatTime(timestamp!),
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                ],
              ),
            ),
            // Badge verificado.
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  size: 10,
                  color: AppColors.primaryDim,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PendingSlot extends StatelessWidget {
  const _PendingSlot({required this.type});

  final _ProofType type;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceVariantLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
      ),
      child: Center(
        child: Icon(
          type == _ProofType.pickup
              ? Icons.camera_alt_outlined
              : Icons.delivery_dining_outlined,
          size: 28,
          color: AppColors.textTertiary,
        ),
      ),
    );
  }
}

/// Pinta una grilla 3×3 sutil sobre el fondo (efecto visor de cámara).
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..strokeWidth = 0.5;

    canvas
      ..drawLine(
        Offset(size.width / 3, 0),
        Offset(size.width / 3, size.height),
        paint,
      )
      ..drawLine(
        Offset(size.width * 2 / 3, 0),
        Offset(size.width * 2 / 3, size.height),
        paint,
      )
      ..drawLine(
        Offset(0, size.height / 3),
        Offset(size.width, size.height / 3),
        paint,
      )
      ..drawLine(
        Offset(0, size.height * 2 / 3),
        Offset(size.width, size.height * 2 / 3),
        paint,
      );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
