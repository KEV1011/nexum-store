import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';

/// Fuente de datos mock del historial de pedidos del cliente.
///
/// En producción consultaría el backend: GET /customers/me/orders
class OrdersDataSource {
  Future<List<CustomerOrderEntity>> fetchOrderHistory() async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return _mockHistory;
  }

  static final DateTime _now = DateTime.now();

  static final List<CustomerOrderEntity> _mockHistory = [
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
      createdAt: _now.subtract(const Duration(days: 2, hours: 3)),
      driverName: 'Carlos Jaimes',
      driverPhone: '+57 312 555 1020',
      pickedUpAt: _now.subtract(const Duration(days: 2, hours: 2, minutes: 45)),
      deliveredAt: _now.subtract(
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
      createdAt: _now.subtract(const Duration(days: 6, hours: 1)),
      driverName: 'María Fernanda Ortiz',
      driverPhone: '+57 311 444 8890',
      pickedUpAt: _now.subtract(const Duration(days: 6, minutes: 50)),
      deliveredAt: _now.subtract(const Duration(days: 6, minutes: 28)),
      pickupPhotoPath: 'assets://pickup/9000',
      deliveryPhotoPath: 'assets://delivery/9000',
    ),
  ];
}
