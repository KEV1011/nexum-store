/// Suelta de la MEMORIA todo lo que es de la cuenta que se fue.
///
/// Borrar lo guardado en el teléfono (`datos_de_cuenta.dart`) no basta: los
/// proveedores que ya lo leyeron siguen vivos mientras la app esté abierta, y
/// quien entra con otra cuenta en la misma sesión vería igual los envíos, los
/// pedidos y las direcciones de la anterior. Invalidarlos los obliga a nacer
/// de nuevo, ya con lo de la cuenta nueva.
///
/// `datos_de_cuenta_test.dart` exige que todo proveedor que no se descarta
/// solo (`autoDispose`) y guarda algo de la persona esté en esta lista.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/account/presentation/providers/client_kyc_provider.dart';
import 'package:nexum_client/features/account/presentation/providers/client_profile_provider.dart';
import 'package:nexum_client/features/account/presentation/screens/payment_methods_screen.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/providers/favorites_provider.dart';
import 'package:nexum_client/features/cart/presentation/providers/cart_provider.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';
import 'package:nexum_client/features/intercity/presentation/providers/intercity_provider.dart';
import 'package:nexum_client/features/orders/presentation/providers/orders_provider.dart';
import 'package:nexum_client/features/payments/presentation/providers/payment_method_provider.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/providers/ride_negotiation_provider.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';
import 'package:nexum_client/features/shell/presentation/providers/shell_provider.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/shared/providers/origen_sugerido_provider.dart';

void soltarDatosDeCuenta(Ref ref) {
  ref
    ..invalidate(transportProvider)
    ..invalidate(tripHistoryProvider)
    ..invalidate(ordersProvider)
    ..invalidate(errandProvider)
    ..invalidate(intercityProvider)
    ..invalidate(pooledProvider)
    ..invalidate(rideNegotiationProvider)
    ..invalidate(addressesProvider)
    ..invalidate(favoritesProvider)
    ..invalidate(cartProvider)
    ..invalidate(metodoPagoProvider)
    ..invalidate(payMethodProvider)
    ..invalidate(clientProfileProvider)
    ..invalidate(clientKycProvider)
    ..invalidate(trustedContactProvider)
    ..invalidate(origenSugeridoProvider)
    ..invalidate(shellTabProvider);
}
