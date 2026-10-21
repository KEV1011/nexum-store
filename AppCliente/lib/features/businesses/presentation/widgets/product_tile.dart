import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/nombre_plato.dart';
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
    final nombre = partirNombrePlato(product.name, product.description);

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
              // Tres casos, en este orden:
              //  1. La foto real que subió el local.
              //  2. Sin foto, la ilustración de lo que ES el plato (la misma
              //     del carrusel «¿Qué se te antoja?»): una hamburguesa
              //     dibujada dice algo, mientras que el viejo recuadro gris
              //     con un cubierto era igual para todo y se leía como «no
              //     cargó». Va en un cuadro hundido y más chica que el cuadro,
              //     para que se lea como dibujo y no se confunda con la foto
              //     del plato de verdad.
              //  3. Si el plato no es de ningún antojo, solo texto: inventarle
              //     una imagen sería peor que no tenerla.
              if (filaConFoto(product)) ...[
                _ProductThumb(
                  imageUrl: product.imageUrl,
                  isDark: isDark,
                  extraCount: product.images.length,
                ),
                const SizedBox(width: AppConstants.spacingM),
              ] else if (ilustracionDePlato(product) case final ilustracion?) ...[
                _IlustracionPlato(asset: ilustracion),
                const SizedBox(width: AppConstants.spacingM),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // El TÍTULO del plato, sin lo que trae: las cartas
                    // leídas de una foto meten los ingredientes en el nombre
                    // y a dos renglones no se leía ni lo uno ni lo otro. Lo
                    // que trae va debajo y, entero, en la hoja del producto.
                    Text(
                      nombre.titulo,
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
                    if (nombre.detalle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        nombre.detalle,
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

/// ¿La fila lleva la FOTO del plato? Solo si el negocio subió una.
bool filaConFoto(ProductEntity p) => (p.imageUrl ?? '').trim().isNotEmpty;

/// La ilustración que reemplaza a la foto, o null.
///
/// Solo cuando NO hay foto (la del local siempre manda) y solo si el plato es
/// de un antojo del catálogo — el mismo criterio con que la home lo cuenta en
/// «¿Qué se te antoja?», así que una pizza que sale en «Pizza» lleva el dibujo
/// de la pizza. Lo que se ofrece al pagar (bebidas sugeridas) no clasifica.
String? ilustracionDePlato(ProductEntity p) =>
    filaConFoto(p) ? null : antojoDeProducto(p)?.ilustracion;

/// El dibujo del plato en el lugar de la foto. Mismo tamaño que la miniatura
/// (las filas quedan alineadas con las que sí tienen foto) pero con el render
/// a 44 sobre fondo hundido: así se lee como ilustración, no como la foto real
/// del plato, que es lo que haría creer un dibujo a sangre.
class _IlustracionPlato extends StatelessWidget {
  const _IlustracionPlato({required this.asset});

  final String asset;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: context.zHundida,
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
        alignment: Alignment.center,
        child: Image.asset(
          asset,
          width: 44,
          height: 44,
          // Si el archivo faltara, el cuadro queda liso en vez de romper la
          // fila; la prueba del catálogo vigila que no falte.
          errorBuilder: (_, __, ___) => const SizedBox(width: 44, height: 44),
        ),
      ),
    );
  }
}

/// Miniatura del producto. Solo se pinta cuando HAY foto ([filaConFoto]).
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

    // Solo para una foto que existe pero no carga (red, archivo borrado): un
    // tono liso, sin el cubierto genérico que antes era la cara de la carta.
    Widget placeholder() => Container(
          width: size,
          height: size,
          color: placeholderBg,
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
          // La letra en el verde LEGIBLE del tema: el de marca sobre blanco
          // da 2,24:1, la mitad de lo que pide la norma.
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(64, 36),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            foregroundColor: context.primaryTextColor,
            side: BorderSide(color: context.primaryTextColor),
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
