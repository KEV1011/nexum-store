import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/payments/data/payment_api.dart';

/// Desenlace del checkout de pago en línea.
enum PaymentOutcome { approved, rejected, pending, cancelled, failed }

/// Abre el checkout de pago en línea (Wompi) y **cierra el ciclo dentro de la
/// app**: inicia el pago, lanza el checkout en el navegador y luego sondea el
/// estado real contra el backend hasta aprobado/rechazado, mostrando el
/// resultado sin que el usuario tenga que adivinar. Devuelve el desenlace.
///
/// Reemplaza el patrón "lanzar y olvidar" (la app nunca sabía si el pago pasó).
Future<PaymentOutcome> showPaymentCheckout(
  BuildContext context,
  WidgetRef ref, {
  required double amount,
  required String description,
  String? orderId,
  String? tripId,
  String? customerEmail,
}) async {
  final outcome = await showModalBottomSheet<PaymentOutcome>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.transparent,
    builder: (_) => _PaymentCheckoutSheet(
      amount: amount,
      description: description,
      orderId: orderId,
      tripId: tripId,
      customerEmail: customerEmail,
    ),
  );
  return outcome ?? PaymentOutcome.cancelled;
}

class _PaymentCheckoutSheet extends ConsumerStatefulWidget {
  const _PaymentCheckoutSheet({
    required this.amount,
    required this.description,
    this.orderId,
    this.tripId,
    this.customerEmail,
  });

  final double amount;
  final String description;
  final String? orderId;
  final String? tripId;
  final String? customerEmail;

  @override
  ConsumerState<_PaymentCheckoutSheet> createState() => _PaymentCheckoutSheetState();
}

enum _Phase { launching, waiting, approved, rejected, timeout, error }

class _PaymentCheckoutSheetState extends ConsumerState<_PaymentCheckoutSheet> {
  _Phase _phase = _Phase.launching;
  String? _reference;
  String? _paymentUrl;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  Future<void> _start() async {
    setState(() {
      _phase = _Phase.launching;
      _errorMsg = null;
    });
    try {
      final api = ref.read(paymentApiProvider);
      final init = await api.init(
        amount: widget.amount,
        description: widget.description,
        orderId: widget.orderId,
        tripId: widget.tripId,
        customerEmail: widget.customerEmail,
      );
      _reference = init.referenceCode;
      _paymentUrl = init.paymentUrl;

      final opened = await launchUrl(
        Uri.parse(init.paymentUrl),
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      if (!opened) {
        setState(() {
          _phase = _Phase.error;
          _errorMsg = 'No se pudo abrir la ventana de pago.';
        });
        return;
      }
      setState(() => _phase = _Phase.waiting);
      await _poll();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.error;
        _errorMsg = (e.response?.data as Map?)?['error'] as String? ??
            'No se pudo iniciar el pago.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.error;
        _errorMsg = 'No se pudo iniciar el pago.';
      });
    }
  }

  Future<void> _poll() async {
    final ref0 = _reference;
    if (ref0 == null) return;
    final status = await ref.read(paymentApiProvider).pollUntilResolved(ref0);
    if (!mounted) return;
    setState(() {
      _phase = switch (status) {
        'approved' => _Phase.approved,
        'rejected' || 'voided' => _Phase.rejected,
        _ => _Phase.timeout,
      };
    });
  }

  Future<void> _reopenCheckout() async {
    final url = _paymentUrl;
    if (url == null) return;
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!mounted) return;
    setState(() => _phase = _Phase.waiting);
    await _poll();
  }

  void _close(PaymentOutcome outcome) {
    if (Navigator.of(context).canPop()) Navigator.of(context).pop(outcome);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 28,
      ),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
              color: context.outlineColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Text(
            CurrencyFormatter.format(widget.amount),
            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 4),
          Text(
            widget.description,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 24),
          ..._body(context),
        ],
      ),
    );
  }

  List<Widget> _body(BuildContext context) {
    switch (_phase) {
      case _Phase.launching:
        return [
          const CircularProgressIndicator(color: AppColors.primary),
          const SizedBox(height: 16),
          Text('Abriendo el pago seguro…',
              style: TextStyle(color: context.textSecondaryColor)),
          const SizedBox(height: 20),
        ];
      case _Phase.waiting:
        return [
          const CircularProgressIndicator(color: AppColors.primary),
          const SizedBox(height: 16),
          const Text('Esperando la confirmación del pago',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            'Completa el pago en la ventana de Wompi. Detectaremos la '
            'confirmación automáticamente.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 18),
          _outlineBtn('Volver a abrir el pago', Icons.open_in_new_rounded, _reopenCheckout),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => _close(PaymentOutcome.pending),
            child: const Text('Pagar más tarde'),
          ),
        ];
      case _Phase.approved:
        return [
          _resultIcon(Icons.check_circle_rounded, AppColors.success),
          const SizedBox(height: 12),
          const Text('¡Pago aprobado!',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 20),
          _filledBtn('Listo', () => _close(PaymentOutcome.approved), AppColors.success),
        ];
      case _Phase.rejected:
        return [
          _resultIcon(Icons.cancel_rounded, AppColors.error),
          const SizedBox(height: 12),
          const Text('El pago no se completó',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Puedes intentarlo de nuevo con otro método.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor)),
          const SizedBox(height: 18),
          _filledBtn('Reintentar', _start, AppColors.primary),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => _close(PaymentOutcome.rejected),
            child: const Text('Cerrar'),
          ),
        ];
      case _Phase.timeout:
        return [
          _resultIcon(Icons.schedule_rounded, AppColors.warning),
          const SizedBox(height: 12),
          const Text('Aún no confirmamos tu pago',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Si ya pagaste, se reflejará en unos minutos.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor)),
          const SizedBox(height: 18),
          _outlineBtn('Seguir esperando', Icons.refresh_rounded, () async {
            setState(() => _phase = _Phase.waiting);
            await _poll();
          }),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => _close(PaymentOutcome.pending),
            child: const Text('Cerrar'),
          ),
        ];
      case _Phase.error:
        return [
          _resultIcon(Icons.error_outline_rounded, AppColors.error),
          const SizedBox(height: 12),
          Text(_errorMsg ?? 'No se pudo iniciar el pago.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 18),
          _filledBtn('Reintentar', _start, AppColors.primary),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => _close(PaymentOutcome.failed),
            child: const Text('Cerrar'),
          ),
        ];
    }
  }

  Widget _resultIcon(IconData icon, Color color) => Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: color, size: 38),
      );

  Widget _filledBtn(String label, VoidCallback onTap, Color color) => SizedBox(
        width: double.infinity,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: color,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: onTap,
          child: Text(label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        ),
      );

  Widget _outlineBtn(String label, IconData icon, VoidCallback onTap) => SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 13),
          ),
          onPressed: onTap,
          icon: Icon(icon, size: 18),
          label: Text(label),
        ),
      );
}
