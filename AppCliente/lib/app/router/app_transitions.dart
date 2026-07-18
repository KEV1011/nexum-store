import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Transiciones de página para la app ZIPA Cliente.
abstract final class AppTransitions {
  /// Slide desde abajo + fade — para pantallas secundarias (push).
  static Page<T> slideUp<T>({
    required LocalKey pageKey,
    required Widget child,
  }) {
    return CustomTransitionPage<T>(
      key: pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 320),
      reverseTransitionDuration: const Duration(milliseconds: 260),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final curvedAnimation = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.06),
            end: Offset.zero,
          ).animate(curvedAnimation),
          child: FadeTransition(
            opacity: Tween<double>(begin: 0, end: 1).animate(
              CurvedAnimation(
                parent: animation,
                curve: const Interval(0, 0.7, curve: Curves.easeOut),
              ),
            ),
            child: child,
          ),
        );
      },
    );
  }

  /// Slide lateral — para navegación tipo push.
  static Page<T> slideLeft<T>({
    required LocalKey pageKey,
    required Widget child,
  }) {
    return CustomTransitionPage<T>(
      key: pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 280),
      reverseTransitionDuration: const Duration(milliseconds: 240),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final curvedAnim = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(1, 0),
            end: Offset.zero,
          ).animate(curvedAnim),
          child: child,
        );
      },
    );
  }

  /// Fade suave — para el splash y reemplazos de ruta raíz.
  static Page<T> fade<T>({
    required LocalKey pageKey,
    required Widget child,
  }) {
    return CustomTransitionPage<T>(
      key: pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 400),
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: CurvedAnimation(
            parent: animation,
            curve: Curves.easeIn,
          ),
          child: child,
        );
      },
    );
  }
}
