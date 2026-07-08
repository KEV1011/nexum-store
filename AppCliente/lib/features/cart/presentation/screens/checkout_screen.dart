import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/cart/presentation/widgets/'
    'cart_summary.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/payments/data/payment_api.dart';
import 'package:url_launcher/url_launcher.dart';

/// Métodos de pago disponibles. Efectivo se paga al recibir; tarjeta y Nequi se
/// cobran en línea con Wompi (checkout abierto en el navegador).
enum PaymentMethod { cash, card, nequi }

extension on PaymentMethod {
  String get label {
    switch (this) {
      case PaymentMethod.cash:
        return 'Efectivo';
      case PaymentMethod.card:
        return 'Tarjeta';
      case PaymentMethod.nequi:
        return 'Nequi';
    }
  }

  IconData get icon {
    switch (this) {
      case PaymentMethod.cash:
        return Icons.payments_rounded;
      case PaymentMethod.card:
        return Icons.credit_card_rounded;
      case PaymentMethod.nequi:
        return Icons.phone_android_rounded;
    }
  }
}

/// Pantalla de confirmación: dirección, pago y envío del pedido.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _notesController = TextEditingController();
  final _promoController = TextEditingController();
  PaymentMethod _payment = PaymentMethod.cash;
  bool _placing = false;
  bool _promoValidating = false;

  /// Descuento validado por el backend (null = sin cupón aplicado).
  double _promoDiscount = 0;
  String? _promoCode;

  @override
  void dispose() {
    _notesController.dispose();
    _promoController.dispose();
    super.dispose();
  }

  Future<void> _applyPromo(CartState cart) async {
    final code = _promoController.text.trim();
    if (code.isEmpty || _promoValidating) return;
    setState(() => _promoValidating = true);
    try {
      final res = await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/client/promos/validate',
        data: {'code': code, 'amount': cart.total, 'context': 'order'},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      final discount = (data?['discount'] as num?)?.toDouble() ?? 0;
      if (!mounted) return;
      setState(() {
        _promoDiscount = discount;
        _promoCode = data?['code'] as String? ?? code.toUpperCase();
      });
      AppSnackbar.showSuccess(
        context,
        'Cupón aplicado: -${CurrencyFormatter.format(discount)}',
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo validar el cupón';
      setState(() {
        _promoDiscount = 0;
        _promoCode = null;
      });
      AppSnackbar.showError(context, msg);
    } finally {
      if (mounted) setState(() => _promoValidating = false);
    }
  }

  Future<void> _placeOrder(CartState cart) async {
    final address = ref.read(defaultAddressProvider);
    if (address == null) {
      AppSnackbar.showError(context, 'Agrega una dirección de entrega');
      return;
    }

    setState(() => _placing = true);

    final String orderId;
    try {
      orderId = await ref.read(ordersProvider.notifier).placeOrder(
            cart: cart,
            deliveryAddress: address.fullAddress,
          );
    } catch (_) {
      // El negocio nunca recibió el pedido: informar en lugar de simular.
      if (!mounted) return;
      setState(() => _placing = false);
      AppSnackbar.showError(
        context,
        'No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.',
      );
      return;
    }
    if (!mounted) return;

    // Canjea el cupón ya validado; si el canje falla (p. ej. carrera con otro
    // dispositivo) el pedido sigue su curso sin descuento.
    final promo = _promoCode;
    if (promo != null) {
      try {
        await ref.read(apiClientProvider).post<Map<String, dynamic>>(
          '/client/promos/redeem',
          data: {'code': promo, 'amount': cart.total, 'context': 'order'},
        );
      } on DioException {
        // Sin bloqueo del flujo de pedido.
      }
    }
    if (!mounted) return;

    // Pago en línea (tarjeta/Nequi) vía Wompi. El efectivo se paga al recibir.
    if (_payment != PaymentMethod.cash) {
      final amountToPay =
          (cart.total - _promoDiscount).clamp(0, double.infinity).toDouble();
      await _startOnlinePayment(
        orderId: orderId,
        amount: amountToPay,
        businessName: cart.business?.name,
      );
      if (!mounted) return;
    }

    ref.read(cartProvider.notifier).clear();
    context.go(AppRoutes.orderPath(orderId));
  }

  /// Inicia el pago Wompi y abre el checkout en el navegador. Si algo falla, el
  /// pedido sigue su curso (el cliente puede pagar contra entrega) y se avisa.
  Future<void> _startOnlinePayment({
    required String orderId,
    required double amount,
    String? businessName,
  }) async {
    try {
      final payment = await ref.read(paymentApiProvider).init(
            amount: amount,
            description: 'Pedido en ${businessName ?? 'Nexum'}',
            orderId: orderId,
          );
      final opened = await launchUrl(
        Uri.parse(payment.paymentUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      AppSnackbar.showInfo(
        context,
        opened
            ? 'Completa el pago con ${_payment.label} en la ventana de Wompi. '
                'Tu pedido ya está en curso.'
            : 'No se pudo abrir el pago. Podrás pagar al recibir.',
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = (e.response?.data as Map?)?['error'] as String? ??
          'No se pudo iniciar el pago. Podrás pagar al recibir.';
      AppSnackbar.showError(context, msg);
    } catch (_) {
      if (!mounted) return;
      AppSnackbar.showError(
        context,
        'No se pudo abrir el pago. Podrás pagar al recibir.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);

    if (cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Confirmar pedido')),
        body: const Center(child: Text('No hay nada por confirmar')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Confirmar pedido')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          const _SectionTitle(
            icon: Icons.location_on_rounded,
            title: 'Dirección de entrega',
          ),
          const SizedBox(height: AppConstants.spacingS),
          const _AddressTile(),
          const SizedBox(height: AppConstants.spacingS),
          TextField(
            controller: _notesController,
            decoration: const InputDecoration(
              hintText: 'Indicaciones (opcional): apto, color de puerta…',
            ),
            maxLines: 2,
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionTitle(
            icon: Icons.account_balance_wallet_rounded,
            title: 'Método de pago',
          ),
          const SizedBox(height: AppConstants.spacingS),
          ...PaymentMethod.values.map(
            (method) => _PaymentOption(
              method: method,
              selected: _payment == method,
              onTap: () => setState(() => _payment = method),
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionTitle(
            icon: Icons.local_offer_rounded,
            title: 'Código promocional',
          ),
          const SizedBox(height: AppConstants.spacingS),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _promoController,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(hintText: 'Ej: BIENVENIDO'),
                  onSubmitted: (_) => _applyPromo(cart),
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              SizedBox(
                height: 48,
                child: OutlinedButton(
                  onPressed: _promoValidating ? null : () => _applyPromo(cart),
                  child: _promoValidating
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Aplicar'),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionTitle(
            icon: Icons.receipt_long_rounded,
            title: 'Resumen',
          ),
          const SizedBox(height: AppConstants.spacingS),
          CartSummary(
            subtotal: cart.subtotal,
            deliveryFee: cart.deliveryFee,
            total: cart.total,
          ),
          if (_promoDiscount > 0) ...[
            const SizedBox(height: AppConstants.spacingS),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Cupón $_promoCode',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '-${CurrencyFormatter.format(_promoDiscount)} · '
                  'Pagas ${CurrencyFormatter.format((cart.total - _promoDiscount).clamp(0, double.infinity).toDouble())}',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: AppConstants.spacingM),
          const _CustodyNotice(),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          child: SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _placing ? null : () => _placeOrder(cart),
              child: _placing
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  : const Text('Realizar pedido'),
            ),
          ),
        ),
      ),
    );
  }
}

class _AddressTile extends ConsumerWidget {
  const _AddressTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final address = ref.watch(defaultAddressProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    if (address == null) {
      return OutlinedButton.icon(
        onPressed: () => context.push(AppRoutes.addresses),
        icon: const Icon(Icons.add_location_alt_rounded),
        label: const Text('Agregar dirección'),
      );
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Row(
          children: [
            const Icon(
              Icons.location_on_rounded,
              color: AppColors.primary,
              size: 20,
            ),
            const SizedBox(width: AppConstants.spacingS),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    address.alias,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    address.fullAddress,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            TextButton(
              onPressed: () => context.push(AppRoutes.addresses),
              child: const Text('Cambiar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: AppConstants.spacingS),
        Text(
          title,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _PaymentOption extends StatelessWidget {
  const _PaymentOption({
    required this.method,
    required this.selected,
    required this.onTap,
  });

  final PaymentMethod method;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primaryContainer
                : (isDark ? AppColors.cardDark : AppColors.cardLight),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(
              color: selected
                  ? AppColors.primary
                  : (isDark
                      ? AppColors.outlineDark
                      : AppColors.outlineLight),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Icon(
                method.icon,
                size: 20,
                color: selected
                    ? AppColors.primaryDim
                    : AppColors.textSecondary,
              ),
              const SizedBox(width: AppConstants.spacingM),
              Text(
                method.label,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.primaryDim : null,
                ),
              ),
              const Spacer(),
              if (selected)
                const Icon(
                  Icons.check_circle_rounded,
                  color: AppColors.primary,
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Aviso del diferenciador anti-Rappi: foto de custodia en el local.
class _CustodyNotice extends StatelessWidget {
  const _CustodyNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.infoContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_user_rounded, color: AppColors.info, size: 20),
          SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'Verás la foto de tu pedido al salir del local y la prueba '
              'de entrega. Tu domicilio, con cadena de custodia.',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 12.5,
                height: 1.35,
                color: AppColors.secondaryDark,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
