import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/cart/data/envio_api.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/cart/presentation/widgets/'
    'cart_summary.dart';
import 'package:nexum_client/features/intercity/domain/entities/'
    'intercity_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/payments/presentation/payment_checkout.dart';
import 'package:nexum_client/features/payments/presentation/providers/'
    'payment_method_provider.dart';
import 'package:nexum_client/features/payments/presentation/widgets/'
    'icono_metodo_pago.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';

// El pedido usa EL MISMO catálogo de pago que el viaje urbano
// (`MetodoPago` ← `lib/metodos-pago.ts` del servidor). Aquí vivía un enum
// propio de tres valores —efectivo, tarjeta, Nequi— que además **nunca salía
// del teléfono**: solo decidía si abrir Wompi. El negocio y el repartidor no
// se enteraban de con qué se paga, así que el repartidor llegaba sin saber
// si tenía que cobrar. Y con dos listas, añadir un método en una dejaba a la
// otra con un hueco.

/// Pantalla de confirmación: dirección, pago y envío del pedido.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _notesController = TextEditingController();
  final _promoController = TextEditingController();
  final _otraCiudadController = TextEditingController();
  bool _placing = false;
  bool _promoValidating = false;

  /// Descuento validado por el backend (null = sin cupón aplicado).
  double _promoDiscount = 0;
  String? _promoCode;

  // ── Envío a otra ciudad ────────────────────────────────────────────────────
  //
  // Null = se entrega en la dirección guardada, que es el caso normal. Con un
  // destino elegido, la entrega va a la dirección escrita abajo y el pedido
  // pasa a ser intermunicipal.
  DestinoEnvio? _destino;
  double? _latOtra;
  double? _lngOtra;
  bool _ultimaMilla = false;

  /// Lo que el servidor dice que cuesta mover ESTE pedido a ESA dirección.
  /// Null mientras no se ha podido preguntar.
  CotizacionEnvio? _cotizacion;
  bool _cotizando = false;

  /// La petición en curso, para descartar respuestas viejas: quien escribe
  /// dos direcciones seguidas recibiría la cotización de la primera después
  /// de la segunda, y vería el precio equivocado sin que nada lo delate.
  int _cotizacionSeq = 0;

  @override
  void initState() {
    super.initState();
    // Se cotiza también la dirección guardada: si resulta estar en otra
    // ciudad, el motivo aparece AHORA y no al pulsar «Realizar pedido».
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // ignore: discarded_futures — cotiza en segundo plano al abrir.
      _cotizar();
    });
  }

  @override
  void dispose() {
    _notesController.dispose();
    _promoController.dispose();
    _otraCiudadController.dispose();
    super.dispose();
  }

  /// Dirección con la que se va a crear el pedido, según lo elegido.
  ({String texto, double? lat, double? lng})? _entregaElegida() {
    if (_destino != null) {
      final texto = _otraCiudadController.text.trim();
      if (texto.isEmpty) return null;
      return (texto: texto, lat: _latOtra, lng: _lngOtra);
    }
    final a = ref.read(defaultAddressProvider);
    if (a == null) return null;
    return (texto: a.fullAddress, lat: a.lat, lng: a.lng);
  }

  Future<void> _cotizar() async {
    final cart = ref.read(cartProvider);
    final biz = cart.business;
    if (biz == null) return;
    final entrega = _entregaElegida();

    final seq = ++_cotizacionSeq;
    setState(() => _cotizando = true);
    final q = await ref.read(envioApiProvider).cotizar(
          businessId: biz.id,
          lat: entrega?.lat,
          lng: entrega?.lng,
          lastMile: _ultimaMilla,
        );
    if (!mounted || seq != _cotizacionSeq) return;
    setState(() {
      _cotizacion = q;
      _cotizando = false;
    });
  }

  /// Por qué NO se puede confirmar, en español. Null = adelante.
  ///
  /// El caso que obliga a que esto exista: con un destino elegido pero la
  /// dirección ESCRITA A MANO no hay coordenadas, y sin coordenadas el
  /// servidor resuelve el pedido como LOCAL —un dato que falta no lo
  /// convierte en intermunicipal—. O sea que el cliente creería estar
  /// mandando una caja a Bucaramanga, pagaría el domicilio de la esquina y
  /// se buscaría un repartidor urbano para una entrega a seis horas. Nada en
  /// pantalla lo delataría.
  String? _motivoParaNoPedir() {
    final d = _destino;
    if (d != null && (_latOtra == null || _lngOtra == null)) {
      return 'Para enviar a ${_nombreCiudad(d.city)}, elige la dirección de '
          'las sugerencias o márcala en el mapa.';
    }
    final q = _cotizacion;
    if (q?.rechazo != null) return q!.rechazo;
    // La dirección se resolvió en otra plaza distinta de la elegida (un
    // municipio vecino, que pasa a diario en el área metropolitana).
    if (d != null && q != null && q.destCity != null && q.destCity != d.city) {
      return 'Esa dirección está en ${q.destCityLabel ?? 'otro municipio'}, '
          'no en ${_nombreCiudad(d.city)}.';
    }
    return null;
  }

  /// Lo que se va a cobrar, antes del cupón.
  ///
  /// Con cotización manda la del servidor —es la que ejecuta la caja—; sin
  /// ella se cae al domicilio del comercio, que es un pedido local y es lo
  /// que la pantalla enseñaba antes de que esto existiera.
  double _totalAPagar(CartState cart) =>
      cart.subtotal + (_cotizacion?.envioTotal ?? cart.deliveryFee);

  Future<void> _elegirDestino(BusinessEntity biz) async {
    final elegido = await showModalBottomSheet<Object>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _HojaDestinos(destinos: biz.shipsTo),
    );
    if (elegido == null || !mounted) return;
    setState(() {
      // El marcador `_kMiCiudad` es «volver a mi dirección»: no se puede
      // representar con null, que aquí significaría «cerró la hoja».
      _destino = elegido is DestinoEnvio ? elegido : null;
      if (_destino == null) {
        _otraCiudadController.clear();
        _latOtra = null;
        _lngOtra = null;
        _ultimaMilla = false;
      }
    });
    await _cotizar();
  }

  Future<void> _applyPromo(CartState cart) async {
    final code = _promoController.text.trim();
    if (code.isEmpty || _promoValidating) return;
    setState(() => _promoValidating = true);
    try {
      final res = await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/client/promos/validate',
        data: {'code': code, 'amount': _totalAPagar(cart), 'context': 'order'},
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
    final entrega = _entregaElegida();
    if (entrega == null) {
      AppSnackbar.showError(
        context,
        _destino == null
            ? 'Agrega una dirección de entrega'
            : 'Escribe la dirección de entrega en ${_nombreCiudad(_destino!.city)}',
      );
      return;
    }
    // Lo que ya se sabe que no se puede: se corta aquí en vez de dejar que
    // el pedido salga y vuelva con el mismo motivo, con el botón girando por
    // el camino.
    final motivo = _motivoParaNoPedir();
    if (motivo != null) {
      AppSnackbar.showError(context, motivo);
      return;
    }

    setState(() => _placing = true);

    final String orderId;
    try {
      orderId = await ref.read(ordersProvider.notifier).placeOrder(
            cart: cart,
            deliveryAddress: entrega.texto,
            // Si la dirección se eligió de la lista o del mapa, el pedido
            // lleva su punto exacto: el cliente puede seguirlo, y es lo que
            // decide si cruza de ciudad.
            deliveryLat: entrega.lat,
            deliveryLng: entrega.lng,
            lastMile: _ultimaMilla,
            // Viaja al servidor y se SELLA: es lo que leerán el negocio en
            // su portal y el repartidor en la puerta. Antes esta elección no
            // salía del teléfono.
            paymentMethod: ref.read(metodoPagoEfectivoProvider).valorApi,
          );
    } catch (e) {
      // El negocio nunca recibió el pedido: informar en lugar de simular. Y
      // decir el motivo REAL que dio el servidor —producto agotado, negocio
      // cerrado, demasiadas solicitudes—: culpar siempre a la conexión mandaba
      // al cliente a revisar su wifi cuando el problema era otro.
      if (!mounted) return;
      setState(() => _placing = false);
      final motivo = e is Exception
          ? e.toString().replaceFirst('Exception: ', '')
          : '';
      AppSnackbar.showError(
        context,
        motivo.isEmpty
            ? 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.'
            : motivo,
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
          data: {'code': promo, 'amount': _totalAPagar(cart), 'context': 'order'},
        );
      } on DioException {
        // Sin bloqueo del flujo de pedido.
      }
    }
    if (!mounted) return;

    // Solo el pago EN LÍNEA lo cobra la pasarela. Efectivo, Nequi, Bre-B y
    // las transferencias las cobra el repartidor en la puerta: abrir Wompi
    // para esas sería cobrar dos veces.
    if (ref.read(metodoPagoEfectivoProvider) == MetodoPago.enLinea) {
      final amountToPay =
          (_totalAPagar(cart) - _promoDiscount).clamp(0, double.infinity).toDouble();
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

  /// Inicia el pago en línea y cierra el ciclo dentro de la app (Wompi + sondeo
  /// de estado). Si algo falla, el pedido sigue su curso (pago contra entrega).
  Future<void> _startOnlinePayment({
    required String orderId,
    required double amount,
    String? businessName,
  }) async {
    final outcome = await showPaymentCheckout(
      context,
      ref,
      amount: amount,
      description: 'Pedido en ${businessName ?? 'ZIPA'}',
      orderId: orderId,
    );
    if (!mounted) return;
    switch (outcome) {
      case PaymentOutcome.approved:
        AppSnackbar.showSuccess(context, '¡Pago aprobado! Tu pedido está en curso.');
      case PaymentOutcome.rejected:
      case PaymentOutcome.failed:
        AppSnackbar.showInfo(context, 'No se completó el pago. Podrás pagar al recibir.');
      case PaymentOutcome.pending:
      case PaymentOutcome.cancelled:
        AppSnackbar.showInfo(context, 'Tu pedido está en curso. Puedes pagar al recibir.');
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
          // El selector de ciudad solo existe si el comercio DECLARÓ destinos.
          // Ofrecerlo cuando no despacha a ninguna parte sería un formulario
          // que solo lleva a un rechazo.
          if (cart.business?.despachaAOtrasCiudades ?? false) ...[
            _SelectorDestino(
              destino: _destino,
              onCambiar: () => _elegirDestino(cart.business!),
            ),
            const SizedBox(height: AppConstants.spacingS),
          ],
          if (_destino == null)
            const _AddressTile()
          else
            AddressAutocompleteField(
              controller: _otraCiudadController,
              label: 'Dirección en ${_nombreCiudad(_destino!.city)}',
              hint: 'Calle 5 # 3-40',
              requiredField: true,
              // El autocompletado se sesga al CENTRO DE LA CIUDAD DESTINO.
              // Sin esto Google ordena por cercanía a Pamplona y una calle de
              // Bucaramanga no aparece hasta la quinta sugerencia, o no
              // aparece: el buscador parecería roto justo aquí.
              sesgo: _centroDe(_destino!.city),
              onPlaceSelected: (p) {
                setState(() {
                  _latOtra = p.lat;
                  _lngOtra = p.lng;
                });
                // ignore: discarded_futures — recotiza en segundo plano.
                _cotizar();
              },
              onManualEdit: () {
                // Editar a mano invalida el punto: el texto ya no corresponde
                // a esas coordenadas, y con un punto viejo el pedido se
                // cotizaría —y se entregaría— en otro sitio.
                if (_latOtra == null && _lngOtra == null) return;
                setState(() {
                  _latOtra = null;
                  _lngOtra = null;
                  _ultimaMilla = false;
                });
                // ignore: discarded_futures
                _cotizar();
              },
            ),
          const SizedBox(height: AppConstants.spacingS),
          _ResumenEnvio(
            cotizacion: _cotizacion,
            cargando: _cotizando,
            ultimaMilla: _ultimaMilla,
            onUltimaMilla: (v) {
              setState(() => _ultimaMilla = v);
              // ignore: discarded_futures
              _cotizar();
            },
          ),
          if (_motivoParaNoPedir() != null && !_cotizando) ...[
            const SizedBox(height: AppConstants.spacingS),
            _AvisoBloqueo(texto: _motivoParaNoPedir()!),
          ],
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
          // La lista la manda el SERVIDOR: añadir un método allí lo hace
          // aparecer sin publicar una versión de la app, y el pago en línea
          // no se ofrece si no hay pasarela configurada (un botón que promete
          // cobrar y no cobra deja al repartidor entregando sin recibir).
          ...ref.watch(metodosDePagoProvider).map(
                (metodo) => _PaymentOption(
                  metodo: metodo,
                  selected: ref.watch(metodoPagoEfectivoProvider) == metodo,
                  onTap: () {
                    // ignore: discarded_futures — se recuerda en segundo plano.
                    ref.read(metodoPagoProvider.notifier).elegir(metodo);
                  },
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
          // Los números son los del SERVIDOR cuando ya respondió. Mientras no
          // haya cotización se enseña el domicilio del comercio, que es lo
          // que se cobraría en un pedido local — y es lo que era antes.
          CartSummary(
            subtotal: cart.subtotal,
            deliveryFee: _cotizacion?.deliveryFee ?? cart.deliveryFee,
            intercityFee: _cotizacion?.intercityFee ?? 0,
            intercityLabel: _cotizacion?.destCityLabel != null
                ? 'Envío a ${_cotizacion!.destCityLabel}'
                : null,
            total: _totalAPagar(cart),
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
                  'Pagas ${CurrencyFormatter.format((_totalAPagar(cart) - _promoDiscount).clamp(0, double.infinity).toDouble())}',
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
              // Apagado cuando el servidor ya dijo que ahí no se entrega: el
              // motivo está en pantalla, encima del botón. Dejarlo activo
              // sería invitar a pulsar para recibir el mismo texto en un
              // aviso que se va solo.
              onPressed: _placing || _motivoParaNoPedir() != null
                  ? null
                  : () => _placeOrder(cart),
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

// ── Envío a otra ciudad ──────────────────────────────────────────────────────

/// Marcador de «entregar en mi dirección», para distinguirlo de cerrar la
/// hoja sin elegir (que devuelve null).
const Object _kMiCiudad = Object();

/// Nombre legible del municipio. `bySlug` devuelve uno construido con el
/// propio slug si no está en la lista, así que nunca queda vacío.
String _nombreCiudad(String slug) => IntercityCity.bySlug(slug).displayName;

/// Centroide del municipio, para sesgar el buscador de direcciones. Null si
/// el municipio llegó sin coordenadas: entonces se busca sin sesgo, que es
/// peor pero no rompe nada.
({double lat, double lng})? _centroDe(String slug) =>
    IntercityCity.bySlug(slug).coords;

class _SelectorDestino extends StatelessWidget {
  const _SelectorDestino({required this.destino, required this.onCambiar});

  final DestinoEnvio? destino;
  final VoidCallback onCambiar;

  @override
  Widget build(BuildContext context) {
    final aOtraCiudad = destino != null;
    return InkWell(
      onTap: onCambiar,
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: aOtraCiudad
              ? AppColors.infoContainer
              : context.cardColor2,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(
            color: aOtraCiudad ? AppColors.info : context.outlineColor,
          ),
        ),
        child: Row(
          children: [
            Icon(
              aOtraCiudad
                  ? Icons.local_shipping_rounded
                  : Icons.home_rounded,
              size: 20,
              color: aOtraCiudad ? AppColors.info : AppColors.primary,
            ),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Text(
                aOtraCiudad
                    ? 'Enviar a ${_nombreCiudad(destino!.city)}'
                    : 'Entregar en mi ciudad',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  // Sobre el contenedor azul claro el color va FIJO: con el
                  // adaptativo, en modo oscuro saldria casi blanco sobre
                  // fondo claro. Es la co-ocurrencia que la regla prohibe.
                  color: aOtraCiudad ? AppColors.secondaryDark : null,
                ),
              ),
            ),
            const Text('Cambiar', style: TextStyle(color: AppColors.primary)),
          ],
        ),
      ),
    );
  }
}

/// Las ciudades a las que ESTE comercio despacha, con su precio y su plazo.
///
/// Solo salen las declaradas: una ciudad que el comercio no atiende no puede
/// aparecer en la lista para que luego el pedido la rechace.
class _HojaDestinos extends StatelessWidget {
  const _HojaDestinos({required this.destinos});

  final List<DestinoEnvio> destinos;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        decoration: BoxDecoration(
          color: context.cardColor2,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '¿A dónde lo enviamos?',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: AppConstants.spacingS),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.home_rounded, color: AppColors.primary),
              title: const Text('Entregar en mi ciudad'),
              subtitle: const Text('Domicilio normal'),
              onTap: () => Navigator.pop(context, _kMiCiudad),
            ),
            const Divider(height: 1),
            ...destinos.map(
              (d) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(
                  Icons.local_shipping_rounded,
                  color: AppColors.info,
                ),
                title: Text(_nombreCiudad(d.city)),
                subtitle: Text(
                  '${CurrencyFormatter.format(d.fee)} · '
                  '${_plazo(d.etaHours)}'
                  '${d.cutoff != null ? ' · Pide antes de las ${d.cutoff}' : ''}',
                ),
                onTap: () => Navigator.pop(context, d),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// «24 horas» se dice «al día siguiente», que es como lo entiende quien
  /// compra; por debajo de un día se dicen las horas.
  static String _plazo(int horas) {
    if (horas >= 48) return 'En ${(horas / 24).round()} días';
    if (horas >= 24) return 'Al día siguiente';
    return 'En $horas horas';
  }
}

/// Por qué el botón está apagado. Un botón gris sin explicación es el peor
/// estado posible: no se sabe si falta algo, si la app falló o si el comercio
/// no atiende.
class _AvisoBloqueo extends StatelessWidget {
  const _AvisoBloqueo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.errorContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded,
              color: AppColors.error, size: 20),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              texto,
              // Color fijo: el contenedor lo es.
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.35,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cómo llega y cuánto cuesta moverlo, con los números del servidor.
class _ResumenEnvio extends StatelessWidget {
  const _ResumenEnvio({
    required this.cotizacion,
    required this.cargando,
    required this.ultimaMilla,
    required this.onUltimaMilla,
  });

  final CotizacionEnvio? cotizacion;
  final bool cargando;
  final bool ultimaMilla;
  final ValueChanged<bool> onUltimaMilla;

  @override
  Widget build(BuildContext context) {
    final q = cotizacion;
    // Cargando, no se pudo preguntar y pedido local son tres cosas distintas.
    // En las dos últimas no se dibuja nada: un pedido local ya está explicado
    // por el resumen de abajo, y un aviso de «no se pudo cotizar» en un
    // domicilio de la esquina solo asusta sin que haya nada que arreglar.
    if (cargando) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppConstants.spacingS),
        child: Row(
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: AppConstants.spacingS),
            Text('Calculando el envío…', style: TextStyle(fontSize: 13)),
          ],
        ),
      );
    }
    if (q == null) return const SizedBox.shrink();

    // El rechazo NO se pinta aquí: lo enseña `_AvisoBloqueo`, que es el único
    // sitio donde se dice por qué el botón está apagado. Dos avisos del mismo
    // problema se leen como dos problemas.
    if (q.rechazo != null || !q.intercity) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.infoContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.directions_bus_rounded,
                  color: AppColors.info, size: 20),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Text(
                  q.promisedAt != null
                      ? 'Llega ${_cuando(q.promisedAt!)}'
                      : 'Envío a otra ciudad',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.secondaryDark,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            ultimaMilla
                ? 'Un repartidor te la lleva hasta la puerta en destino.'
                : 'La recoges en la taquilla de la transportadora. '
                    'Por eso no se cobra domicilio.',
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.35,
              color: AppColors.textPrimary,
            ),
          ),
          // El interruptor solo cuando de verdad se puede: sin punto exacto
          // de entrega no hay a quién despachar en destino, y ofrecerlo
          // dejaría la caja esperando un repartidor que nadie busca.
          if (q.puedeUltimaMilla || ultimaMilla)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              value: ultimaMilla,
              onChanged: q.puedeUltimaMilla ? onUltimaMilla : null,
              title: const Text(
                'Que me la lleven hasta la puerta',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Para que te la lleven hasta la puerta, elige la dirección '
                'de las sugerencias o márcala en el mapa.',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.secondaryDark,
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Fecha en palabras. Un instante ISO no le dice nada a nadie; «mañana a
  /// las 8:00 a. m.» sí.
  static String _cuando(DateTime t) {
    final ahora = DateTime.now();
    final hoy = DateTime(ahora.year, ahora.month, ahora.day);
    final dia = DateTime(t.year, t.month, t.day);
    final dias = dia.difference(hoy).inDays;
    final hora = TimeOfDay.fromDateTime(t);
    final hh = hora.hourOfPeriod == 0 ? 12 : hora.hourOfPeriod;
    final mm = hora.minute.toString().padLeft(2, '0');
    final ampm = hora.period == DayPeriod.am ? 'a. m.' : 'p. m.';
    final cuando = switch (dias) {
      0 => 'hoy',
      1 => 'mañana',
      _ => 'el ${t.day}/${t.month}',
    };
    return '$cuando a las $hh:$mm $ampm';
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
        color: isDark ? AppColors.cardDark : context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
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
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 13,
                      color: context.textSecondaryColor,
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
    required this.metodo,
    required this.selected,
    required this.onTap,
  });

  final MetodoPago metodo;
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
                : (isDark ? AppColors.cardDark : context.cardColor2),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(
              color: selected
                  ? AppColors.primary
                  : (isDark
                      ? AppColors.outlineDark
                      : context.outlineColor),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              IconoMetodoPago(metodo: metodo, tamano: 34),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      metodo.etiqueta,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: selected ? AppColors.primaryDim : null,
                      ),
                    ),
                    // Quién cobra, con todas las letras. «Nequi» a secas hace
                    // creer que lo cobra la app; lo cobra el repartidor y hay
                    // que acordar el número con él.
                    Text(
                      metodo.detalle,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        height: 1.25,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
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
