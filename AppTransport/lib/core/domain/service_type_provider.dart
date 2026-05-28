import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/domain/service_type.dart';

/// Tipo de servicio actualmente seleccionado por el conductor.
/// Compartido entre HomeScreen y ActiveTripScreen.
final selectedServiceTypeProvider =
    StateProvider<ServiceType>((ref) => ServiceType.moto);
