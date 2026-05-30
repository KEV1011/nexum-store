import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/domain/work_mode.dart';

/// Modo de trabajo actualmente seleccionado por el conductor.
final selectedWorkModeProvider =
    StateProvider<WorkMode>((ref) => WorkMode.pasajero);
