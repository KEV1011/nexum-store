import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexum_client/shared/widgets/driver_info_card.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/config/app_config_provider.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';
import 'package:nexum_client/shared/widgets/vehicle_glyph.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'custody_proof_card.dart';
import 'package:nexum_client/shared/widgets/custody_pin_card.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'order_status_timeline.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'rating_bottom_sheet.dart';

/// Seguimiento en vivo del pedido con su cadena de custodia.
class OrderTrackingScreen extends ConsumerStatefulWidget {
  const OrderTrackingScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<OrderTrackingScreen> createState() =>
      _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends ConsumerState<OrderTrackingScreen> {
  bool _ratingShown = false;
  CustomerOrderEntity? _pendingRatingOrder;

  // Refresca la vista cada 30 s para que el contador de preparación en vivo
  // ("listo en ~X min") avance aunque no llegue una actualización del backend.
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Sondea el pedido mientras esta pantalla esté abierta: es lo que trae la
    // posición del repartidor y el PIN si la app se reinstaló.
    Future.microtask(
      () => ref.read(ordersProvider.notifier).trackOrder(widget.orderId),
    );
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderByIdProvider(widget.orderId));

    ref.listen(orderByIdProvider(widget.orderId), (prev, next) {
      if (next == null || !next.isDelivered || next.isRated) return;
      if (prev != null && prev.isDelivered) return;
      if (_ratingShown) return;
      _ratingShown = true;
      _pendingRatingOrder = next;
    });

    if (_pendingRatingOrder != null) {
      final pending = _pendingRatingOrder!;
      _pendingRatingOrder = null;
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        showRatingSheet(context, pending);
      });
    }

    if (order == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Pedido no encontrado')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Pedido ${order.orderRef}'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => context.go(AppRoutes.home),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _StatusHeader(order: order),
          const SizedBox(height: AppConstants.spacingL),
          if (order.driverName != null) ...[
            _DriverCard(order: order),
            const SizedBox(height: AppConstants.spacingM),
          ],
          // PIN de entrega: se muestra en cuanto hay repartidor y hasta que el
          // pedido se entrega. Es lo que el cliente dicta para recibirlo — sin
          // él nadie puede marcar la entrega.
          if (order.deliveryPin != null && !order.isDelivered) ...[
            CustodyPinCard(pin: order.deliveryPin!),
            const SizedBox(height: AppConstants.spacingM),
          ],
          // El mapa de seguimiento solo tiene sentido con repartidor asignado
          // (antes se pintaba un repartidor falso mientras el negocio cocinaba).
          if (order.driverName != null && !order.isDelivered && order.hasRealGeo) ...[
            _TrackingMap(order: order),
            const SizedBox(height: AppConstants.spacingM),
          ],
          CustodyProofCard(order: order),
          const SizedBox(height: AppConstants.spacingL),
          _Card(
            child: OrderStatusTimeline(status: order.status),
          ),
          if (order.isDelivered) ...[
            const SizedBox(height: AppConstants.spacingL),
            _RatingCard(order: order),
          ],
          // Sin pasarela configurada la propina no se puede cobrar: ofrecerla
          // solo servía para dar un error al final de una entrega que salió
          // bien.
          if (order.isDelivered &&
              order.driverName != null &&
              (ref.watch(appConfigProvider).valueOrNull?.pagoEnLinea ??
                  false)) ...[
            const SizedBox(height: AppConstants.spacingL),
            _OrderTipSection(orderId: order.id),
          ],
          const SizedBox(height: AppConstants.spacingL),
          _OrderSummary(order: order),
          // Se puede cancelar mientras el repartidor no haya recogido el pedido.
          if (order.isActive &&
              order.status != CustomerOrderStatus.inTransit) ...[
            const SizedBox(height: AppConstants.spacingM),
            _CancelButton(onCancel: () => _confirmCancel(context)),
          ],
        ],
      ),
    );
  }

  void _confirmCancel(BuildContext context) {
    final router = GoRouter.of(context);
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'Cancelar pedido',
          style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w700),
        ),
        content: const Text(
          '¿Seguro que deseas cancelar tu pedido?',
          style: TextStyle(fontFamily: 'Inter'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('No, mantener'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Sí, cancelar',
              style: TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed ?? false) {
        ref.read(ordersProvider.notifier).cancelOrder(widget.orderId);
        router.go(AppRoutes.home);
      }
    });
  }
}

// ── Propina ──────────────────────────────────────────────────────────────────

class _OrderTipSection extends ConsumerStatefulWidget {
  const _OrderTipSection({required this.orderId});

  final String orderId;

  @override
  ConsumerState<_OrderTipSection> createState() => _OrderTipSectionState();
}

class _OrderTipSectionState extends ConsumerState<_OrderTipSection> {
  static const _amounts = [2000.0, 5000.0, 10000.0];
  bool _loading = false;
  bool _sent = false;

  Future<void> _tip(double amount) async {
    setState(() => _loading = true);
    final url =
        await ref.read(ordersProvider.notifier).tipOrder(widget.orderId, amount);
    if (!mounted) return;
    setState(() => _loading = false);
    if (url == null) {
      AppSnackbar.showError(
        context,
        'No se pudo iniciar la propina. Intenta de nuevo.',
      );
      return;
    }
    final opened =
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!mounted) return;
    setState(() => _sent = true);
    AppSnackbar.showInfo(
      context,
      opened
          ? 'Completa el pago de tu propina en Wompi. ¡Gracias por apoyar al repartidor!'
          : 'No se pudo abrir el pago de la propina.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (_sent) {
      return Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: const Row(
          children: [
            Icon(Icons.volunteer_activism_rounded,
                color: AppColors.primary, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                '¡Gracias! Tu propina va 100% al repartidor.',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.volunteer_activism_rounded,
                  color: AppColors.primary, size: 20),
              SizedBox(width: 8),
              Text('Dejar propina',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'El 100% va para tu repartidor.',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
          ),
          const SizedBox(height: AppConstants.spacingM),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(8),
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
              ),
            )
          else
            Row(
              children: [
                for (final a in _amounts) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _tip(a),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        side: const BorderSide(color: AppColors.primary),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        CurrencyFormatter.format(a),
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                  ),
                  if (a != _amounts.last) const SizedBox(width: 8),
                ],
              ],
            ),
        ],
      ),
    );
  }
}

class _RatingCard extends StatelessWidget {
  const _RatingCard({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    if (order.isRated) {
      return _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.star_rounded,
                  color: AppColors.star,
                  size: 18,
                ),
                SizedBox(width: AppConstants.spacingS),
                Text(
                  'Tu calificación',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingS),
            RatingDisplay(rating: order.rating!),
            if (order.ratingComment != null) ...[
              const SizedBox(height: AppConstants.spacingS),
              Text(
                order.ratingComment!,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  color: context.textSecondaryColor,
                ),
              ),
            ],
          ],
        ),
      );
    }

    return _Card(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '¿Cómo estuvo tu pedido?',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Tu opinión ayuda a mejorar el servicio',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Builder(
            builder: (ctx) => OutlinedButton(
              onPressed: () => showRatingSheet(ctx, order),
              child: const Text('Calificar'),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.order});

  final CustomerOrderEntity order;

  /// Mensaje de estado con ETA en vivo, priorizando la fase de cocina.
  String _subtitle(CustomerOrderEntity o) {
    if (o.isDelivered) return 'Tu pedido de ${o.businessName} fue entregado.';
    if (o.isCancelled) return 'Tu pedido de ${o.businessName} fue cancelado.';
    switch (o.status) {
      case CustomerOrderStatus.pending:
        return '${o.businessName} está confirmando tu pedido…';
      case CustomerOrderStatus.preparing:
        if (o.isReady) return '¡Tu pedido está listo! Sale hacia ti en breve.';
        final rem = o.prepMinutesRemaining;
        if (rem != null) {
          return rem <= 0
              ? '${o.businessName} está terminando tu pedido…'
              : 'Listo en ~$rem min · ${o.businessName} lo está preparando';
        }
        return '${o.businessName} está preparando tu pedido';
      default:
        if (o.isReady && o.driverName == null) {
          return '¡Listo! Buscando repartidor para llevártelo';
        }
        return o.etaMinutes != null
            ? 'Llega en ~${o.etaMinutes} min desde ${o.businessName}'
            : 'Tu pedido de ${o.businessName} va en camino';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDim],
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                order.isDelivered
                    ? Icons.check_circle_rounded
                    : (order.status == CustomerOrderStatus.pending ||
                            order.status == CustomerOrderStatus.preparing)
                        ? Icons.restaurant_rounded
                        : Icons.delivery_dining_rounded,
                color: Colors.white,
                size: 28,
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: Text(
                  order.status.label,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            _subtitle(order),
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.9),
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    final ficha = order.driverCard;
    return DriverInfoCard(
      name: order.driverName,
      photoUrl: ficha?.photoUrl,
      rating: ficha?.rating,
      since: ficha?.since,
      verified: ficha?.verified ?? false,
      subtitle: 'Tu repartidor',
      vehicleDescription: ficha?.vehicleDescription,
      plate: ficha?.plate,
      vehiclePhotoUrl: ficha?.vehiclePhotoUrl,
      vehicleType: ficha?.vehicleType,
      // Un domicilio suele ir en moto: es el respaldo razonable cuando el
      // vehículo asignado no llegó. `esEntrega` hace que, venga o no el
      // dato, una moto se dibuje con el cajón de reparto.
      fallbackGlyph: VehicleGlyphKind.delivery,
      esEntrega: true,
      actions: [
        _CircleAction(
          icon: Icons.call_rounded,
          onTap: () {
            // Llamada REAL al repartidor (marcador del teléfono).
            final phone = order.driverPhone;
            if (phone == null || phone.isEmpty) {
              AppSnackbar.showInfo(
                context,
                'El teléfono estará disponible cuando el repartidor acepte.',
              );
              return;
            }
            launchUrl(Uri.parse('tel:$phone'));
          },
        ),
      ],
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: const BoxDecoration(
          color: AppColors.primaryContainer,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20, color: AppColors.primaryDim),
      ),
    );
  }
}

class _OrderSummary extends StatelessWidget {
  const _OrderSummary({required this.order});

  final CustomerOrderEntity order;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Detalle del pedido',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ...order.lines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
              child: Row(
                children: [
                  Text(
                    '${line.quantity}×',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(width: AppConstants.spacingS),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          line.productName,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 14,
                          ),
                        ),
                        if (line.optionsSummary != null)
                          Text(
                            line.optionsSummary!,
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 12,
                              color: context.textSecondaryColor,
                            ),
                          ),
                        if (line.notes != null)
                          Text(
                            '“${line.notes}”',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 12,
                              fontStyle: FontStyle.italic,
                              color: context.textSecondaryColor,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    CurrencyFormatter.format(line.subtotal),
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const Divider(height: AppConstants.spacingL),
          _SummaryRow(label: 'Subtotal', value: order.subtotal),
          const SizedBox(height: 4),
          _SummaryRow(label: 'Domicilio', value: order.deliveryFee),
          const SizedBox(height: 4),
          _SummaryRow(label: 'Total', value: order.total, emphasize: true),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final double value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Inter',
      fontSize: emphasize ? 16 : 14,
      fontWeight: emphasize ? FontWeight.w700 : FontWeight.w500,
      color: emphasize ? null : context.textSecondaryColor,
    );
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(CurrencyFormatter.format(value), style: style),
      ],
    );
  }
}

// ── Mapa de seguimiento ──────────────────────────────────────────────────────

/// Dónde está de verdad el repartidor y por qué calles va.
///
/// Antes esto era una simulación: las posiciones del negocio y de la entrega
/// se derivaban del `hashCode` del nombre y de la dirección, y el repartidor
/// se animaba entre esos dos puntos inventados. Bonito y completamente falso.
///
/// Ahora usa las coordenadas reales del pedido y la posición viva del
/// repartidor (heartbeat). Si el negocio todavía no tiene punto en el mapa, la
/// pantalla no muestra este widget: mejor sin mapa que con uno mentiroso.
class _TrackingMap extends ConsumerStatefulWidget {
  const _TrackingMap({required this.order});

  final CustomerOrderEntity order;

  @override
  ConsumerState<_TrackingMap> createState() => _TrackingMapState();
}

class _TrackingMapState extends ConsumerState<_TrackingMap>
    with SingleTickerProviderStateMixin {
  /// Desliza el vehículo entre dos fixes GPS en vez de saltar (estilo Uber).
  late final AnimationController _ctrl;
  LatLng? _desde;
  LatLng? _hasta;
  List<LatLng> _ruta = const [];
  bool _rutaPedida = false;

  LatLng get _negocio =>
      LatLng(widget.order.businessLat!, widget.order.businessLng!);
  LatLng get _entrega =>
      LatLng(widget.order.deliveryLat!, widget.order.deliveryLng!);

  /// Tramo actual: primero el repartidor va al negocio, luego a la entrega.
  LatLng get _destinoTramo =>
      widget.order.status == CustomerOrderStatus.inTransit ? _entrega : _negocio;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _hasta = _driverFix();
    _pedirRuta();
  }

  @override
  void didUpdateWidget(_TrackingMap old) {
    super.didUpdateWidget(old);
    final fix = _driverFix();
    if (fix != null && fix != _hasta) {
      _desde = _hasta ?? fix;
      _hasta = fix;
      _ctrl.forward(from: 0);
    }
    // Cambió el tramo (llegó al negocio y salió hacia el cliente): otra ruta.
    if (old.order.status != widget.order.status) {
      _rutaPedida = false;
      _pedirRuta();
    }
  }

  LatLng? _driverFix() {
    final la = widget.order.driverLat;
    final ln = widget.order.driverLng;
    return (la != null && ln != null) ? LatLng(la, ln) : null;
  }

  /// Ruta REAL por las calles. Sin GOOGLE_MAPS_API_KEY en el servidor devuelve
  /// null y se dibuja la línea directa: el mapa nunca se queda sin trazado.
  Future<void> _pedirRuta() async {
    if (_rutaPedida) return;
    _rutaPedida = true;
    final origen = _driverFix() ?? _negocio;
    final destino = _destinoTramo;
    final pts = await ref.read(geoServiceProvider).routePoints(
          originLat: origen.latitude,
          originLng: origen.longitude,
          destLat: destino.latitude,
          destLng: destino.longitude,
        );
    if (!mounted || pts == null || pts.isEmpty) return;
    setState(() => _ruta = pts);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  LatLng _posInterpolada() {
    final a = _desde;
    final b = _hasta;
    if (b == null) return _negocio;
    if (a == null) return b;
    final t = _ctrl.value;
    return LatLng(
      a.latitude + (b.latitude - a.latitude) * t,
      a.longitude + (b.longitude - a.longitude) * t,
    );
  }

  double _rumbo(LatLng a, LatLng b) {
    final dLng = b.longitude - a.longitude;
    return dLng >= 0 ? 90 : 270;
  }

  @override
  Widget build(BuildContext context) {
    final trazado = _ruta.isNotEmpty ? _ruta : [_negocio, _entrega];
    final centro = LatLng(
      (_negocio.latitude + _entrega.latitude) / 2,
      (_negocio.longitude + _entrega.longitude) / 2,
    );
    final fix = _driverFix();

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      child: SizedBox(
        height: 220,
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(
                initialCenter: centro,
                initialZoom: 15.2,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag,
                ),
              ),
              children: [
                const GoogleMapTiles(),
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: trazado,
                      strokeWidth: 4,
                      color: AppColors.primary.withValues(alpha: 0.85),
                    ),
                  ],
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _negocio,
                      width: MapPin.markerWidth,
                      height: MapPin.markerHeight,
                      alignment: Alignment.topCenter,
                      child: const MapPin(
                        color: Color(0xFF12A150),
                        icon: Icons.storefront_rounded,
                      ),
                    ),
                    Marker(
                      point: _entrega,
                      width: MapPin.markerWidth,
                      height: MapPin.markerHeight,
                      alignment: Alignment.topCenter,
                      child: const MapPin(
                        color: AppColors.error,
                        icon: Icons.flag_rounded,
                      ),
                    ),
                  ],
                ),
                // El repartidor solo se pinta cuando el servidor tiene su
                // posición: nada de vehículos fantasma.
                if (fix != null)
                  AnimatedBuilder(
                    animation: _ctrl,
                    builder: (_, __) {
                      final pos = _posInterpolada();
                      return MarkerLayer(
                        markers: [
                          Marker(
                            point: pos,
                            width: VehicleGlyph.markerWidth,
                            height: VehicleGlyph.markerHeight,
                            child: VehicleGlyph(
                              // El vehículo REAL del repartidor; si no llegó el
                              // dato, la moto de reparto. Estaba fijo en moto,
                              // así que un domicilio en carro se dibujaba como
                              // moto.
                              kind: vehicleGlyphKindFor(
                                widget.order.driverCard?.vehicleType,
                                fallback: VehicleGlyphKind.delivery,
                                entrega: true,
                              ),
                              headingDegrees: _rumbo(_desde ?? pos, _destinoTramo),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
              ],
            ),
            if (fix == null)
              Positioned(
                left: 8,
                bottom: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'Esperando la ubicación del repartidor',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CancelButton extends StatelessWidget {
  const _CancelButton({required this.onCancel});

  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: AppConstants.minTouchTarget + 8,
      child: OutlinedButton.icon(
        onPressed: onCancel,
        icon: const Icon(Icons.cancel_outlined, color: AppColors.error),
        label: const Text(
          'Cancelar pedido',
          style: TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w600,
            color: AppColors.error,
          ),
        ),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: AppColors.error),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.cardDark : context.cardColor2,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : context.outlineColor,
        ),
      ),
      child: child,
    );
  }
}
