import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_earnings_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_order_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_product_entity.dart';

/// Fuente de datos del portal de negocios (mock + futura integración REST).
class BusinessPortalDataSource {
  const BusinessPortalDataSource();

  // ── Orders ─────────────────────────────────────────────────────────────────

  Future<List<BusinessOrderEntity>> fetchTodayOrders(String businessId) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return _mockOrders();
  }

  Future<BusinessOrderEntity> fetchOrderDetail(String orderId) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    return _mockOrders().firstWhere((o) => o.id == orderId);
  }

  /// Returns the pending incoming order (if any) waiting for acceptance.
  Future<BusinessOrderEntity?> fetchIncomingOrder(String businessId) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    // Simulate an incoming order arriving every ~30 s in mock mode.
    final second = DateTime.now().second;
    if (second < 30) return _mockIncomingOrder();
    return null;
  }

  Future<void> acceptOrder(String orderId, int prepMinutes) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
  }

  Future<void> rejectOrder(String orderId, String reason) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
  }

  // ── Products ───────────────────────────────────────────────────────────────

  Future<List<BusinessProductEntity>> fetchProducts(String businessId) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return _mockProducts();
  }

  Future<void> toggleProductAvailability(
    String productId,
    bool isAvailable,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }

  Future<void> updateProductPrice(String productId, double price) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }

  // ── Earnings ───────────────────────────────────────────────────────────────

  Future<BusinessEarningsEntity> fetchEarnings(
    String businessId,
    EarningsPeriod period,
  ) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    return _mockEarnings(period);
  }

  // ── Business settings ──────────────────────────────────────────────────────

  Future<BusinessSettings> fetchSettings(String businessId) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return const BusinessSettings(
      name: 'Supermercado La Economía',
      category: 'Supermercado',
      address: 'Cra. 6 #8-45, Centro, Pamplona',
      whatsappNumber: '+57 310 123 4567',
      defaultPrepMinutes: 15,
      rating: 4.8,
      isOpen: true,
      openHour: 7,
      closeHour: 21,
    );
  }

  Future<void> saveSettings(BusinessSettings settings) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
  }

  // ── Mock data ──────────────────────────────────────────────────────────────

  BusinessOrderEntity _mockIncomingOrder() {
    return BusinessOrderEntity(
      id: 'incoming_001',
      orderRef: '#4525',
      businessName: 'Supermercado La Economía',
      customerName: 'Santiago Rueda',
      customerAddress: 'Cra. 9 #14-22, Barrio El Llano',
      status: BusinessOrderStatus.pending,
      createdAt: DateTime.now(),
      grossFare: 11500,
    );
  }

  List<BusinessOrderEntity> _mockOrders() {
    final now = DateTime.now();
    const pickupPhoto = '/mock/pickup_proof.jpg';
    const deliveryPhoto = '/mock/delivery_proof.jpg';

    return [
      BusinessOrderEntity(
        id: 'order_001',
        orderRef: '#4521',
        businessName: 'Supermercado La Economía',
        customerName: 'María González',
        customerAddress: 'Cra. 5 #12-34, Barrio San Francisco',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(const Duration(hours: 3, minutes: 15)),
        pickedUpAt: now.subtract(const Duration(hours: 3)),
        deliveredAt: now.subtract(const Duration(hours: 2, minutes: 42)),
        pickupPhotoPath: pickupPhoto,
        hasSignature: true,
        grossFare: 8500,
        driverName: 'Carlos Ruiz',
        driverPhone: '+57 310 555 0101',
      ),
      BusinessOrderEntity(
        id: 'order_002',
        orderRef: '#4522',
        businessName: 'Supermercado La Economía',
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
      BusinessOrderEntity(
        id: 'order_003',
        orderRef: '#4523',
        businessName: 'Supermercado La Economía',
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
      BusinessOrderEntity(
        id: 'order_004',
        orderRef: '#4524',
        businessName: 'Supermercado La Economía',
        customerName: 'Carlos Hernández',
        customerAddress: 'Universidad de Pamplona, Residencias',
        status: BusinessOrderStatus.atPickup,
        createdAt: now.subtract(const Duration(minutes: 8)),
        grossFare: 9100,
        driverName: 'María López',
        driverPhone: '+57 313 555 0404',
      ),
      BusinessOrderEntity(
        id: 'order_005',
        orderRef: '#4519',
        businessName: 'Supermercado La Economía',
        customerName: 'Elena Castro',
        customerAddress: 'Calle 5 #3-18, Barrio Cariongo',
        status: BusinessOrderStatus.delivered,
        createdAt: now.subtract(const Duration(hours: 4, minutes: 20)),
        pickedUpAt: now.subtract(const Duration(hours: 4, minutes: 5)),
        deliveredAt: now.subtract(const Duration(hours: 3, minutes: 38)),
        hasSignature: true,
        grossFare: 7800,
        driverName: 'Luis Vargas',
        driverPhone: '+57 314 555 0505',
      ),
      BusinessOrderEntity(
        id: 'order_006',
        orderRef: '#4518',
        businessName: 'Supermercado La Economía',
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

  List<BusinessProductEntity> _mockProducts() {
    // Productos de supermercado/farmacia con código de barras y stock,
    // espejo del catálogo maestro. Demuestra el flujo de escáner EAN-13.
    return const [
      BusinessProductEntity(
        id: 'p-001',
        name: 'Coca-Cola Original 1.5L',
        price: 4500,
        category: 'Bebidas',
        isAvailable: true,
        barcode: '7702004003508',
        masterProductId: 'mp-1',
        stock: 48,
      ),
      BusinessProductEntity(
        id: 'p-002',
        name: 'Agua Cristal sin gas 600ml',
        price: 2000,
        category: 'Bebidas',
        isAvailable: true,
        barcode: '7702090038323',
        masterProductId: 'mp-2',
        stock: 120,
      ),
      BusinessProductEntity(
        id: 'p-003',
        name: 'Arroz Diana x 500g',
        price: 2800,
        category: 'Granos',
        isAvailable: true,
        barcode: '7702993000014',
        masterProductId: 'mp-5',
        stock: 60,
      ),
      BusinessProductEntity(
        id: 'p-004',
        name: 'Aceite Premier 1000ml',
        price: 9500,
        category: 'Aceites',
        isAvailable: true,
        barcode: '7702189070016',
        masterProductId: 'mp-6',
        stock: 24,
      ),
      BusinessProductEntity(
        id: 'p-005',
        name: 'Café Águila Roja 500g',
        price: 11000,
        category: 'Café',
        isAvailable: true,
        barcode: '7702025130016',
        masterProductId: 'mp-7',
        stock: 18,
      ),
      BusinessProductEntity(
        id: 'p-006',
        name: 'Papel Higiénico Familia x4',
        price: 6800,
        category: 'Aseo',
        isAvailable: true,
        barcode: '7702018201006',
        masterProductId: 'mp-11',
        stock: 3,
      ),
      BusinessProductEntity(
        id: 'p-007',
        name: 'Crema Dental Colgate 100ml',
        price: 4200,
        category: 'Aseo',
        isAvailable: true,
        barcode: '7702010001009',
        masterProductId: 'mp-12',
        stock: 30,
      ),
      BusinessProductEntity(
        id: 'p-008',
        name: 'Acetaminofén MK 500mg x10',
        price: 2500,
        category: 'Medicamentos',
        isAvailable: true,
        barcode: '7702057000019',
        masterProductId: 'mp-13',
        stock: 40,
      ),
      BusinessProductEntity(
        id: 'p-009',
        name: 'Suero Oral Pedialyte 500ml',
        price: 8900,
        category: 'Medicamentos',
        isAvailable: false,
        barcode: '7702132000017',
        masterProductId: 'mp-16',
        stock: 0,
      ),
      BusinessProductEntity(
        id: 'p-010',
        name: 'Amoxicilina 500mg x15',
        price: 7500,
        category: 'Medicamentos',
        isAvailable: true,
        barcode: '7702057111019',
        masterProductId: 'mp-17',
        stock: 12,
        requiresRx: true,
      ),
    ];
  }

  BusinessEarningsEntity _mockEarnings(EarningsPeriod period) {
    final now = DateTime.now();
    // Find next Sunday for weekly liquidation
    final daysUntilSunday = (7 - now.weekday) % 7;
    final nextLiq = now.add(Duration(days: daysUntilSunday == 0 ? 7 : daysUntilSunday));

    final (grossRevenue, orderCount, periodLabel) = switch (period) {
      EarningsPeriod.today => (51600.0, 6, 'Hoy'),
      EarningsPeriod.week => (312400.0, 38, 'Esta semana'),
      EarningsPeriod.month => (1248000.0, 147, 'Este mes'),
    };

    final commissionRate = AppConstants.businessCommissionRate;
    final orders = _mockOrderLines(period, commissionRate);

    return BusinessEarningsEntity(
      grossRevenue: grossRevenue,
      commissionDeducted: grossRevenue * commissionRate,
      netEarnings: grossRevenue * (1 - commissionRate),
      orderCount: orderCount,
      periodLabel: periodLabel,
      orders: orders,
      nextLiquidationDate: nextLiq,
    );
  }

  List<OrderEarningLine> _mockOrderLines(
    EarningsPeriod period,
    double commissionRate,
  ) {
    final now = DateTime.now();
    final baseOrders = [
      OrderEarningLine(
        orderRef: '#4521',
        grossFare: 8500,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(hours: 2, minutes: 42)),
        customerName: 'María González',
      ),
      OrderEarningLine(
        orderRef: '#4522',
        grossFare: 7200,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(hours: 2, minutes: 5)),
        customerName: 'Andrés Pérez',
      ),
      OrderEarningLine(
        orderRef: '#4519',
        grossFare: 7800,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(hours: 3, minutes: 38)),
        customerName: 'Elena Castro',
      ),
      OrderEarningLine(
        orderRef: '#4518',
        grossFare: 8200,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(hours: 4, minutes: 50)),
        customerName: 'Roberto Díaz',
      ),
    ];
    if (period == EarningsPeriod.today) return baseOrders;

    // Add extra lines for week/month context
    final extra = [
      OrderEarningLine(
        orderRef: '#4510',
        grossFare: 14200,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(days: 1, hours: 1)),
        customerName: 'Ayer — varios',
      ),
      OrderEarningLine(
        orderRef: '#4498',
        grossFare: 21300,
        commissionRate: commissionRate,
        completedAt: now.subtract(const Duration(days: 2)),
        customerName: 'Anteayer — varios',
      ),
    ];
    return [...baseOrders, ...extra];
  }
}

// ── Supporting types ──────────────────────────────────────────────────────────

enum EarningsPeriod { today, week, month }

class BusinessSettings {
  const BusinessSettings({
    required this.name,
    required this.category,
    required this.address,
    required this.whatsappNumber,
    required this.defaultPrepMinutes,
    required this.rating,
    required this.isOpen,
    required this.openHour,
    required this.closeHour,
  });

  final String name;
  final String category;
  final String address;
  final String whatsappNumber;
  final int defaultPrepMinutes;
  final double rating;
  final bool isOpen;
  final int openHour;
  final int closeHour;

  BusinessSettings copyWith({
    bool? isOpen,
    int? defaultPrepMinutes,
    String? whatsappNumber,
  }) =>
      BusinessSettings(
        name: name,
        category: category,
        address: address,
        whatsappNumber: whatsappNumber ?? this.whatsappNumber,
        defaultPrepMinutes: defaultPrepMinutes ?? this.defaultPrepMinutes,
        rating: rating,
        isOpen: isOpen ?? this.isOpen,
        openHour: openHour,
        closeHour: closeHour,
      );
}
