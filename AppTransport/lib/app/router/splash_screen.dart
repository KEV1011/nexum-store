import 'package:flutter/material.dart';

/// Pantalla de carga inicial con animación de entrada.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;
  late final Animation<double> _fadeTitle;
  late final Animation<double> _fadeDot;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..forward();

    _scale = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.0, 0.5, curve: Curves.elasticOut),
    );

    _fadeTitle = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.35, 0.7, curve: Curves.easeOut),
    );

    _fadeDot = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.6, 1.0, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          // Pizarra oscura (identidad del conductor), igual que el ícono y el
          // splash nativo — la variante oscura de ZIPA.
          gradient: LinearGradient(
            colors: [Color(0xFF141B18), Color(0xFF0B0F0E), Color(0xFF060908)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            stops: [0.0, 0.55, 1.0],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Marca ZIPA (Zip-Pin + wordmark).
                ScaleTransition(
                  scale: _scale,
                  child: Image.asset(
                    'assets/icons/splash_logo.png',
                    width: 176,
                    height: 210,
                    fit: BoxFit.contain,
                  ),
                ),
                const SizedBox(height: 20),

                // Subtítulo de la app del conductor
                FadeTransition(
                  opacity: _fadeTitle,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.3),
                      end: Offset.zero,
                    ).animate(_fadeTitle),
                    child: const Text(
                      'CONDUCTOR',
                      style: TextStyle(
                        color: Color(0xFF12C892),
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 10,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 56),

                // Loading indicator
                FadeTransition(
                  opacity: _fadeDot,
                  child: const _PulseDots(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PulseDots extends StatefulWidget {
  const _PulseDots();

  @override
  State<_PulseDots> createState() => _PulseDotsState();
}

class _PulseDotsState extends State<_PulseDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        final delay = i * 0.25;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 5),
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              final t = ((_ctrl.value - delay) % 1.0).clamp(0.0, 1.0);
              final opacity = (t < 0.5 ? t * 2 : (1 - t) * 2).clamp(0.3, 1.0);
              return Opacity(
                opacity: opacity,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              );
            },
          ),
        );
      }),
    );
  }
}
