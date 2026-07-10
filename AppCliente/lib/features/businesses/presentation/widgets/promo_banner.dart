import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

class _PromoData {
  const _PromoData({
    required this.title,
    required this.subtitle,
    required this.cta,
    required this.gradient,
    required this.icon,
    required this.decorIcon,
  });

  final String title;
  final String subtitle;
  final String cta;
  final List<Color> gradient;
  final IconData icon;
  final IconData decorIcon;
}

const _promos = [
  _PromoData(
    title: 'Domicilio gratis',
    subtitle: 'En tus primeros 3 pedidos del mes',
    cta: 'Pedir ahora',
    gradient: [Color(0xFF00C853), Color(0xFF00963D)],
    icon: Icons.local_shipping_rounded,
    decorIcon: Icons.delivery_dining_rounded,
  ),
  _PromoData(
    title: 'Restaurantes cerca de ti',
    subtitle: 'Platos típicos a tu puerta en 30 min',
    cta: 'Explorar',
    gradient: [Color(0xFFFF7043), Color(0xFFBF360C)],
    icon: Icons.restaurant_rounded,
    decorIcon: Icons.ramen_dining_rounded,
  ),
  _PromoData(
    title: 'Custodia garantizada',
    subtitle: 'Foto al salir + prueba de entrega',
    cta: 'Saber más',
    gradient: [AppColors.secondary, AppColors.secondaryDark],
    icon: Icons.verified_user_rounded,
    decorIcon: Icons.shield_rounded,
  ),
];

/// Carrusel animado de promociones.
class PromoBanner extends StatefulWidget {
  const PromoBanner({super.key});

  @override
  State<PromoBanner> createState() => _PromoBannerState();
}

class _PromoBannerState extends State<PromoBanner> {
  final _ctrl = PageController();
  int _page = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      final next = (_page + 1) % _promos.length;
      _ctrl.animateToPage(
        next,
        duration: AppConstants.mediumAnimation,
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 152,
          child: PageView.builder(
            controller: _ctrl,
            onPageChanged: (p) => setState(() => _page = p),
            itemCount: _promos.length,
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: _PromoCard(data: _promos[i]),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_promos.length, (i) {
            return AnimatedContainer(
              duration: AppConstants.shortAnimation,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _page ? 20 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: i == _page
                    ? _promos[i].gradient.first
                    : AppColors.outlineLight,
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.data});

  final _PromoData data;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: data.gradient,
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        boxShadow: [
          BoxShadow(
            color: data.gradient.first.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          // Decorative background icon
          Positioned(
            right: -16,
            top: -16,
            child: Icon(
              data.decorIcon,
              size: 110,
              color: Colors.white.withValues(alpha: 0.08),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    data.icon,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
                const SizedBox(width: AppConstants.spacingM),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        data.title,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        data.subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.85),
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          data.cta,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
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
