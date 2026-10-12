import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/precio_producto.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Fila de producto en el menú del negocio, con control de cantidad.
class ProductTile extends StatelessWidget {
  const ProductTile({
    required this.product,
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
    super.key,
  });

  final ProductEntity product;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // TODA la fila abre el producto, no solo el botón.
    //
    // Antes el único control era «Agregar», que suena a «va al carrito sin
    // preguntar»: quien quería VER el plato —su foto, qué trae, los tamaños—
    // no tenía dónde tocar, y la hoja de detalle quedaba escondida detrás de
    // una acción de compra. La miniatura abría la galería solo si había más
    // de una foto, así que con una sola tampoco se podía ampliar.
    return Material(
      color: isDark ? AppColors.cardDark : context.cardColor2,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: InkWell(
        onTap: onAdd,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Ink(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(
              color: isDark ? AppColors.outlineDark : context.outlineColor,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ProductThumb(
                imageUrl: product.imageUrl,
                isDark: isDark,
                extraCount: product.images.length,
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // DOS LÍNEAS COMO MUCHO. Las cartas cargadas desde una
                    // foto traen el nombre con todos los ingredientes entre
                    // paréntesis («Choricarne (papa, carne, chorizo…)»): sin
                    // tope ocupaba cinco renglones, empujaba el precio fuera
                    // de la vista y todas las filas se veían iguales. Lo que
                    // se corta está entero a un toque, en el detalle.
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (product.masPedidoPuesto != null) ...[
                      const SizedBox(height: 4),
                      InsigniaMasPedido(puesto: product.masPedidoPuesto!),
                    ],
                    if (product.description.trim().isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        product.description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 13,
                          color: context.textSecondaryColor,
                          height: 1.3,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppConstants.spacingS),
                    PrecioProducto(product: product),
                  ],
                ),
              ),
              const SizedBox(width: AppConstants.spacingM),
              _QuantityControl(
                quantity: quantity,
                onAdd: onAdd,
                onRemove: onRemove,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Miniatura del producto (foto del negocio o un marcador si no hay foto).
/// [extraCount] = fotos adicionales en la galería; muestra un badge "+N".
class _ProductThumb extends StatelessWidget {
  const _ProductThumb({
    required this.imageUrl,
    required this.isDark,
    this.extraCount = 0,
  });

  final String? imageUrl;
  final bool isDark;
  final int extraCount;

  @override
  Widget build(BuildContext context) {
    const double size = 64;
    final placeholderBg = isDark ? AppColors.outlineDark : context.outlineColor;

    Widget placeholder() => Container(
          width: size,
          height: size,
          color: placeholderBg,
          child: Icon(
            Icons.restaurant_menu_rounded,
            size: 24,
            color: context.textSecondaryColor,
          ),
        );

    final url = imageUrl;
    final thumb = ClipRRect(
      borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
      child: (url == null || url.isEmpty)
          ? placeholder()
          : Image.network(
              ApiConfig.resolveUrl(url),
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => placeholder(),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Container(
                  width: size,
                  height: size,
                  color: placeholderBg,
                  child: const Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              },
            ),
    );

    if (extraCount <= 0) return thumb;
    // Badge "+N" indicando que hay más fotos (tocar la miniatura las abre).
    return Stack(
      children: [
        thumb,
        Positioned(
          right: 3,
          bottom: 3,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.65),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.photo_library_rounded,
                    size: 10, color: Colors.white),
                const SizedBox(width: 2),
                Text(
                  '+$extraCount',
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
        ),
      ],
    );
  }
}


class _QuantityControl extends StatelessWidget {
  const _QuantityControl({
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
  });

  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    if (quantity == 0) {
      return SizedBox(
        height: 36,
        child: OutlinedButton(
          onPressed: onAdd,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(64, 36),
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          child: const Text('Agregar'),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _RoundButton(icon: Icons.remove_rounded, onTap: onRemove),
          SizedBox(
            width: 28,
            child: Text(
              '$quantity',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
          _RoundButton(icon: Icons.add_rounded, onTap: onAdd),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Icon(icon, size: 18, color: Colors.white),
      ),
    );
  }
}
