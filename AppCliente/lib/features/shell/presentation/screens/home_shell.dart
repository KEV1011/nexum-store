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

/// Contenedor principal con barra de navegación inferior.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _tabs = [
    BusinessesScreen(),
    OrdersScreen(),
    AccountScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final activeCount = ref.watch(
      ordersProvider.select((s) => s.active.length),
    );

    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront_rounded),
            label: 'Inicio',
          ),
          NavigationDestination(
            icon: _OrdersIcon(
              icon: Icons.receipt_long_outlined,
              badge: activeCount,
            ),
            selectedIcon: _OrdersIcon(
              icon: Icons.receipt_long_rounded,
              badge: activeCount,
            ),
            label: 'Pedidos',
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

class _OrdersIcon extends StatelessWidget {
  const _OrdersIcon({required this.icon, required this.badge});

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
