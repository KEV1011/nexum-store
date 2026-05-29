import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Una línea del carrito: producto + cantidad.
class CartItem {
  const CartItem({required this.product, required this.quantity});

  final ProductEntity product;
  final int quantity;

  double get subtotal => product.price * quantity;

  CartItem copyWith({int? quantity}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
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
      items.fold(0, (sum, item) => sum + item.subtotal);

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

  /// Agrega un producto al carrito. Si pertenece a otro negocio, reinicia.
  void addProduct(ProductEntity product, BusinessEntity business) {
    // Si el carrito es de otro negocio, empezar de cero.
    if (state.business != null && state.business!.id != business.id) {
      state = CartState(
        items: [CartItem(product: product, quantity: 1)],
        business: business,
      );
      return;
    }

    final index =
        state.items.indexWhere((i) => i.product.id == product.id);

    if (index == -1) {
      state = state.copyWith(
        items: [...state.items, CartItem(product: product, quantity: 1)],
        business: business,
      );
    } else {
      final updated = [...state.items];
      updated[index] =
          updated[index].copyWith(quantity: updated[index].quantity + 1);
      state = state.copyWith(items: updated, business: business);
    }
  }

  void removeOne(String productId) {
    final index =
        state.items.indexWhere((i) => i.product.id == productId);
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

  int quantityOf(String productId) {
    final index =
        state.items.indexWhere((i) => i.product.id == productId);
    return index == -1 ? 0 : state.items[index].quantity;
  }

  void clear() {
    state = const CartState();
  }
}

final cartProvider =
    StateNotifierProvider<CartNotifier, CartState>((ref) {
  return CartNotifier();
});
