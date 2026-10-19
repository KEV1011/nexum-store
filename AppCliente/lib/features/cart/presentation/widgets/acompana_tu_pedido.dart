/// «Acompaña tu pedido»: lo que el local ofrece antes de cerrar el carrito.
///
/// POR QUÉ SON PRODUCTOS Y NO OPCIONES. En las apps grandes esta fila se ve
/// igual que las adiciones de un plato, pero por dentro no puede serlo: una
/// gaseosa es un PRODUCTO del catálogo. Si se modelara como `ProductOption`:
///
///   * no descontaría existencias — se vendería infinitas veces aunque se
///     haya acabado,
///   * no entraría en el reporte de ventas, que suma por línea de producto,
///   * y su precio quedaría duplicado: el dueño sube la gaseosa y el
///     acompañamiento se queda con el precio viejo.
///
/// Así que entra como una línea más del pedido. La regla corta: **un
/// modificador cambia un plato; un acompañamiento es otro plato.**
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/nombre_plato.dart';
import 'package:nexum_client/features/cart/presentation/providers/cart_provider.dart';

class AcompanaTuPedido extends ConsumerWidget {
  const AcompanaTuPedido({required this.business, super.key});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detalle = ref.watch(businessByIdProvider(business.id));
    final enCarrito = ref
        .watch(cartProvider)
        .items
        .map((i) => i.product.id)
        .toSet();

    return detalle.when(
      // Sin datos todavía, o con un fallo, NO se dibuja nada: esto es una
      // sugerencia, y un error aquí no puede estorbar a quien va a pagar.
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (b) {
        // Sin `isAvailable`: `ProductEntity` no lo tiene porque el servidor
        // ya filtra los agotados en la carta pública. Comprobarlo aquí no
        // solo sobraba, es que no compila — y eso solo lo dice el CI.
        final sugeridos = b.products
            .where((p) => p.suggestAsAddon && !enCarrito.contains(p.id))
            .toList();
        // Si no queda ninguno, la sección entera desaparece. Un título con la
        // fila vacía debajo se lee como algo que no cargó.
        if (sugeridos.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: AppConstants.spacingM),
            Text(
              'Acompaña tu pedido',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 122,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: sugeridos.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => _TarjetaSugerida(
                  producto: sugeridos[i],
                  business: b,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _TarjetaSugerida extends ConsumerWidget {
  const _TarjetaSugerida({required this.producto, required this.business});

  final ProductEntity producto;
  final BusinessEntity business;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Un acompañamiento con variantes obligatorias (un jugo que pide tamaño)
    // NO se puede meter de un toque: se abriría el carrito con una elección
    // que nadie hizo. En ese caso se manda a la carta, que es donde se elige.
    final pideElegir = producto.optionGroups.any((g) => g.required);

    return SizedBox(
      width: 132,
      child: Material(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          onTap: pideElegir
              ? null
              : () {
                  ref
                      .read(cartProvider.notifier)
                      .addProduct(producto, business);
                  ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(
                      SnackBar(content: Text('${producto.name} agregado')),
                    );
                },
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  // Solo el título: «Hamburguesa costeña (croqueta, queso…)»
                  // cortado a dos renglones dejaba fuera justo lo que importa.
                  partirNombrePlato(producto.name, producto.description).titulo,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                    color: context.textPrimaryColor,
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        // «Desde» cuando hay que elegir algo que cuesta más:
                        // es la misma regla que la carta, y aquí importa
                        // igual porque el precio está junto a un «+».
                        producto.precioDesde
                            ? 'Desde ${CurrencyFormatter.format(producto.price)}'
                            : CurrencyFormatter.format(producto.price),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimaryColor,
                        ),
                      ),
                    ),
                    Icon(
                      pideElegir ? Icons.chevron_right_rounded : Icons.add_rounded,
                      size: 20,
                      color: context.textSecondaryColor,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
