import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/mesa/data/mesa_api.dart';

/// La API de la mesa sobre el MISMO cliente HTTP de la app: si hay sesión,
/// su interceptor pone el token y el pedido queda en la cuenta del cliente.
final mesaApiProvider = Provider<MesaApi>(
  (ref) => MesaApi(ref.watch(apiClientProvider)),
);
