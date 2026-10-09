// ── Comprar en un comercio que todavía no es cliente de ZIPA ─────────────────
//
// POR QUÉ ES UNA PANTALLA APARTE Y NO EL CHECKOUT. Una compra así no es un
// pedido: no hay cocina conectada que lo acepte, no hay promoción de la tienda
// que aplicar, no hay envío a otra ciudad ni entrega a la puerta en destino, y
// el precio no es firme. Meterla en el checkout obligaría a apagar la mitad de
// esa pantalla y a explicar en cada pieza por qué no aplica — y la pieza que
// se olvidara apagar le cobraría al cliente algo que nadie va a hacer.
//
// LO QUE SÍ TIENE QUE DECIR, y por eso está escrito en pantalla:
//  · que los precios salieron de SU CARTA y pueden haber cambiado;
//  · que lo que se aprueba es un PRESUPUESTO, no un total;
//  · y que lo que se cobra al final es lo que diga el recibo.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/cart/data/compra_api.dart';
import 'package:nexum_client/features/cart/presentation/providers/cart_provider.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';

class CompraComercioScreen extends ConsumerStatefulWidget {
  const CompraComercioScreen({super.key});

  @override
  ConsumerState<CompraComercioScreen> createState() =>
      _CompraComercioScreenState();
}

class _CompraComercioScreenState extends ConsumerState<CompraComercioScreen> {
  final _direccion = TextEditingController();
  final _notas = TextEditingController();
  double? _lat;
  double? _lng;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    // La dirección guardada por defecto, igual que en el checkout: quien ya
    // la tiene no la vuelve a escribir.
    final guardada = ref.read(defaultAddressProvider);
    if (guardada != null) {
      _direccion.text = guardada.fullAddress;
      _lat = guardada.lat;
      _lng = guardada.lng;
    }
  }

  @override
  void dispose() {
    _direccion.dispose();
    _notas.dispose();
    super.dispose();
  }

  Future<void> _comprar(CartState cart) async {
    final negocio = cart.business;
    if (negocio == null) return;
    if (_direccion.text.trim().isEmpty) {
      AppSnackbar.showError(context, 'Escribe a dónde lo llevamos.');
      return;
    }
    setState(() => _enviando = true);
    try {
      final r = await ref.read(compraApiProvider).comprar(
        businessId: negocio.id,
        items: [
          for (final i in cart.items)
            {
              'productId': i.product.id,
              'quantity': i.quantity,
              if (i.notes != null && i.notes!.trim().isNotEmpty)
                'notes': i.notes!.trim(),
            },
        ],
        direccion: _direccion.text.trim(),
        lat: _lat,
        lng: _lng,
        notas: _notas.text,
      );
      if (!mounted) return;
      ref.read(cartProvider.notifier).clear();
      AppSnackbar.showSuccess(
        context,
        'Buscando quién vaya a comprarlo. Presupuesto: '
        '${CurrencyFormatter.format(r.presupuesto)}.',
      );
      // Al seguimiento del mandado, que es el de siempre: esta compra ES un
      // mandado, y tener dos pantallas de seguimiento para lo mismo las haría
      // divergir.
      context.go(AppRoutes.errandStatus);
    } on CompraError catch (e) {
      if (!mounted) return;
      setState(() => _enviando = false);
      AppSnackbar.showError(context, e.motivo);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final negocio = cart.business;
    if (cart.isEmpty || negocio == null) {
      // Se puede llegar aquí con el carrito ya vaciado (atrás y adelante).
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Volver',
            icon: const Icon(Icons.arrow_back_rounded),
            onPressed: () => safeBack(context, fallback: AppRoutes.home),
          ),
          title: const Text('Tu compra'),
        ),
        body: const Center(child: Text('Tu carrito está vacío.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Volver',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, fallback: AppRoutes.home),
        ),
        title: const Text('Vamos y lo compramos'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _Explicacion(negocio: negocio.name),
          const SizedBox(height: AppConstants.spacingL),

          Text(
            'Lo que vamos a comprar',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          for (final i in cart.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${i.quantity} × ${i.product.name}',
                          style: TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 14,
                            color: context.textPrimaryColor,
                          ),
                        ),
                        if (i.notes != null && i.notes!.trim().isNotEmpty)
                          Text(
                            i.notes!.trim(),
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 12,
                              color: AppColors.warning,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    // «aprox.» en CADA línea y no solo en el total: es donde
                    // el cliente mira el número.
                    'aprox. ${CurrencyFormatter.format(i.subtotal)}',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: context.textSecondaryColor,
                    ),
                  ),
                ],
              ),
            ),

          const Divider(height: 28),
          _Fila(
            etiqueta: 'Según su carta',
            valor: 'aprox. ${CurrencyFormatter.format(cart.subtotal)}',
          ),
          const SizedBox(height: 6),
          Text(
            'Al repartidor se le autoriza un poco más por si algún precio '
            'subió. Solo se te cobra lo que diga el recibo, más el servicio '
            'del mandado.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 12.5,
              height: 1.35,
              color: context.textSecondaryColor,
            ),
          ),

          const SizedBox(height: AppConstants.spacingL),
          Text(
            '¿A dónde lo llevamos?',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          AddressAutocompleteField(
            controller: _direccion,
            label: 'Dirección de entrega',
            hint: 'Carrera 6 # 4-20',
            requiredField: true,
            onPlaceSelected: (p) {
              _lat = p.lat;
              _lng = p.lng;
            },
            onManualEdit: () {
              // Si la reescribe a mano, el punto anterior deja de valer: es de
              // otra dirección, y mandar al repartidor ahí sería peor que no
              // mandarle ninguno.
              _lat = null;
              _lng = null;
            },
          ),
          const SizedBox(height: AppConstants.spacingM),
          TextField(
            controller: _notas,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Indicaciones para el repartidor (opcional)',
              hintText: 'Ej: si no hay pollo, traer costilla',
            ),
          ),
          const SizedBox(height: AppConstants.spacingXL),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          child: SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _enviando ? null : () => _comprar(cart),
              child: _enviando
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Buscar quién lo compre'),
            ),
          ),
        ),
      ),
    );
  }
}

class _Explicacion extends StatelessWidget {
  const _Explicacion({required this.negocio});

  final String negocio;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.40)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.shopping_basket_rounded,
                  color: AppColors.warning, size: 22),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Text(
                  '$negocio todavía no recibe pedidos por la app',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimaryColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Un repartidor de ZIPA va al local, compra lo que elegiste y te lo '
            'lleva. Los precios que ves salieron de su carta y pueden haber '
            'cambiado: lo que se te cobra es lo que diga el recibo.',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              height: 1.35,
              color: context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila({required this.etiqueta, required this.valor});

  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          etiqueta,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: context.textPrimaryColor,
          ),
        ),
        Text(
          valor,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: context.textPrimaryColor,
          ),
        ),
      ],
    );
  }
}
