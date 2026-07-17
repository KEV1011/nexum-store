import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Una línea del carrito: producto + opciones elegidas + cantidad.
///
/// Dos veces el mismo producto con opciones distintas (ej: "Hamburguesa Grande"
/// y "Hamburguesa Mediana") son líneas SEPARADAS, distinguidas por `lineId`.
class CartItem {
  const CartItem({
    required this.product,
    required this.quantity,
    this.selectedOptions = const [],
  });

  final ProductEntity product;
  final int quantity;

  /// Opciones elegidas (tamaño, adiciones, quitar). Vacío = producto simple.
  final List<ProductOptionEntity> selectedOptions;

  /// Identificador de la línea: para productos sin opciones es el id del
  /// producto (compatibilidad); con opciones, id + firma de las opciones.
  String get lineId {
    if (selectedOptions.isEmpty) return product.id;
    final ids = selectedOptions.map((o) => o.id).toList()..sort();
    return '${product.id}|${ids.join(',')}';
  }

  /// Precio unitario = precio base + suma de los deltas de las opciones.
  double get unitPrice =>
      product.price +
      selectedOptions.fold(0.0, (sum, o) => sum + o.priceDelta);

  double get subtotal => unitPrice * quantity;

  /// Resumen legible de las opciones (ej: "Grande · +Queso · Sin cebolla").
  String? get optionsSummary => selectedOptions.isEmpty
      ? null
      : selectedOptions.map((o) => o.name).join(' · ');

  CartItem copyWith({int? quantity}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
      selectedOptions: selectedOptions,
    );
  }
}

/// Estado del carrito: ítems + negocio asociado.
///
/// Un carrito solo puede contener productos de un mismo negocio (igual que
/// Rappi y Uber Eats). Al cambiar de negocio se reinicia.
class CartState {
  const CartState({this.items = const [], this.business});

  final List<CartItem> items;
  final BusinessEntity? business;

  int get totalItems =>
      items.fold(0, (sum, item) => sum + item.quantity);

  double get subtotal =>
      items.fold(0.0, (sum, item) => sum + item.subtotal);

  double get deliveryFee => business?.deliveryFee ?? 0;

  double get total => subtotal + deliveryFee;

  bool get isEmpty => items.isEmpty;

  CartState copyWith({
    List<CartItem>? items,
    BusinessEntity? business,
  }) {
    return CartState(
      items: items ?? this.items,
      business: business ?? this.business,
    );
  }
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier() : super(const CartState());

  /// Agrega un producto al carrito, opcionalmente con opciones elegidas. Si
  /// pertenece a otro negocio, reinicia. Las líneas se distinguen por `lineId`
  /// (mismo producto con opciones distintas = líneas separadas).
  void addProduct(
    ProductEntity product,
    BusinessEntity business, {
    List<ProductOptionEntity> selectedOptions = const [],
  }) {
    final newItem = CartItem(
      product: product,
      quantity: 1,
      selectedOptions: selectedOptions,
    );

    // Si el carrito es de otro negocio, empezar de cero.
    if (state.business != null && state.business!.id != business.id) {
      state = CartState(items: [newItem], business: business);
      return;
    }

    final index = state.items.indexWhere((i) => i.lineId == newItem.lineId);

    if (index == -1) {
      state = state.copyWith(
        items: [...state.items, newItem],
        business: business,
      );
    } else {
      final updated = [...state.items];
      updated[index] =
          updated[index].copyWith(quantity: updated[index].quantity + 1);
      state = state.copyWith(items: updated, business: business);
    }
  }

  /// Quita una unidad de la línea indicada (por `lineId`; para productos simples
  /// coincide con el id del producto).
  void removeOne(String lineId) {
    final index = state.items.indexWhere((i) => i.lineId == lineId);
    if (index == -1) return;

    final item = state.items[index];
    final updated = [...state.items];

    if (item.quantity <= 1) {
      updated.removeAt(index);
    } else {
      updated[index] = item.copyWith(quantity: item.quantity - 1);
    }

    state = updated.isEmpty
        ? const CartState()
        : state.copyWith(items: updated);
  }

  /// Cantidad total del producto en el carrito (sumando todas sus variantes).
  int quantityOf(String productId) {
    return state.items
        .where((i) => i.product.id == productId)
        .fold(0, (sum, i) => sum + i.quantity);
  }

  void clear() {
    state = const CartState();
  }
}

final cartProvider =
    StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier();
});
