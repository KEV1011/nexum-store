import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/payment_methods/domain/payment_method.dart';

/// Gestiona la lista de métodos de pago del cliente. Mock en memoria para el
/// demo; en producción se sincronizaría con el backend / pasarela.
class PaymentMethodsNotifier extends StateNotifier<List<PaymentMethod>> {
  PaymentMethodsNotifier()
      : super(const [
          PaymentMethod(
            id: 'cash',
            type: PaymentMethodType.cash,
            label: 'Efectivo',
            detail: 'Pago al recibir',
            isDefault: true,
          ),
          PaymentMethod(
            id: 'visa-1234',
            type: PaymentMethodType.card,
            label: 'Visa •••• 1234',
            detail: 'Vence 08/27',
          ),
          PaymentMethod(
            id: 'nequi-3100001111',
            type: PaymentMethodType.nequi,
            label: 'Nequi',
            detail: '310 000 1111',
          ),
        ]);

  void remove(String id) {
    if (id == 'cash') return; // efectivo no se puede eliminar
    final wasDefault = state.any((m) => m.id == id && m.isDefault);
    var next = state.where((m) => m.id != id).toList();
    // Si se eliminó el predeterminado, efectivo vuelve a serlo.
    if (wasDefault && next.isNotEmpty) {
      next = next
          .map((m) => m.copyWith(isDefault: m.id == 'cash'))
          .toList();
    }
    state = next;
  }

  void setDefault(String id) {
    state = state.map((m) => m.copyWith(isDefault: m.id == id)).toList();
  }

  void addCard({required String number, required String expiry}) {
    final digits = number.replaceAll(' ', '');
    final last4 = digits.substring((digits.length - 4).clamp(0, 9999));
    state = [
      ...state,
      PaymentMethod(
        id: 'card-$last4-${DateTime.now().millisecondsSinceEpoch}',
        type: PaymentMethodType.card,
        label: 'Tarjeta •••• $last4',
        detail: 'Vence $expiry',
      ),
    ];
  }

  void addNequi(String phone) {
    state = [
      ...state,
      PaymentMethod(
        id: 'nequi-$phone',
        type: PaymentMethodType.nequi,
        label: 'Nequi',
        detail: phone,
      ),
    ];
  }
}

final paymentMethodsProvider =
    StateNotifierProvider<PaymentMethodsNotifier, List<PaymentMethod>>(
  (_) => PaymentMethodsNotifier(),
);

/// Método de pago seleccionado (el predeterminado, o el primero como respaldo).
final selectedPaymentMethodProvider = Provider<PaymentMethod>((ref) {
  final methods = ref.watch(paymentMethodsProvider);
  return methods.firstWhere(
    (m) => m.isDefault,
    orElse: () => methods.first,
  );
});
