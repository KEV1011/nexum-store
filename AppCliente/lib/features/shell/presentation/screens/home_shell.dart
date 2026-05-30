import 'package:flutter/material.dart';
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

/// Contenedor principal con barra de navegación inferior.
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
      body: IndexedStack(index: index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) =>
            ref.read(shellTabProvider.notifier).state = i,
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront_rounded),
            label: 'Inicio',
          ),
          NavigationDestination(
            icon: _BadgeIcon(
              icon: Icons.receipt_long_outlined,
              badge: ordersActive,
            ),
            selectedIcon: _BadgeIcon(
              icon: Icons.receipt_long_rounded,
              badge: ordersActive,
            ),
            label: 'Pedidos',
          ),
          NavigationDestination(
            icon: _BadgeIcon(
              icon: Icons.directions_car_outlined,
              badge: transportActive,
            ),
            selectedIcon: _BadgeIcon(
              icon: Icons.directions_car_rounded,
              badge: transportActive,
            ),
            label: 'Movilidad',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Cuenta',
          ),
        ],
      ),
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  const _BadgeIcon({required this.icon, required this.badge});

  final IconData icon;
  final int badge;

  @override
  Widget build(BuildContext context) {
    if (badge == 0) return Icon(icon);
    return Badge.count(
      count: badge,
      backgroundColor: AppColors.primary,
      child: Icon(icon),
    );
  }
}
