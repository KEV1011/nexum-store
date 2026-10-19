/// Suelta de la MEMORIA todo lo que es del conductor que cerró sesión.
///
/// Borrar lo guardado en el teléfono (`datos_de_cuenta.dart`) no basta: los
/// proveedores que ya lo cargaron siguen vivos mientras la app esté abierta, y
/// el siguiente conductor en ese teléfono vería los viajes, las ganancias, la
/// billetera y el perfil del anterior. Invalidarlos los obliga a nacer de nuevo.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/siguiente_viaje_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/service_prefs_provider.dart';
import 'package:nexum_driver/features/earnings/presentation/providers/earnings_breakdown_provider.dart';
import 'package:nexum_driver/features/intercity/presentation/providers/intercity_driver_provider.dart';
import 'package:nexum_driver/features/notifications/presentation/providers/notification_provider.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/pooled_driver_provider.dart';
import 'package:nexum_driver/features/pro/presentation/providers/pro_status_provider.dart';
import 'package:nexum_driver/features/profile/presentation/providers/editable_profile_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_kyc_provider.dart';
import 'package:nexum_driver/features/profile_verification/presentation/providers/driver_profile_provider.dart';
import 'package:nexum_driver/features/ride_pool/presentation/providers/ride_pool_provider.dart';
import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';
import 'package:nexum_driver/features/wallet/presentation/providers/wallet_provider.dart';

void soltarDatosDeCuenta(Ref ref) {
  ref
    ..invalidate(tripHistoryProvider)
    ..invalidate(earningsBreakdownProvider)
    ..invalidate(walletProvider)
    ..invalidate(driverProfileProvider)
    ..invalidate(editableProfileProvider)
    ..invalidate(driverKycProvider)
    ..invalidate(proStatusProvider)
    ..invalidate(servicePrefsProvider)
    ..invalidate(pooledDriverProvider)
    ..invalidate(intercityDriverProvider)
    ..invalidate(ridePoolProvider)
    ..invalidate(activeTripProvider)
    ..invalidate(siguienteViajeProvider)
    ..invalidate(notificationProvider)
    ..invalidate(driverStatusProvider);
}
