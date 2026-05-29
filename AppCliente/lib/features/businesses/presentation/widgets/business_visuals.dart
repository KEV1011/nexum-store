import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Recursos visuales (icono + color) por categoría de negocio.
///
/// Centraliza el mapeo para que la lista, el detalle y el carrito se vean
/// consistentes en toda la app.
extension BusinessCategoryVisuals on BusinessCategory {
  IconData get icon {
    switch (this) {
      case BusinessCategory.restaurant:
        return Icons.restaurant_rounded;
      case BusinessCategory.supermarket:
        return Icons.local_grocery_store_rounded;
      case BusinessCategory.pharmacy:
        return Icons.local_pharmacy_rounded;
      case BusinessCategory.other:
        return Icons.storefront_rounded;
    }
  }

  Color get color {
    switch (this) {
      case BusinessCategory.restaurant:
        return AppColors.serviceTaxi;
      case BusinessCategory.supermarket:
        return AppColors.serviceEnvios;
      case BusinessCategory.pharmacy:
        return AppColors.secondary;
      case BusinessCategory.other:
        return AppColors.serviceMotocarro;
    }
  }

  Color get containerColor {
    switch (this) {
      case BusinessCategory.restaurant:
        return AppColors.serviceTaxiContainer;
      case BusinessCategory.supermarket:
        return AppColors.serviceEnviosContainer;
      case BusinessCategory.pharmacy:
        return AppColors.secondaryContainer;
      case BusinessCategory.other:
        return AppColors.serviceMotocarroContainer;
    }
  }
}
