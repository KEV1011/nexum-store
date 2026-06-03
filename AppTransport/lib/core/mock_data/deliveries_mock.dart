import 'package:nexum_driver/features/trip_requests/domain/entities/delivery_details.dart';

/// Plantilla de entrega mock para simular solicitudes entrantes cuando el
/// conductor opera en modo Pedido (domicilio) o Paquete (envío).
class DeliveryMockData {
  const DeliveryMockData({
    required this.kind,
    required this.title,
    required this.itemDescription,
    required this.recipientName,
    required this.recipientPhone,
    this.notes,
  });

  final DeliveryKind kind;
  final String title;
  final String itemDescription;
  final String recipientName;
  final String recipientPhone;
  final String? notes;

  DeliveryDetails toDetails() => DeliveryDetails(
        kind: kind,
        title: title,
        itemDescription: itemDescription,
        recipientName: recipientName,
        recipientPhone: recipientPhone,
        notes: notes,
      );
}

/// Catálogo de entregas de ejemplo en Pamplona, Norte de Santander.
abstract final class DeliveriesMock {
  /// Pedidos de comida (modo Pedido). El conductor recoge en el negocio y
  /// entrega al cliente.
  static const List<DeliveryMockData> foodOrders = [
    DeliveryMockData(
      kind: DeliveryKind.food,
      title: 'Combo hamburguesa doble',
      itemDescription:
          '1 hamburguesa doble carne, papas grandes y gaseosa. '
          'Burger House Pamplona.',
      recipientName: 'Laura Jiménez',
      recipientPhone: '+57 312 445 7788',
      notes: 'Apartamento 302, timbre del lado derecho.',
    ),
    DeliveryMockData(
      kind: DeliveryKind.food,
      title: 'Pedido pollo frito',
      itemDescription:
          'Combo 4 presas con papas y arepa. Pollo Frito El Coronel.',
      recipientName: 'Andrés Camargo',
      recipientPhone: '+57 320 118 2390',
    ),
    DeliveryMockData(
      kind: DeliveryKind.food,
      title: 'Pizza familiar mixta',
      itemDescription:
          'Pizza familiar mixta + gaseosa 1.5L. Pizzería Don Lucho.',
      recipientName: 'María Fernanda Ruiz',
      recipientPhone: '+57 315 902 4471',
      notes: 'Cobrar en efectivo, el cliente paga con \$50.000.',
    ),
    DeliveryMockData(
      kind: DeliveryKind.food,
      title: 'Almuerzo ejecutivo',
      itemDescription:
          '2 bandejas paisa para llevar. Restaurante El Sabor Pamplonés.',
      recipientName: 'Oficina Contadores SAS',
      recipientPhone: '+57 607 568 1120',
      notes: 'Preguntar por recepción en el segundo piso.',
    ),
  ];

  /// Paquetes / envíos (modo Paquete). Recogida de un paquete y entrega a
  /// un destinatario.
  static const List<DeliveryMockData> parcels = [
    DeliveryMockData(
      kind: DeliveryKind.parcel,
      title: 'Sobre con documentos',
      itemDescription:
          'Sobre tamaño carta sellado. Manejar con cuidado, no doblar.',
      recipientName: 'Carlos Villamizar',
      recipientPhone: '+57 318 774 5566',
      notes: 'Entregar únicamente al destinatario, pide firma.',
    ),
    DeliveryMockData(
      kind: DeliveryKind.parcel,
      title: 'Caja mediana',
      itemDescription:
          'Caja de 30x20 cm, aprox. 2 kg. Contiene ropa, frágil no.',
      recipientName: 'Diana Carolina Peña',
      recipientPhone: '+57 311 226 9087',
    ),
    DeliveryMockData(
      kind: DeliveryKind.parcel,
      title: 'Repuesto de moto',
      itemDescription:
          'Bolsa con repuesto pequeño. Recoger en almacén de la 6.',
      recipientName: 'Taller Moto Centro',
      recipientPhone: '+57 313 558 1294',
      notes: 'El taller cierra a las 6 p. m.',
    ),
  ];
}
