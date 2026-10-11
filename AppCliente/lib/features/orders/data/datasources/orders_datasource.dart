import 'dart:convert';

import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fuente de datos de pedidos: cache local en SharedPreferences. El primer
/// arranque devuelve una lista vacía (nada de pedidos de demostración); la
/// verdad viene del backend vía GET /client/orders en el provider.
class OrdersDataSource {
  Future<List<CustomerOrderEntity>> fetchOrderHistory() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(AppConstants.ordersStorageKey);
    if (raw != null) {
      try {
        final list = jsonDecode(raw) as List;
        // PEDIDO A PEDIDO, no la lista entera.
        //
        // Antes el `map` iba dentro de este `try`: un solo pedido que no se
        // pudiera leer descartaba el historial COMPLETO del usuario. Y es un
        // caso real, no teórico: esta caché la escribió una versión ANTERIOR
        // de la app con su `toJson`, así que en cuanto el parser pase a
        // exigir un campo que entonces no se guardaba, todo el mundo pierde
        // su historial al actualizar. `fromJson` ya se protegía de eso para
        // el ESTADO —con su `orElse`— pero cualquier otro campo seguía
        // teniendo el mismo poder.
        //
        // Ahora el peor caso es perder UN pedido, que es información que de
        // todas formas no se podía leer.
        final salida = <CustomerOrderEntity>[];
        for (final j in list) {
          try {
            if (j is! Map<String, dynamic>) continue;
            final o = CustomerOrderEntity.fromJson(j);
            // Purga los pedidos semilla que versiones anteriores persistían.
            if (o.id == 'ord-9001' || o.id == 'ord-9000') continue;
            salida.add(o);
          } catch (_) {
            // Ese pedido no se puede leer; los demás sí.
          }
        }
        return salida;
      } catch (_) {
        // El JSON entero está corrupto: ahí sí no hay nada que rescatar.
      }
    }
    return const [];
  }

  Future<void> saveOrders(List<CustomerOrderEntity> orders) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.ordersStorageKey,
      jsonEncode(orders.map((o) => o.toJson()).toList()),
    );
  }

}
