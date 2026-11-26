// La sección de una campaña: todos los productos inscritos, de todos los
// locales, en el orden que decide el servidor (lo que se puede pedir ya y con
// promoción primero).
//
// Cada producto lleva a la carta de SU local con el plato a la vista: el
// carrito es por local, y pedir desde aquí mezclaría dos cocinas en un pedido.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'precio_producto.dart';
import 'package:nexum_client/features/campanas/data/campanas_api.dart';
import 'package:nexum_client/features/campanas/presentation/'
    'banner_campana.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';

class CampanaScreen extends ConsumerWidget {
  const CampanaScreen({required this.campanaId, this.campana, super.key});

  final String campanaId;

  /// La campaña ya leída en el inicio (título, color, fechas). Puede faltar si
  /// se llega por un enlace: entonces la cabecera usa lo que haya.
  final Campana? campana;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemsAsync = ref.watch(campanaItemsProvider(campanaId));
    final fondo = colorDeCampana(campana?.color);
    final letra = colorDeTextoSobre(fondo);
    final dibujo = ilustracionDeCampana(campana?.icon);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(campanaItemsProvider(campanaId).future),
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: 168,
              backgroundColor: fondo,
              foregroundColor: letra,
              leading: IconButton(
                tooltip: 'Volver',
                icon: const Icon(Icons.arrow_back_rounded),
                onPressed: () => safeBack(context),
              ),
              title: Text(
                campana?.title ?? 'Campaña',
                style: TextStyle(fontWeight: FontWeight.w800, color: letra),
              ),
              flexibleSpace: FlexibleSpaceBar(
                background: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [fondo, Color.lerp(fondo, Colors.black, 0.28)!],
                    ),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 56, 16, 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.end,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (campana != null)
                                  Text(
                                    fechasDeCampana(campana!),
                                    style: TextStyle(
                                      fontFamily: 'Inter',
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: letra,
                                    ),
                                  ),
                                if (campana?.subtitle != null)
                                  Text(
                                    campana!.subtitle!,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontFamily: 'Inter',
                                      fontSize: 13,
                                      color: letra.withValues(alpha: 0.9),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          if (dibujo != null)
                            Image.asset(
                              dibujo,
                              width: 84,
                              height: 84,
                              errorBuilder: (_, __, ___) =>
                                  const SizedBox.shrink(),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            itemsAsync.when(
              loading: () => const SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverToBoxAdapter(child: EsqueletoFilas()),
              ),
              error: (e, _) {
                // Terminada, la sección no existe: se dice, en vez de un
                // «sin conexión» que haría reintentar algo que ya no va a
                // volver.
                final termino =
                    e is DioException && e.response?.statusCode == 404;
                return SliverToBoxAdapter(
                  child: termino
                      ? const _Mensaje(
                          titulo: 'Esta campaña ya terminó',
                          texto: 'Gracias por acompañarnos. Pronto vienen más.',
                        )
                      : BannerSinConexion(
                          onReintentar: () =>
                              ref.invalidate(campanaItemsProvider(campanaId)),
                        ),
                );
              },
              data: (items) => items.isEmpty
                  ? const SliverToBoxAdapter(
                      child: _Mensaje(
                        titulo: 'Aún no hay productos',
                        texto: 'Los locales están preparando sus especiales.',
                      ),
                    )
                  : SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                      sliver: SliverList.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, i) => TarjetaItemCampana(
                          item: items[i],
                          onTap: () => context.push(
                            AppRoutes.businessPath(
                              items[i].businessId,
                              busqueda: items[i].product.name,
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class TarjetaItemCampana extends StatelessWidget {
  const TarjetaItemCampana({required this.item, required this.onTap, super.key});

  final ItemCampana item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = item.product;
    final foto = p.imageUrl != null && p.imageUrl!.isNotEmpty
        ? ApiConfig.resolveUrl(p.imageUrl!)
        : null;
    return Opacity(
      // Un local cerrado se ve, pero apagado: pedirle ahora no se puede.
      opacity: item.abierto ? 1 : 0.55,
      child: Material(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: context.outlineColor),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (foto != null) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.network(
                      foto,
                      width: 92,
                      height: 92,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const SizedBox(width: 92, height: 92),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 15.5,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimaryColor,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.businessName,
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: context.textSecondaryColor,
                        ),
                      ),
                      if (p.description.trim().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          p.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 12.5,
                            height: 1.3,
                            color: context.textSecondaryColor,
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      PrecioProducto(product: p),
                      if (!item.abierto) ...[
                        const SizedBox(height: 4),
                        Text(
                          item.cerradoMotivo ?? 'Cerrado ahora',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: context.textSecondaryColor,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Mensaje extends StatelessWidget {
  const _Mensaje({required this.titulo, required this.texto});

  final String titulo;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 24),
      child: Column(
        children: [
          Text(
            titulo,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            texto,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              color: context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}
