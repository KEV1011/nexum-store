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
        return list
            .map(
              (j) => CustomerOrderEntity.fromJson(j as Map<String, dynamic>),
            )
            // Purga los pedidos semilla que versiones anteriores persistían.
            .where((o) => o.id != 'ord-9001' && o.id != 'ord-9000')
            .toList();
      } catch (_) {
        // JSON corrupto: ignorar el cache.
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
