import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Índice activo del tab del HomeShell.
/// Permite que cualquier pantalla navegue a un tab sin callbacks ni
/// InheritedWidgets.
final shellTabProvider = StateProvider<int>((ref) => 0);
