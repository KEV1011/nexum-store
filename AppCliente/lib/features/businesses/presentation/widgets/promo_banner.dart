import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

class _PromoData {
  const _PromoData({
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final List<Color> gradient;
  final IconData icon;
}

const _promos = [
  _PromoData(
    title: 'Domicilio gratis',
    subtitle: 'En tus primeros 3 pedidos del mes',
    gradient: [Color(0xFF00C853), Color(0xFF00963D)],
    icon: Icons.local_shipping_rounded,
  ),
  _PromoData(
    title: 'Restaurantes Pamplona',
    subtitle: 'Platos típicos a tu puerta en 30 min',
    gradient: [Color(0xFFF57F17), Color(0xFFE65100)],
    icon: Icons.restaurant_rounded,
  ),
  _PromoData(
    title: 'Cadena de custodia',
    subtitle: 'Foto al salir + prueba de entrega. Siempre.',
    gradient: [Color(0xFF1565C0), Color(0xFF003C8F)],
    icon: Icons.verified_user_rounded,
  ),
];

/// Carrusel animado de promociones en la pantalla de inicio.
class PromoBanner extends StatefulWidget {
  const PromoBanner({super.key});

  @override
  State<PromoBanner> createState() => _PromoBannerState();
}

class _PromoBannerState extends State<PromoBanner> {
  final _pageCtrl = PageController(viewportFraction: 0.92);
  int _page = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted) return;
      final next = (_page + 1) % _promos.length;
      _pageCtrl.animateToPage(
        next,
        duration: AppConstants.mediumAnimation,
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppConstants.spacingS),
      child: Column(
        children: [
          SizedBox(
            height: 120,
            child: PageView.builder(
              controller: _pageCtrl,
              onPageChanged: (p) => setState(() => _page = p),
              itemCount: _promos.length,
              itemBuilder: (_, i) => _PromoCard(data: _promos[i]),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_promos.length, (i) {
              return AnimatedContainer(
                duration: AppConstants.shortAnimation,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: i == _page ? 18 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color:
                      i == _page ? AppColors.primary : AppColors.outlineLight,
                  borderRadius: BorderRadius.circular(3),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.data});

  final _PromoData data;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: data.gradient,
          ),
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          child: Row(
            children: [
              Icon(
                data.icon,
                color: Colors.white.withValues(alpha: 0.9),
                size: 44,
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
                        fontFamily: 'Inter',
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      data.subtitle,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.85),
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
