import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';

/// Conjunto de modos de trabajo que el conductor tiene habilitados a la vez.
///
/// El conductor puede recibir simultáneamente varias categorías (pasajero,
/// pedido/domicilio, paquete/envío, mandado) y aceptar lo que le convenga.
final selectedWorkModesProvider =
    StateProvider<Set<WorkMode>>((ref) => {WorkMode.pasajero});

/// Modo "primario" (el primero habilitado), para los consumidores que aún
/// trabajan con un único valor (estimación de tarifa, viaje activo).
final selectedWorkModeProvider = Provider<WorkMode>((ref) {
  final modes = ref.watch(selectedWorkModesProvider);
  return modes.isEmpty ? WorkMode.pasajero : modes.first;
});
