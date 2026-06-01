import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/account/presentation/screens/'
    'account_screen.dart';
import 'package:nexum_client/features/businesses/presentation/screens/'
    'businesses_screen.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/orders/presentation/screens/'
    'orders_screen.dart';
import 'package:nexum_client/features/shell/presentation/providers/'
    'shell_provider.dart';
import 'package:nexum_client/features/transport/presentation/providers/'
    'transport_provider.dart';
import 'package:nexum_client/features/transport/presentation/screens/'
    'transport_home_screen.dart';

/// Contenedor principal con barra de navegación inferior flotante
/// (estilo glassmorphism) y un FAB de acceso rápido a movilidad.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  static const _tabs = [
    BusinessesScreen(),
    OrdersScreen(),
    TransportHomeScreen(),
    AccountScreen(),
  ];

  static const double _pillHeight = 64;
  static const double _bottomOffset = 16;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    final ordersActive =
        ref.watch(ordersProvider.select((s) => s.active.length));
    final transportActive =
        ref.watch(transportProvider.select((s) => s.active.length));
    final bottomPad = MediaQuery.of(context).padding.bottom;
    // Total space the floating bar consumes at the bottom.
    final navReservedHeight = _pillHeight + _bottomOffset + bottomPad;

    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          // Inject extra bottom padding so inner SafeArea / scroll views
          // automatically clear the floating pill bar.
          MediaQuery(
            data: MediaQuery.of(context).copyWith(
              padding: MediaQuery.of(context).padding.copyWith(
                bottom: navReservedHeight + 4,
              ),
            ),
            child: IndexedStack(index: index, children: _tabs),
          ),
          // Floating glass pill nav + FAB
          Positioned(
            left: 16,
            right: 16,
            bottom: _bottomOffset + bottomPad,
            child: Row(
              children: [
                Expanded(
                  child: _GlassPillNav(
                    index: index,
                    ordersActive: ordersActive,
                    transportActive: transportActive,
                    onDestinationSelected: (i) =>
                        ref.read(shellTabProvider.notifier).state = i,
                  ),
                ),
                const SizedBox(width: 10),
                _GlassFab(
                  onTap: () => context.push(AppRoutes.requestRide),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Glass pill navigation bar ──────────────────────────────────────────────

class _GlassPillNav extends StatelessWidget {
  const _GlassPillNav({
    required this.index,
    required this.ordersActive,
    required this.transportActive,
    required this.onDestinationSelected,
  });

  final int index;
  final int ordersActive;
  final int transportActive;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(36),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.10),
            blurRadius: 32,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(36),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(36),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.40),
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                _NavItem(
                  icon: Icons.storefront_outlined,
                  selectedIcon: Icons.storefront_rounded,
                  label: 'Inicio',
                  isSelected: index == 0,
                  badge: 0,
                  onTap: () => onDestinationSelected(0),
                ),
                _NavItem(
                  icon: Icons.receipt_long_outlined,
                  selectedIcon: Icons.receipt_long_rounded,
                  label: 'Pedidos',
                  isSelected: index == 1,
                  badge: ordersActive,
                  onTap: () => onDestinationSelected(1),
                ),
                _NavItem(
                  icon: Icons.directions_car_outlined,
                  selectedIcon: Icons.directions_car_rounded,
                  label: 'Movilidad',
                  isSelected: index == 2,
                  badge: transportActive,
                  onTap: () => onDestinationSelected(2),
                ),
                _NavItem(
                  icon: Icons.person_outline_rounded,
                  selectedIcon: Icons.person_rounded,
                  label: 'Cuenta',
                  isSelected: index == 3,
                  badge: 0,
                  onTap: () => onDestinationSelected(3),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.isSelected,
    required this.badge,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool isSelected;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _buildIcon(),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 10,
                fontWeight:
                    isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected
                    ? AppColors.primary
                    : AppColors.textSecondary,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildIcon() {
    final iconWidget = AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: Icon(
        key: ValueKey(isSelected),
        isSelected ? selectedIcon : icon,
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
        size: 22,
      ),
    );
    if (badge <= 0) return iconWidget;
    return Badge.count(
      count: badge,
      backgroundColor: AppColors.primary,
      child: iconWidget,
    );
  }
}

// ── Glass FAB ──────────────────────────────────────────────────────────────

class _GlassFab extends StatelessWidget {
  const _GlassFab({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 58,
        height: 58,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.40),
              blurRadius: 20,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipOval(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.90),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.45),
                  width: 1.5,
                ),
              ),
              child: const Icon(
                Icons.directions_car_rounded,
                color: Colors.white,
                size: 26,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
