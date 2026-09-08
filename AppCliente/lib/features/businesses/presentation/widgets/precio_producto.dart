/// Cómo se muestra el precio de un producto: la oferta y el «más pedido».
///
/// Vive en un solo sitio porque son tres pantallas (la carta, el detalle y el
/// carrito) y si cada una montara su propia insignia acabarían diciendo cosas
/// distintas del MISMO plato — un «-46 %» en la lista y un «-45 %» al abrirlo
/// destruye la confianza en el precio más rápido que no tener descuento.
///
/// Regla de todo este archivo: **sin dato no hay adorno.** Sin precio anterior
/// no se tacha nada, sin ranking no hay insignia de «más pedido». Nada de esto
/// se inventa para llenar el hueco.
library;

import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';

/// Precio actual, y si está rebajado, el porcentaje y el precio tachado.
class PrecioProducto extends StatelessWidget {
  const PrecioProducto({
    required this.product,
    this.grande = false,
    super.key,
  });

  final ProductEntity product;

  /// El detalle del producto lo pinta grande; la carta, pequeño.
  final bool grande;

  @override
  Widget build(BuildContext context) {
    final precio = Text(
      CurrencyFormatter.format(product.price),
      style: TextStyle(
        fontFamily: 'Inter',
        fontSize: grande ? 24 : 15,
        fontWeight: FontWeight.w800,
        color: grande ? context.textPrimaryColor : AppColors.primary,
      ),
    );

    if (!product.enOferta) return precio;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        precio,
        const SizedBox(height: 3),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _InsigniaDescuento(pct: product.descuentoPct!, grande: grande),
            const SizedBox(width: 6),
            Text(
              CurrencyFormatter.format(product.compareAtPrice!),
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: grande ? 15 : 12.5,
                color: context.textTertiaryColor,
                decoration: TextDecoration.lineThrough,
                decorationColor: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InsigniaDescuento extends StatelessWidget {
  const _InsigniaDescuento({required this.pct, required this.grande});

  final int pct;
  final bool grande;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: grande ? 8 : 6, vertical: grande ? 4 : 2),
      decoration: BoxDecoration(
        color: AppColors.descuento,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        '-$pct %',
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: grande ? 14 : 11.5,
          fontWeight: FontWeight.w800,
          color: AppColors.descuentoTexto,
        ),
      ),
    );
  }
}

/// «#1 más pedido». Solo aparece cuando el servidor lo manda, y el servidor
/// solo lo manda cuando la tienda ha vendido lo bastante para que signifique
/// algo: un «#1» sobre tres unidades dice qué compró la última persona, no
/// qué pide la gente.
class InsigniaMasPedido extends StatelessWidget {
  const InsigniaMasPedido({required this.puesto, super.key});

  final int puesto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '#$puesto',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: FontWeight.w900,
              fontStyle: FontStyle.italic,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            'más pedido',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12,
              color: context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// El banner de la promoción de la tienda, con la barra de progreso.
///
/// El número que enseña sale de la MISMA cuenta que aplica el servidor al
/// cobrar. Si aquí se calculara aparte, la pantalla prometería un descuento
/// que la caja no haría — que es la peor forma de estrenar un cliente.
class BannerPromoTienda extends StatelessWidget {
  const BannerPromoTienda({
    required this.minimo,
    required this.descuento,
    required this.subtotal,
    super.key,
  });

  final int minimo;
  final int descuento;

  /// Lo que lleva el carrito de ESTA tienda ahora mismo.
  final double subtotal;

  @override
  Widget build(BuildContext context) {
    final base = subtotal < 0 ? 0.0 : subtotal;
    final alcanzado = base >= minimo;
    final falta = (minimo - base).clamp(0, minimo).toDouble();
    final progreso = (base / minimo).clamp(0.0, 1.0);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.promoFondo,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.promoBorde),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.local_offer_rounded, size: 17, color: AppColors.promoTexto),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  '${CurrencyFormatter.format(descuento.toDouble())} OFF en tu pedido',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.promoTexto,
                  ),
                ),
              ),
              if (alcanzado)
                const Icon(Icons.check_circle_rounded, size: 19, color: AppColors.promoTexto),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            alcanzado
                // Ya lo consiguió: se le dice, no se le sigue pidiendo más.
                ? '¡Listo! El descuento se aplica al confirmar tu pedido.'
                : 'Agrega ${CurrencyFormatter.format(falta)} para conseguirlo.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12.5,
              color: AppColors.promoTexto.withValues(alpha: 0.85),
            ),
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(
              value: progreso,
              minHeight: 6,
              backgroundColor: AppColors.promoTexto.withValues(alpha: 0.15),
              valueColor: const AlwaysStoppedAnimation(AppColors.promoTexto),
            ),
          ),
        ],
      ),
    );
  }
}
