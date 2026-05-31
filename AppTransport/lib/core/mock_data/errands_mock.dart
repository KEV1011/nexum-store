import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';

/// Plantilla de mandado mock para simular solicitudes entrantes
/// cuando el conductor opera en modo Mandado.
class ErrandMockData {
  const ErrandMockData({
    required this.category,
    required this.description,
    required this.pickupAddress,
    required this.dropoffAddress,
    this.purchaseBudget,
    this.notes,
  });

  final ErrandCategory category;
  final String description;
  final String pickupAddress;
  final String dropoffAddress;
  final double? purchaseBudget;
  final String? notes;

  ErrandDetails toDetails() => ErrandDetails(
        category: category,
        description: description,
        purchaseBudget: purchaseBudget,
        notes: notes,
      );
}

/// Catálogo de mandados de ejemplo en Pamplona, Norte de Santander.
abstract final class ErrandsMock {
  static const List<ErrandMockData> errands = [
    ErrandMockData(
      category: ErrandCategory.pharmacy,
      description:
          'Comprar acetaminofén 500mg x10, alcohol antiséptico y una caja '
          'de curitas en la Farmatodo del centro.',
      pickupAddress: 'Farmatodo · Calle 5 con Carrera 6',
      dropoffAddress: 'Barrio Cariongo, Casa 12-34',
      purchaseBudget: 35000,
      notes: 'Si no hay acetaminofén, traer ibuprofeno.',
    ),
    ErrandMockData(
      category: ErrandCategory.groceries,
      description:
          'Mercado pequeño: 1 docena de huevos, 2 litros de leche, pan '
          'tajado y 1 libra de arroz en el Éxito.',
      pickupAddress: 'Éxito Pamplona · Av. Santander',
      dropoffAddress: 'Conjunto El Buque, Torre 3 Apto 502',
      purchaseBudget: 45000,
    ),
    ErrandMockData(
      category: ErrandCategory.documents,
      description:
          'Recoger un sobre con documentos donde mi mamá y traerlo a mi '
          'oficina. Ella ya lo tiene listo.',
      pickupAddress: 'Barrio Chapinero, Casa esquinera azul',
      dropoffAddress: 'Notaría Primera, Calle 6 #4-20',
      notes: 'Preguntar por la señora Rosa.',
    ),
    ErrandMockData(
      category: ErrandCategory.payments,
      description:
          'Pagar la factura de energía (CENS) en Efecty. Llevo el código '
          'de pago en la foto que envié al chat.',
      pickupAddress: 'Efecty · Carrera 5 #7-15',
      dropoffAddress: 'Barrio Sn Francisco, Casa 8-90',
      purchaseBudget: 120000,
      notes: 'Guardar el comprobante de pago.',
    ),
    ErrandMockData(
      category: ErrandCategory.food,
      description:
          'Recoger un almuerzo ejecutivo encargado donde Doña Rosa y '
          'llevarlo a la universidad.',
      pickupAddress: 'Restaurante Doña Rosa · Calle 4',
      dropoffAddress: 'Universidad de Pamplona, Bloque Jorge Gaitán',
      purchaseBudget: 18000,
    ),
    ErrandMockData(
      category: ErrandCategory.shopping,
      description:
          'Comprar un cargador tipo C y un protector de pantalla para '
          'iPhone en una tienda de tecnología del centro.',
      pickupAddress: 'Centro comercial · locales de tecnología',
      dropoffAddress: 'Barrio El Escorial, Casa 23',
      purchaseBudget: 60000,
      notes: 'Que el cargador sea de carga rápida.',
    ),
  ];
}
