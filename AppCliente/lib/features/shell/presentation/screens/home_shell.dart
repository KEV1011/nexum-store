import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

/// Contenedor principal con barra de navegación inferior flotante de vidrio
/// (estilo Rappi/Instagram): píldora translúcida con blur, el contenido se
/// dibuja por debajo (extendBody) y pasa tras el vidrio al hacer scroll.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  static const _tabs = [
    BusinessesScreen(),
    OrdersScreen(),
    TransportHomeScreen(),
    AccountScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    final ordersActive = ref.watch(
      ordersProvider.select((s) => s.active.length),
    );
    final transportActive = ref.watch(
      transportProvider.select((s) => s.active.length),
    );

    return Scaffold(
      // El cuerpo se extiende bajo la barra: es lo que crea el efecto de
      // contenido deslizándose tras el vidrio.
      extendBody: true,
      body: IndexedStack(index: index, children: _tabs),
      bottomNavigationBar: _GlassNavBar(
        index: index,
        onSelect: (i) {
          HapticFeedback.selectionClick();
          ref.read(shellTabProvider.notifier).state = i;
        },
        items: [
          const _GlassNavItem(
            icon: Icons.storefront_outlined,
            activeIcon: Icons.storefront_rounded,
            label: 'Inicio',
          ),
          _GlassNavItem(
            icon: Icons.receipt_long_outlined,
            activeIcon: Icons.receipt_long_rounded,
            label: 'Pedidos',
            badge: ordersActive,
          ),
          _GlassNavItem(
            icon: Icons.directions_car_outlined,
            activeIcon: Icons.directions_car_rounded,
            label: 'Movilidad',
            badge: transportActive,
          ),
          const _GlassNavItem(
            icon: Icons.person_outline_rounded,
            activeIcon: Icons.person_rounded,
            label: 'Cuenta',
          ),
        ],
      ),
    );
  }
}

// ── Barra de vidrio ───────────────────────────────────────────────────────────

class _GlassNavItem {
  const _GlassNavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    this.badge = 0,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badge;
}

class _GlassNavBar extends StatelessWidget {
  const _GlassNavBar({
    required this.index,
    required this.onSelect,
    required this.items,
  });

  final int index;
  final ValueChanged<int> onSelect;
  final List<_GlassNavItem> items;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(18, 0, 18, 10),
      child: Container(
        // La sombra vive FUERA del ClipRRect: un clip recorta su propia sombra.
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: Container(
              height: 64,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.72),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.55),
                ),
              ),
              child: Row(
                children: [
                  for (var i = 0; i < items.length; i++)
                    Expanded(child: _buildItem(context, i)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildItem(BuildContext context, int i) {
    final item = items[i];
    final active = i == index;
    final color = active ? AppColors.primary : const Color(0xFF64748B);

    Widget icon = Icon(active ? item.activeIcon : item.icon,
        size: 24, color: color);
    if (item.badge > 0) {
      icon = Badge.count(
        count: item.badge,
        backgroundColor: AppColors.primary,
        child: icon,
      );
    }

    return InkWell(
      onTap: () => onSelect(i),
      borderRadius: BorderRadius.circular(30),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          icon,
          const SizedBox(height: 3),
          Text(
            item.label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: active ? FontWeight.w800 : FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
