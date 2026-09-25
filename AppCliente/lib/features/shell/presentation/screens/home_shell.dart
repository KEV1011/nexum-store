import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/account/presentation/screens/'
    'account_screen.dart';
import 'package:nexum_client/features/businesses/presentation/screens/'
    'businesses_screen.dart';
import 'package:nexum_client/features/businesses/presentation/screens/'
    'favoritos_screen.dart';
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
import 'package:nexum_client/shared/widgets/lupa_vidrio.dart';

/// Contenedor principal con barra de navegación inferior flotante de vidrio
/// (estilo Rappi/Instagram): píldora translúcida con blur, el contenido se
/// dibuja por debajo (extendBody) y pasa tras el vidrio al hacer scroll.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key});

  /// Las pantallas, en el orden de `shell_provider.dart`.
  ///
  /// MOVILIDAD VA LA ÚLTIMA Y NO SALE EN LA BARRA. No es un descuido: se entra
  /// por la tarjeta de la rejilla de la home, que es donde alguien va a
  /// buscarla, y sigue en la pila porque tiene mapa, WebSocket y a veces un
  /// viaje en curso — sacarla la destruiría al salir y volver costaría recargar
  /// el mapa y reconectar.
  static const _pantallas = [
    BusinessesScreen(),     // kTabInicio
    OrdersScreen(),         // kTabPedidos
    FavoritosScreen(),      // kTabFavoritos
    AccountScreen(),        // kTabCuenta
    TransportHomeScreen(),  // kTabMovilidad — fuera de la barra
  ];

  /// Qué índices de la pila tienen botón en la barra, en su orden.
  static const _enLaBarra = [kTabInicio, kTabPedidos, kTabFavoritos, kTabCuenta];

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
      body: IndexedStack(index: index, children: _pantallas),
      bottomNavigationBar: _GlassNavBar(
        // Posición DENTRO de la barra, no índice de la pila: con Movilidad
        // fuera, los dos dejaron de coincidir. -1 = estamos en una pantalla
        // que no tiene botón, y entonces no se ilumina ninguno.
        activo: _enLaBarra.indexOf(index),
        onSelect: (posicion) {
          HapticFeedback.selectionClick();
          ref.read(shellTabProvider.notifier).state = _enLaBarra[posicion];
        },
        items: [
          const _GlassNavItem(icono: ZipaIconName.inicio, label: 'Inicio'),
          // El badge suma pedidos Y viajes. Con Movilidad fuera de la barra,
          // dejar el contador de viajes donde estaba lo habría hecho
          // desaparecer: alguien con un viaje en curso no tendría ni una señal
          // de que sigue abierto.
          _GlassNavItem(
            icono: ZipaIconName.pedidos,
            label: 'Pedidos',
            badge: ordersActive + transportActive,
          ),
          const _GlassNavItem(
            icono: ZipaIconName.favoritos,
            label: 'Favoritos',
          ),
          const _GlassNavItem(icono: ZipaIconName.cuenta, label: 'Cuenta'),
        ],
      ),
    );
  }
}

// ── Barra de vidrio ───────────────────────────────────────────────────────────

class _GlassNavItem {
  const _GlassNavItem({
    required this.icono,
    required this.label,
    this.badge = 0,
  });

  /// Un nombre del catálogo, no un `IconData`: así no se puede colar un glifo
  /// suelto ni una variante rellena.
  final ZipaIconName icono;
  final String label;
  final int badge;
}

class _GlassNavBar extends StatelessWidget {
  const _GlassNavBar({
    required this.activo,
    required this.onSelect,
    required this.items,
  });

  /// Posición iluminada, o -1 si la pantalla actual no está en la barra.
  final int activo;
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
              color: Colors.black.withValues(alpha: 0.30),
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
              height: 66,
              decoration: BoxDecoration(
                // Mismo cristal que la app del conductor: las dos apps son la
                // misma plataforma y la barra es lo primero que se ve.
                color: const Color(0xFF1A1D27).withValues(alpha: 0.66),
                borderRadius: BorderRadius.circular(30),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
              child: Stack(
                children: [
                  // Lupa de vidrio (referencia Rappi/iOS liquid glass) que se
                  // DESLIZA hasta el ítem activo.
                  //
                  // Píldora y no círculo: dentro va el ícono con su etiqueta
                  // debajo, y en la parte baja de un círculo no cabe una
                  // palabra como "Movilidad" — se salía por los lados. La
                  // píldora se ajusta al ancho del ítem y contiene las dos.
                  // Con -1 (estamos en Movilidad, que no tiene botón) la lupa
                  // se desvanece en vez de irse al primer ítem: iluminar
                  // «Inicio» estando en otra pantalla es mentir sobre dónde
                  // está uno.
                  // (66 de barra − 52 de píldora) / 2 = 7 de margen vertical.
                  LupaVidrio(columnas: items.length, activa: activo),
                  Row(
                    children: [
                      for (var i = 0; i < items.length; i++)
                        Expanded(child: _buildItem(context, i)),
                    ],
                  ),
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
    final active = i == activo;
    final color = active ? ZipaTokens.marca : const Color(0xFF94A3B8);

    // EL GLIFO NO CAMBIA AL ACTIVARSE. Antes pasaba de línea a relleno, que
    // cambia el peso visual y hace saltar la fila entera al moverse de
    // pestaña. El estado se expresa con el color y con la píldora de vidrio.
    Widget icono = ZipaIcon(item.icono, color: color);
    if (item.badge > 0) {
      icono = Badge.count(
        count: item.badge,
        backgroundColor: ZipaTokens.marca,
        child: icono,
      );
    }

    return InkWell(
      onTap: () => onSelect(i),
      borderRadius: BorderRadius.circular(30),
      // El contenido acompaña a la lupa con un empujón mínimo. 1,06 y no más:
      // por encima de eso la etiqueta de diez puntos empieza a reflowear y la
      // fila entera parece moverse.
      child: AnimatedScale(
        scale: active ? 1.06 : 1,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            icono,
            const SizedBox(height: 3),
            Text(
              item.label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
