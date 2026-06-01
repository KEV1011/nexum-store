import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Tipo de entrega: un pedido (domicilio de comida) o un paquete (envío).
enum DeliveryKind {
  food,
  parcel;

  static DeliveryKind fromApi(String? s) =>
      s == 'parcel' ? DeliveryKind.parcel : DeliveryKind.food;

  String get label => switch (this) {
        DeliveryKind.food => 'Domicilio',
        DeliveryKind.parcel => 'Envío',
      };

  IconData get icon => switch (this) {
        DeliveryKind.food => Icons.lunch_dining_rounded,
        DeliveryKind.parcel => Icons.inventory_2_rounded,
      };

  Color get color => switch (this) {
        DeliveryKind.food => AppColors.serviceTaxi,
        DeliveryKind.parcel => AppColors.serviceEnvios,
      };

  /// Etiquetas contextuales para los puntos de recogida / entrega.
  String get pickupLabel => switch (this) {
        DeliveryKind.food => 'Recoger en',
        DeliveryKind.parcel => 'Recoger en',
      };

  String get dropoffLabel => 'Entregar a';
}

/// Detalle de una entrega (pedido o paquete) adjunto a una solicitud de
/// trabajo cuando el conductor opera en modo Pedido o Paquete.
class DeliveryDetails {
  const DeliveryDetails({
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

  bool get hasNotes => notes != null && notes!.trim().isNotEmpty;
}
