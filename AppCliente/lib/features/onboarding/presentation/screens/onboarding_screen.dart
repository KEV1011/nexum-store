import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:shared_preferences/shared_preferences.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pageCtrl = PageController();
  int _page = 0;

  static const _pages = [
    _PageData(
      icon: Icons.location_on_rounded,
      title: 'Tracking en vivo',
      body: 'Sigue cada paso de tu pedido en tiempo real, con el nombre '
          'y contacto de tu conductor.',
      gradient: [Color(0xFF00C853), Color(0xFF00963D)],
    ),
    _PageData(
      icon: Icons.verified_user_rounded,
      title: 'Cadena de custodia',
      body: 'Foto del pedido al salir del local y prueba de entrega. '
          'Tú eres el primero en saberlo.',
      gradient: [Color(0xFF1565C0), Color(0xFF003C8F)],
    ),
    _PageData(
      icon: Icons.delivery_dining_rounded,
      title: 'Pamplona en 30 min',
      body: 'Restaurantes, droguerías y más, a tu puerta. '
          'Nexum nació en Pamplona para Pamplona.',
      gradient: [Color(0xFF4A148C), Color(0xFF311B92)],
    ),
  ];

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    final router = GoRouter.of(context);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.onboardingCompleteKey, true);
    if (!mounted) return;
    router.go(AppRoutes.login);
  }

  void _next() {
    _pageCtrl.nextPage(
      duration: AppConstants.mediumAnimation,
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _pages.length - 1;
    final page = _pages[_page];

    return Scaffold(
      body: Stack(
        children: [
          PageView(
            controller: _pageCtrl,
            onPageChanged: (p) => setState(() => _page = p),
            children: _pages
                .map((p) => _OnboardingPage(data: p))
                .toList(),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 52,
            child: Column(
              // Sin esto la Column toma toda la altura disponible del Stack
              // (queda mal posicionada y rompe el hit-test de los botones).
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_pages.length, (i) {
                    return AnimatedContainer(
                      duration: AppConstants.shortAnimation,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      width: i == _page ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: i == _page
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: AppConstants.spacingXL),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingL,
                  ),
                  child: Row(
                    children: [
                      if (!isLast)
                        TextButton(
                          onPressed: _complete,
                          child: Text(
                            'Omitir',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              color: Colors.white.withValues(alpha: 0.7),
                            ),
                          ),
                        ),
                      const Spacer(),
                      ElevatedButton(
                        onPressed: isLast ? _complete : _next,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: page.gradient.first,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 28,
                            vertical: 14,
                          ),
                          textStyle: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        child: Text(isLast ? 'Comenzar' : 'Siguiente'),
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

class _PageData {
  const _PageData({
    required this.icon,
    required this.title,
    required this.body,
    required this.gradient,
  });

  final IconData icon;
  final String title;
  final String body;
  final List<Color> gradient;
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({required this.data});

  final _PageData data;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: data.gradient,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingL,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                data.icon,
                size: 110,
                color: Colors.white.withValues(alpha: 0.9),
              ),
              const SizedBox(height: AppConstants.spacingXXL),
              Text(
                data.title,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppConstants.spacingM),
              Text(
                data.body,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 16,
                  color: Colors.white.withValues(alpha: 0.85),
                  height: 1.55,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 140),
            ],
          ),
        ),
      ),
    );
  }
}
