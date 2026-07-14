import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Vuelve atrás de forma segura.
///
/// Si la pantalla llegó con `context.go(...)` (o por deep-link) la pila está
/// vacía: un `context.pop()` ahí cierra la app en Android. Este helper hace
/// pop cuando SÍ hay a dónde volver y, si no, navega al [fallback].
void safeBack(BuildContext context, {String fallback = '/home'}) {
  if (context.canPop()) {
    context.pop();
  } else {
    context.go(fallback);
  }
}
