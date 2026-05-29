import 'dart:convert';

import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Fuente de datos de pedidos: carga desde SharedPreferences y cae en
/// datos mock en el primer arranque.
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
            .toList();
      } catch (_) {
        // JSON corrupto: ignorar y usar mock
      }
    }
    // Primer arranque: sembrar con historial de demo
    await Future<void>.delayed(const Duration(milliseconds: 600));
    final mock = _buildMockHistory();
    await saveOrders(mock);
    return mock;
  }

  Future<void> saveOrders(List<CustomerOrderEntity> orders) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.ordersStorageKey,
      jsonEncode(orders.map((o) => o.toJson()).toList()),
    );
  }

  // ── Mock de primer arranque ───────────────────────────────────────────────

  static List<CustomerOrderEntity> _buildMockHistory() {
    final now = DateTime.now();
    return [
      CustomerOrderEntity(
        id: 'ord-9001',
        orderRef: 'NX-9001',
        businessName: 'Pizzería Don Lucho',
        businessAddress: 'Cra. 5 #9-18, Centro',
        deliveryAddress: 'Calle 6 #2-30, Barrio Belén',
        status: CustomerOrderStatus.delivered,
        lines: const [
          OrderLineEntity(
            productName: 'Pizza familiar mixta',
            quantity: 1,
            unitPrice: 38000,
          ),
          OrderLineEntity(
            productName: 'Gaseosa 1.5L',
            quantity: 1,
            unitPrice: 6000,
          ),
        ],
        subtotal: 44000,
        deliveryFee: 3500,
        createdAt: now.subtract(const Duration(days: 2, hours: 3)),
        driverName: 'Carlos Jaimes',
        driverPhone: '+57 312 555 1020',
        pickedUpAt: now.subtract(
          const Duration(days: 2, hours: 2, minutes: 45),
        ),
        deliveredAt: now.subtract(
          const Duration(days: 2, hours: 2, minutes: 20),
        ),
        pickupPhotoPath: 'assets://pickup/9001',
        deliveryPhotoPath: 'assets://delivery/9001',
        hasSignature: true,
      ),
      CustomerOrderEntity(
        id: 'ord-9000',
        orderRef: 'NX-9000',
        businessName: 'Droguería San Juan',
        businessAddress: 'Calle 7 #5-12, Centro',
        deliveryAddress: 'Calle 6 #2-30, Barrio Belén',
        status: CustomerOrderStatus.delivered,
        lines: const [
          OrderLineEntity(
            productName: 'Acetaminofén 500mg x10',
            quantity: 2,
            unitPrice: 4500,
          ),
          OrderLineEntity(
            productName: 'Termómetro digital',
            quantity: 1,
            unitPrice: 22000,
          ),
        ],
        subtotal: 31000,
        deliveryFee: 3000,
        createdAt: now.subtract(const Duration(days: 6, hours: 1)),
        driverName: 'María Fernanda Ortiz',
        driverPhone: '+57 311 444 8890',
        pickedUpAt: now.subtract(const Duration(days: 6, minutes: 50)),
        deliveredAt: now.subtract(const Duration(days: 6, minutes: 28)),
        pickupPhotoPath: 'assets://pickup/9000',
        deliveryPhotoPath: 'assets://delivery/9000',
      ),
    ];
  }
}
