import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_card.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';
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

  @override
  Widget build(BuildContext context) {
    final businessesAsync = ref.watch(businessesProvider);

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => ref.refresh(businessesProvider.future),
          child: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              SliverToBoxAdapter(
                child: _SearchBar(
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              SliverToBoxAdapter(
                child: _CategoryFilters(
                  selected: _filter,
                  onSelected: (c) => setState(() => _filter = c),
                ),
              ),
              businessesAsync.when(
                loading: _buildLoading,
                error: (e, _) => _buildError(),
                data: _buildList,
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

  Widget _buildList(List<BusinessEntity> all) {
    final filtered = all.where((b) {
      final matchesCategory = _filter == null || b.category == _filter;
      final matchesQuery = _query.isEmpty ||
          b.name.toLowerCase().contains(_query.toLowerCase());
      return matchesCategory && matchesQuery;
    }).toList();

    if (filtered.isEmpty) {
      return const SliverFillRemaining(
        hasScrollBody: false,
        child: _EmptyState(),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
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
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
      sliver: SliverList.separated(
        itemCount: 5,
        separatorBuilder: (_, __) =>
            const SizedBox(height: AppConstants.spacingM),
        itemBuilder: (_, __) => const SkeletonLoader(child: SkeletonTripTile()),
      ),
    );
  }

  Widget _buildError() {
    return SliverFillRemaining(
      hasScrollBody: false,
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              size: 56,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: AppConstants.spacingM),
            const Text('No se pudieron cargar los negocios'),
            const SizedBox(height: AppConstants.spacingM),
            OutlinedButton(
              onPressed: () => ref.invalidate(businessesProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingS,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.location_on_rounded,
                      color: AppColors.primary,
                      size: 18,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Entregar en',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 13,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 2),
                Text(
                  'Barrio Belén, Pamplona',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({required this.onChanged});

  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
      child: TextField(
        onChanged: onChanged,
        decoration: const InputDecoration(
          hintText: 'Buscar restaurantes, tiendas...',
          prefixIcon: Icon(Icons.search_rounded),
        ),
      ),
    );
  }
}

class _CategoryFilters extends StatelessWidget {
  const _CategoryFilters({required this.selected, required this.onSelected});

  final BusinessCategory? selected;
  final ValueChanged<BusinessCategory?> onSelected;

  @override
  Widget build(BuildContext context) {
    const categories = BusinessCategory.values;

    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingS,
        ),
        itemCount: categories.length + 1,
        separatorBuilder: (_, __) =>
            const SizedBox(width: AppConstants.spacingS),
        itemBuilder: (context, i) {
          if (i == 0) {
            return _FilterChip(
              icon: Icons.apps_rounded,
              label: 'Todos',
              color: AppColors.primary,
              selected: selected == null,
              onTap: () => onSelected(null),
            );
          }
          final category = categories[i - 1];
          return _FilterChip(
            icon: category.icon,
            label: category.label,
            color: category.color,
            selected: selected == category,
            onTap: () => onSelected(category),
          );
        },
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
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
      child: AnimatedContainer(
        duration: AppConstants.shortAnimation,
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
        ),
        decoration: BoxDecoration(
          color: selected ? color : color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 18,
              color: selected ? Colors.white : color,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.search_off_rounded,
            size: 56,
            color: AppColors.textTertiary,
          ),
          SizedBox(height: AppConstants.spacingM),
          Text('No encontramos negocios con ese filtro'),
        ],
      ),
    );
  }
}
