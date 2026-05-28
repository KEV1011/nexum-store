import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/domain/service_type.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with TickerProviderStateMixin {
  final _pageController = PageController();
  int _currentPage = 0;

  late final List<AnimationController> _slideControllers;
  late final List<Animation<double>> _fadeAnims;
  late final List<Animation<Offset>> _slideAnims;

  static const _pageCount = 4;

  @override
  void initState() {
    super.initState();

    _slideControllers = List.generate(
      _pageCount,
      (_) => AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 600),
      ),
    );

    _fadeAnims = _slideControllers
        .map(
          (c) => CurvedAnimation(parent: c, curve: Curves.easeOut),
        )
        .toList();

    _slideAnims = _slideControllers
        .map(
          (c) => Tween<Offset>(
            begin: const Offset(0, 0.18),
            end: Offset.zero,
          ).animate(CurvedAnimation(parent: c, curve: Curves.easeOutCubic)),
        )
        .toList();

    // Animate first slide in
    _slideControllers[0].forward();
  }

  @override
  void dispose() {
    _pageController.dispose();
    for (final c in _slideControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _onPageChanged(int page) {
    setState(() => _currentPage = page);
    _slideControllers[page].forward(from: 0);
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(AppConstants.onboardingCompleteKey, true);
    if (mounted) context.go(AppRoutes.login);
  }

  void _next() {
    if (_currentPage < _pageCount - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 380),
        curve: Curves.easeInOutCubic,
      );
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Sliding pages
          PageView(
            controller: _pageController,
            onPageChanged: _onPageChanged,
            children: [
              _SlidePage(
                fade: _fadeAnims[0],
                slide: _slideAnims[0],
                child: const _SlideWelcome(),
              ),
              _SlidePage(
                fade: _fadeAnims[1],
                slide: _slideAnims[1],
                child: const _SlideServices(),
              ),
              _SlidePage(
                fade: _fadeAnims[2],
                slide: _slideAnims[2],
                child: const _SlideEarnings(),
              ),
              _SlidePage(
                fade: _fadeAnims[3],
                slide: _slideAnims[3],
                child: const _SlideSafety(),
              ),
            ],
          ),

          // Skip button (top right)
          if (_currentPage < _pageCount - 1)
            SafeArea(
              child: Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: const EdgeInsets.all(AppConstants.spacingM),
                  child: TextButton(
                    onPressed: _finish,
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white70,
                    ),
                    child: const Text(
                      'Saltar',
                      style: TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                ),
              ),
            ),

          // Bottom controls
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _BottomControls(
              currentPage: _currentPage,
              pageCount: _pageCount,
              isLast: _currentPage == _pageCount - 1,
              onNext: _next,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Page wrapper ─────────────────────────────────────────────────────────────

class _SlidePage extends StatelessWidget {
  const _SlidePage({
    required this.fade,
    required this.slide,
    required this.child,
  });

  final Animation<double> fade;
  final Animation<Offset> slide;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: fade,
      child: SlideTransition(
        position: slide,
        child: child,
      ),
    );
  }
}

// ── Bottom controls ──────────────────────────────────────────────────────────

class _BottomControls extends StatelessWidget {
  const _BottomControls({
    required this.currentPage,
    required this.pageCount,
    required this.isLast,
    required this.onNext,
  });

  final int currentPage;
  final int pageCount;
  final bool isLast;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: AppConstants.spacingL,
        right: AppConstants.spacingL,
        bottom: MediaQuery.of(context).padding.bottom + AppConstants.spacingL,
        top: AppConstants.spacingL,
      ),
      child: Row(
        children: [
          // Page dots
          Row(
            children: List.generate(
              pageCount,
              (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                margin: const EdgeInsets.only(right: 6),
                width: i == currentPage ? 24 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: i == currentPage
                      ? Colors.white
                      : Colors.white.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
          ),
          const Spacer(),
          // CTA button
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            child: ElevatedButton(
              onPressed: onNext,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: AppColors.primaryDim,
                minimumSize: Size(isLast ? 200 : 56, 52),
                shape: RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusCircular),
                ),
                padding: EdgeInsets.symmetric(
                  horizontal:
                      isLast ? AppConstants.spacingL : AppConstants.spacingM,
                ),
                elevation: 0,
              ),
              child: isLast
                  ? const Text(
                      'Comenzar',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    )
                  : const Icon(Icons.arrow_forward_rounded, size: 22),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Slide 1: Bienvenido ──────────────────────────────────────────────────────

class _SlideWelcome extends StatefulWidget {
  const _SlideWelcome();

  @override
  State<_SlideWelcome> createState() => _SlideWelcomeState();
}

class _SlideWelcomeState extends State<_SlideWelcome>
    with SingleTickerProviderStateMixin {
  late final AnimationController _logoCtrl;
  late final Animation<double> _logoScale;

  @override
  void initState() {
    super.initState();
    _logoCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..forward();
    _logoScale = CurvedAnimation(
      parent: _logoCtrl,
      curve: Curves.elasticOut,
    );
  }

  @override
  void dispose() {
    _logoCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF003D1F), Color(0xFF00C853)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppConstants.spacingL,
            AppConstants.spacingXXL,
            AppConstants.spacingL,
            120,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ScaleTransition(
                scale: _logoScale,
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(32),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.2),
                        blurRadius: 32,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.two_wheeler_rounded,
                      size: 64,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 40),
              const Text(
                'Bienvenido a\nNexum Driver',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
              const Text(
                'Tu plataforma de transporte y domicilios\nen Pamplona, Norte de Santander.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Slide 2: Tipos de servicio ───────────────────────────────────────────────

class _SlideServices extends StatefulWidget {
  const _SlideServices();

  @override
  State<_SlideServices> createState() => _SlideServicesState();
}

class _SlideServicesState extends State<_SlideServices>
    with SingleTickerProviderStateMixin {
  late final AnimationController _staggerCtrl;

  @override
  void initState() {
    super.initState();
    _staggerCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..forward();
  }

  @override
  void dispose() {
    _staggerCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF0D1B4B), Color(0xFF1565C0)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppConstants.spacingL,
            AppConstants.spacingXXL,
            AppConstants.spacingL,
            120,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.grid_view_rounded,
                size: 56,
                color: Colors.white,
              ),
              const SizedBox(height: AppConstants.spacingL),
              const Text(
                '5 tipos de servicio',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppConstants.spacingS),
              const Text(
                'Escoge el que mejor se adapta\na tu vehículo y horario.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 15,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: AppConstants.spacingXL),
              Wrap(
                spacing: AppConstants.spacingS,
                runSpacing: AppConstants.spacingS,
                alignment: WrapAlignment.center,
                children: ServiceType.values.asMap().entries.map((e) {
                  final delay = e.key * 0.15;
                  final anim = CurvedAnimation(
                    parent: _staggerCtrl,
                    curve: Interval(delay, delay + 0.4,
                        curve: Curves.easeOutBack),
                  );
                  return ScaleTransition(
                    scale: anim,
                    child: _ServiceBadge(type: e.value),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceBadge extends StatelessWidget {
  const _ServiceBadge({required this.type});
  final ServiceType type;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppConstants.spacingM,
        vertical: AppConstants.spacingS,
      ),
      decoration: BoxDecoration(
        color: type.color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
        border: Border.all(
          color: type.color.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(type.icon, size: 18, color: type.color),
          const SizedBox(width: 6),
          Text(
            type.displayName,
            style: TextStyle(
              color: type.color,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Slide 3: Ganancias ───────────────────────────────────────────────────────

class _SlideEarnings extends StatefulWidget {
  const _SlideEarnings();

  @override
  State<_SlideEarnings> createState() => _SlideEarningsState();
}

class _SlideEarningsState extends State<_SlideEarnings>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _counter;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..forward();
    _counter = Tween<double>(begin: 0, end: 892000).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOutExpo),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1A0533), Color(0xFF6A1B9A)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppConstants.spacingL,
            AppConstants.spacingXXL,
            AppConstants.spacingL,
            120,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
                ),
                child: const Icon(
                  Icons.trending_up_rounded,
                  size: 44,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: AppConstants.spacingL),
              const Text(
                'Gana más cada día',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
              // Animated earnings counter
              AnimatedBuilder(
                animation: _counter,
                builder: (context, _) {
                  final value = _counter.value;
                  return Text(
                    '\$${value.round().toString().replaceAllMapped(
                          RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
                          (m) => '${m[1]}.',
                        )}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1,
                    ),
                  );
                },
              ),
              const Text(
                'ganado por un conductor este mes',
                style: TextStyle(color: Colors.white60, fontSize: 13),
              ),
              const SizedBox(height: AppConstants.spacingXL),
              Row(
                children: [
                  _EarningFeature(
                    icon: Icons.bolt_rounded,
                    title: 'Bonos de pico',
                    subtitle: 'x1.5 en horas de mayor demanda',
                  ),
                  const SizedBox(width: AppConstants.spacingM),
                  _EarningFeature(
                    icon: Icons.emoji_events_rounded,
                    title: 'Retos semanales',
                    subtitle: 'Premios por metas completadas',
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EarningFeature extends StatelessWidget {
  const _EarningFeature({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.2),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: Colors.amber, size: 24),
            const SizedBox(height: AppConstants.spacingS),
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: 11,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Slide 4: Seguridad ───────────────────────────────────────────────────────

class _SlideSafety extends StatefulWidget {
  const _SlideSafety();

  @override
  State<_SlideSafety> createState() => _SlideSafetyState();
}

class _SlideSafetyState extends State<_SlideSafety>
    with SingleTickerProviderStateMixin {
  late final AnimationController _checkCtrl;
  late final Animation<double> _checkScale;
  late final Animation<double> _checkOpacity;

  @override
  void initState() {
    super.initState();
    _checkCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward();
    _checkScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _checkCtrl, curve: Curves.elasticOut),
    );
    _checkOpacity = CurvedAnimation(
      parent: _checkCtrl,
      curve: const Interval(0, 0.4, curve: Curves.easeIn),
    );
  }

  @override
  void dispose() {
    _checkCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF003D1F), Color(0xFF00C853)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppConstants.spacingL,
            AppConstants.spacingXXL,
            AppConstants.spacingL,
            120,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FadeTransition(
                opacity: _checkOpacity,
                child: ScaleTransition(
                  scale: _checkScale,
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.2),
                          blurRadius: 24,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.check_circle_rounded,
                      size: 60,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 36),
              const Text(
                '¡Todo listo!',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: AppConstants.spacingM),
              const Text(
                'Conduce con seguridad, gana con libertad.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: AppConstants.spacingXL),
              ..._features.map(
                (f) => Padding(
                  padding:
                      const EdgeInsets.only(bottom: AppConstants.spacingS),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(
                              AppConstants.radiusMedium),
                        ),
                        child: Icon(f.$1, color: Colors.white, size: 18),
                      ),
                      const SizedBox(width: AppConstants.spacingM),
                      Expanded(
                        child: Text(
                          f.$2,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _features = [
  (Icons.shield_rounded, 'Botón SOS de emergencia siempre disponible'),
  (Icons.star_rounded, 'Sistema de calificaciones transparente'),
  (Icons.payments_rounded, 'Pagos diarios directos a tu billetera'),
  (Icons.support_agent_rounded, 'Soporte disponible 7 días a la semana'),
];
