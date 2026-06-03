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
      case BusinessCategory.fastFood:
        return Icons.lunch_dining_rounded;
      case BusinessCategory.bakery:
        return Icons.bakery_dining_rounded;
      case BusinessCategory.cafe:
        return Icons.local_cafe_rounded;
      case BusinessCategory.iceCream:
        return Icons.icecream_rounded;
      case BusinessCategory.drinks:
        return Icons.local_bar_rounded;
      case BusinessCategory.supermarket:
        return Icons.local_grocery_store_rounded;
      case BusinessCategory.convenience:
        return Icons.shopping_basket_rounded;
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
      case BusinessCategory.fastFood:
        return AppColors.categoryFastFood;
      case BusinessCategory.bakery:
        return AppColors.categoryBakery;
      case BusinessCategory.cafe:
        return AppColors.categoryCafe;
      case BusinessCategory.iceCream:
        return AppColors.categoryIceCream;
      case BusinessCategory.drinks:
        return AppColors.categoryDrinks;
      case BusinessCategory.supermarket:
        return AppColors.serviceEnvios;
      case BusinessCategory.convenience:
        return AppColors.categoryConvenience;
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
      case BusinessCategory.fastFood:
        return AppColors.categoryFastFoodContainer;
      case BusinessCategory.bakery:
        return AppColors.categoryBakeryContainer;
      case BusinessCategory.cafe:
        return AppColors.categoryCafeContainer;
      case BusinessCategory.iceCream:
        return AppColors.categoryIceCreamContainer;
      case BusinessCategory.drinks:
        return AppColors.categoryDrinksContainer;
      case BusinessCategory.supermarket:
        return AppColors.serviceEnviosContainer;
      case BusinessCategory.convenience:
        return AppColors.categoryConvenienceContainer;
      case BusinessCategory.pharmacy:
        return AppColors.secondaryContainer;
      case BusinessCategory.other:
        return AppColors.serviceMotocarroContainer;
    }
  }
}
