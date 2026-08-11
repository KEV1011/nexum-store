import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/widgets/empty_state.dart';
import 'package:nexum_client/core/widgets/error_state.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'favorites_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_card.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'promo_banner.dart';
import 'package:nexum_client/features/shell/presentation/providers/'
    'shell_provider.dart';
import 'package:nexum_client/shared/widgets/skeleton_loader.dart';

/// Pestaña principal: catálogo de negocios aliados en Pamplona.
class BusinessesScreen extends ConsumerStatefulWidget {
  const BusinessesScreen({super.key});

  @override
  ConsumerState<BusinessesScreen> createState() => _BusinessesScreenState();
}

class _BusinessesScreenState extends ConsumerState<BusinessesScreen> {
  BusinessCategory? _filter;
  String _query = '';
  bool _favoritesSelected = false;

  @override
  Widget build(BuildContext context) {
    final businessesAsync = ref.watch(businessesProvider);
    final favorites = ref.watch(favoritesProvider);
    final address = ref.watch(defaultAddressProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () async => ref.refresh(businessesProvider.future),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: _LocationHeader(
                  address: address?.fullAddress ?? 'Tu dirección',
                  onTap: () => context.push(AppRoutes.addresses),
                ),
              ),
              // Buscador FIJO al hacer scroll (patrón Rappi): la lupa "sigue"
              // al usuario en vez de desaparecer con el contenido.
              SliverPersistentHeader(
                pinned: true,
                delegate: _PinnedSearchBarDelegate(
                  background: context.backgroundColor,
                  child: _ProminentSearchBar(
                    onChanged: (v) => setState(() => _query = v),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 16)),
              // Aquí había un "ZIPA Fest 🎉 · Domicilios desde $0 · Solo este
              // mes" con un botón "Ver promos" que no llevaba a ninguna parte.
              // No es solo un botón muerto: promete al cliente un descuento
              // que no existe. Fuera hasta que haya promociones de verdad.
              SliverToBoxAdapter(
                child: _ServiceHighlights(
                  onRestaurantesTap: () => setState(() {
                    _filter = BusinessCategory.restaurant;
                    _favoritesSelected = false;
                  }),
                  onMobilidadTap: () =>
                      ref.read(shellTabProvider.notifier).state = 2,
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 8)),
              const SliverToBoxAdapter(child: PromoBanner()),
              const SliverToBoxAdapter(child: SizedBox(height: 4)),
              SliverToBoxAdapter(
                child: _SectionHeader(title: 'Categorías'),
              ),
              SliverToBoxAdapter(
                child: _CategoryIconRow(
                  selected: _filter,
                  favoritesSelected: _favoritesSelected,
                  onSelected: (c) => setState(() {
                    _filter = c;
                    _favoritesSelected = false;
                  }),
                  onFavoritesTap: () => setState(() {
                    _favoritesSelected = !_favoritesSelected;
                    _filter = null;
                  }),
                ),
              ),
              SliverToBoxAdapter(
                child: _SectionHeader(title: 'Negocios aliados'),
              ),
              businessesAsync.when(
                loading: _buildLoading,
                error: (e, _) => _buildError(),
                data: (all) => _buildList(all, favorites),
              ),
              SliverToBoxAdapter(
                child: _MandadoBanner(
                  onTap: () => context.push(AppRoutes.errandBooking),
                ),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppConstants.spacingXL),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildList(List<BusinessEntity> all, Set<String> favorites) {
    final filtered = all.where((b) {
      final matchesCategory = _filter == null || b.category == _filter;
      final matchesQuery = _query.isEmpty ||
          b.name.toLowerCase().contains(_query.toLowerCase());
      final matchesFavorites =
          !_favoritesSelected || favorites.contains(b.id);
      return matchesCategory && matchesQuery && matchesFavorites;
    }).toList();

    if (filtered.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: _EmptyState(
          favoritesMode: _favoritesSelected,
          onMandado: () => context.push(AppRoutes.errandBooking),
        ),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
      ),
      sliver: SliverList.separated(
        itemCount: filtered.length,
        separatorBuilder: (_, __) =>
            const SizedBox(height: AppConstants.spacingM),
        itemBuilder: (context, i) {
          final business = filtered[i];
          return BusinessCard(
            business: business,
            onTap: () => context.push(
              AppRoutes.businessPath(business.id),
              extra: business,
            ),
          );
        },
      ),
    );
  }

  Widget _buildLoading() {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
      ),
      sliver: SliverList.separated(
        itemCount: 4,
        separatorBuilder: (_, __) =>
            const SizedBox(height: AppConstants.spacingM),
        itemBuilder: (_, __) =>
            const SkeletonLoader(child: SkeletonTripTile()),
      ),
    );
  }

  Widget _buildError() {
    return SliverFillRemaining(
      hasScrollBody: false,
      child: ErrorState(
        title: 'No pudimos cargar los negocios',
        message: 'Revisa tu conexión e intenta de nuevo.',
        onRetry: () => ref.invalidate(businessesProvider),
      ),
    );
  }
}

// ── Location header ───────────────────────────────────────────────────────────

class _LocationHeader extends StatelessWidget {
  const _LocationHeader({
    required this.address,
    required this.onTap,
  });

  final String address;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.location_on_rounded,
                color: AppColors.primary,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Entregar en',
                    style: TextStyle(
                      fontSize: 11,
                      color: context.textSecondaryColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          address,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimaryColor,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 2),
                      const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: AppColors.primary,
                        size: 22,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.notifications_outlined,
                color: context.textSecondaryColor,
                size: 20,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Search bar ────────────────────────────────────────────────────────────────

class _ProminentSearchBar extends StatelessWidget {
  const _ProminentSearchBar({required this.onChanged});

  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 12,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: TextField(
          onChanged: onChanged,
          style: const TextStyle(fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Restaurantes, tiendas, domicilios...',
            hintStyle: TextStyle(
              color: context.textTertiaryColor,
              fontSize: 14,
            ),
            // Lupa alineada y del tamaño del texto (antes sobresalía).
            prefixIcon: const Padding(
              padding: EdgeInsets.only(left: 14, right: 10),
              child: Icon(
                Icons.search_rounded,
                size: 20,
                color: AppColors.primary,
              ),
            ),
            prefixIconConstraints: const BoxConstraints(
              minWidth: 0,
              minHeight: 0,
            ),
            isDense: true,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(
                color: AppColors.primary,
                width: 1.5,
              ),
            ),
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
      ),
    );
  }
}

/// Delegate que mantiene el buscador ANCLADO arriba mientras el usuario
/// desplaza la lista (la lupa "queda con movimiento": acompaña el scroll).
class _PinnedSearchBarDelegate extends SliverPersistentHeaderDelegate {
  _PinnedSearchBarDelegate({required this.child, required this.background});

  final Widget child;
  final Color background;

  // Alto del buscador (TextField denso) + un respiro vertical.
  static const double _height = 68;

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: background,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: child,
    );
  }

  @override
  bool shouldRebuild(_PinnedSearchBarDelegate oldDelegate) =>
      background != oldDelegate.background || child != oldDelegate.child;
}

// ── Promo teaser ──────────────────────────────────────────────────────────────

// ── Service highlights ────────────────────────────────────────────────────────

class _ServiceHighlights extends StatelessWidget {
  const _ServiceHighlights({
    required this.onMobilidadTap,
    required this.onRestaurantesTap,
  });

  final VoidCallback onMobilidadTap;
  final VoidCallback onRestaurantesTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: _ServiceCard(
              emoji: '🍔',
              title: 'Restaurantes',
              subtitle: 'Domicilio en 30 min',
              gradient: const [Color(0xFFFF7043), Color(0xFFBF360C)],
              shadowColor: const Color(0x40FF7043),
              onTap: onRestaurantesTap,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _ServiceCard(
              emoji: '🚗',
              title: 'Movilidad',
              subtitle: 'Taxi · Moto · Envíos',
              gradient: const [AppColors.secondary, AppColors.secondaryDark],
              shadowColor: const Color(0x401565C0),
              onTap: onMobilidadTap,
            ),
          ),
        ],
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.shadowColor,
    required this.onTap,
    super.key,
  });

  final String emoji;
  final String title;
  final String subtitle;
  final List<Color> gradient;
  final Color shadowColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 128,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: shadowColor,
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            Positioned(
              top: -8,
              right: -4,
              child: Text(
                emoji,
                style: const TextStyle(fontSize: 56),
              ),
            ),
            Positioned(
              bottom: 14,
              left: 14,
              right: 14,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.82),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action, super.key});

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
                letterSpacing: -0.2,
              ),
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

// ── Category icons ────────────────────────────────────────────────────────────

class _CategoryIconRow extends StatelessWidget {
  const _CategoryIconRow({
    required this.selected,
    required this.favoritesSelected,
    required this.onSelected,
    required this.onFavoritesTap,
  });

  final BusinessCategory? selected;
  final bool favoritesSelected;
  final ValueChanged<BusinessCategory?> onSelected;
  final VoidCallback onFavoritesTap;

  @override
  Widget build(BuildContext context) {
    const categories = BusinessCategory.values;

    return SizedBox(
      height: 88,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _CategoryIcon(
            icon: Icons.apps_rounded,
            label: 'Todos',
            color: AppColors.primary,
            selected: selected == null && !favoritesSelected,
            onTap: () => onSelected(null),
          ),
          const SizedBox(width: 16),
          _CategoryIcon(
            icon: Icons.favorite_rounded,
            label: 'Favoritos',
            color: AppColors.error,
            selected: favoritesSelected,
            onTap: onFavoritesTap,
          ),
          ...categories.map(
            (cat) => Padding(
              padding: const EdgeInsets.only(left: 16),
              child: _CategoryIcon(
                icon: cat.icon,
                label: cat.label,
                color: cat.color,
                selected: selected == cat,
                onTap: () => onSelected(cat),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CategoryIcon extends StatelessWidget {
  const _CategoryIcon({
    required this.icon,
    required this.label,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: AppConstants.shortAnimation,
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: selected ? color : color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: color.withValues(alpha: 0.35),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ]
                  : null,
            ),
            child: Icon(
              icon,
              color: selected ? Colors.white : color,
              size: 24,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight:
                  selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? color : context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({this.favoritesMode = false, this.onMandado});

  final bool favoritesMode;

  /// Buscar y no encontrar es el momento de mayor intención: el cliente ya
  /// sabe qué quiere. Ofrecerle el mandado justo ahí es la diferencia entre
  /// que se vaya y que lo pida igual.
  final VoidCallback? onMandado;

  @override
  Widget build(BuildContext context) {
    if (favoritesMode) {
      return const EmptyState(
        icon: Icons.favorite_border_rounded,
        title: 'Aún no tienes favoritos',
        message: 'Toca el corazón en un negocio para guardarlo.',
      );
    }
    return EmptyState(
      icon: Icons.search_off_rounded,
      title: 'No encontramos ese negocio',
      message: 'Aunque no esté en la app, podemos ir por ti: dinos qué '
          'necesitas y de dónde, y un mensajero lo recoge y te lo lleva.',
      actionLabel: onMandado == null ? null : 'Pedir un mandado',
      onAction: onMandado,
    );
  }
}

/// Una franja al pie de la lista de negocios: "lo que no está aquí, lo
/// traemos".
///
/// Farmacias, papelerías, la ferretería, el gas — nada de eso tiene catálogo
/// todavía, y el cliente que entra a Negocios y no lo ve concluye que la app
/// no lo hace. Sí lo hace: se llama mandado y hasta ahora solo se llegaba a él
/// desde la pantalla de movilidad, que es el último sitio donde alguien lo
/// busca cuando quiere una farmacia.
class _MandadoBanner extends StatelessWidget {
  const _MandadoBanner({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Ink(
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.outlineColor),
            ),
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.shopping_bag_outlined,
                    color: AppColors.secondary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '¿No está el negocio que buscas?',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimaryColor,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Farmacia, papelería, lo que sea: dinos qué necesitas '
                        'y vamos por ti.',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12.5,
                          height: 1.35,
                          color: context.textSecondaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 15,
                  color: context.textSecondaryColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
