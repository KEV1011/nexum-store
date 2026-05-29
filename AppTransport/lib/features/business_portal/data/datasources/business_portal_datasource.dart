import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_order_entity.dart';

/// Fuente de datos mock del portal de negocios.
///
/// Simula el historial de pedidos del día para un negocio/restaurante.
/// En producción consultaría el backend real con autenticación del negocio.
class BusinessPortalDataSource {
  /// Retorna los pedidos del día para [businessId].
  Future<List<BusinessOrderEntity>> fetchTodayOrders(
    String businessId,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return _mockOrders();
  }

  /// Retorna el detalle de un pedido específico.
  Future<BusinessOrderEntity> fetchOrderDetail(String orderId) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return _mockOrders().firstWhere((o) => o.id == orderId);
  }

  // ── Mock data ─────────────────────────────────────────────────────────────

  List<BusinessOrderEntity> _mockOrders() {
    final now = DateTime.now();

    // Rutas de foto de ejemplo. En el mock no existen los archivos físicos,
    // así que el visor cae con elegancia al ícono de cámara; lo importante
    // es que `pickupPhotoPath != null` marque la cadena como verificada.
    const pickupPhoto = '/mock/pickup_proof.jpg';
    const deliveryPhoto = '/mock/delivery_proof.jpg';

    return [
      // ── Pedido entregado · cadena completa (firma) ──────────────────────
      BusinessOrderEntity(
        id: 'order_001',
        orderRef: '#4521',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'María González',
        customerAddress: 'Cra. 5 #12-34, Barrio San Francisco',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(
          const Duration(hours: 3, minutes: 15),
        ),
        pickedUpAt: now.subtract(const Duration(hours: 3)),
        deliveredAt: now.subtract(
          const Duration(hours: 2, minutes: 42),
        ),
        pickupPhotoPath: pickupPhoto,
        hasSignature: true,
        grossFare: 8500,
        driverName: 'Carlos Ruiz',
        driverPhone: '+57 310 555 0101',
      ),

      // ── Pedido entregado · cadena completa (foto entrega) ───────────────
      BusinessOrderEntity(
        id: 'order_002',
        orderRef: '#4522',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'Andrés Pérez',
        customerAddress: 'Calle 9 #6-21, Centro',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(const Duration(hours: 2, minutes: 45)),
        pickedUpAt: now.subtract(const Duration(hours: 2, minutes: 30)),
        deliveredAt: now.subtract(const Duration(hours: 2, minutes: 5)),
        pickupPhotoPath: pickupPhoto,
        deliveryPhotoPath: deliveryPhoto,
        grossFare: 7200,
        driverName: 'José Ramírez',
        driverPhone: '+57 311 555 0202',
      ),

      // ── Pedido en tránsito · foto de recogida confirmada ────────────────
      BusinessOrderEntity(
        id: 'order_003',
        orderRef: '#4523',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'Luisa Martínez',
        customerAddress: 'Cra. 8 #15-67, Barrio El Buque',
        status: BusinessOrderStatus.inTransit,
        createdAt: now.subtract(const Duration(minutes: 35)),
        pickedUpAt: now.subtract(const Duration(minutes: 20)),
        pickupPhotoPath: pickupPhoto,
        grossFare: 6800,
        driverName: 'Pedro Torres',
        driverPhone: '+57 312 555 0303',
      ),

      // ── Pedido en camino al local (conductor llegando) ───────────────────
      BusinessOrderEntity(
        id: 'order_004',
        orderRef: '#4524',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'Carlos Hernández',
        customerAddress: 'Universidad de Pamplona, Residencias',
        status: BusinessOrderStatus.pending,
        createdAt: now.subtract(const Duration(minutes: 8)),
        grossFare: 9100,
        driverName: 'María López',
        driverPhone: '+57 313 555 0404',
      ),

      // ── Pedido entregado · cadena parcial (sin foto de recogida) ────────
      // Este escenario muestra la limitación del viejo sistema (Rappi).
      BusinessOrderEntity(
        id: 'order_005',
        orderRef: '#4519',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'Elena Castro',
        customerAddress: 'Calle 5 #3-18, Barrio Cariongo',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(const Duration(hours: 4, minutes: 20)),
        pickedUpAt: now.subtract(const Duration(hours: 4, minutes: 5)),
        deliveredAt: now.subtract(
          const Duration(hours: 3, minutes: 38),
        ),
        hasSignature: true,
        grossFare: 7800,
        driverName: 'Luis Vargas',
        driverPhone: '+57 314 555 0505',
      ),

      // ── Pedido entregado temprano · cadena completa ──────────────────────
      BusinessOrderEntity(
        id: 'order_006',
        orderRef: '#4518',
        businessName: 'Restaurante El Sabor Pamplonés',
        customerName: 'Roberto Díaz',
        customerAddress: 'Cra. 3 #8-44, Barrio Ciudad Jardín',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(const Duration(hours: 5, minutes: 30)),
        pickedUpAt: now.subtract(const Duration(hours: 5, minutes: 15)),
        deliveredAt: now.subtract(const Duration(hours: 4, minutes: 50)),
        pickupPhotoPath: pickupPhoto,
        hasSignature: true,
        grossFare: 8200,
        driverName: 'Sandra Mora',
        driverPhone: '+57 315 555 0606',
      ),
    ];
  }
}
