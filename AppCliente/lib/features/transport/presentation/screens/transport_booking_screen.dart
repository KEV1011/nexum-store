import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';
import 'package:url_launcher/url_launcher.dart';

/// Pantalla de reserva de servicio de transporte o envío.
class TransportBookingScreen extends ConsumerStatefulWidget {
  const TransportBookingScreen({required this.serviceType, super.key});

  final TransportServiceType serviceType;

  @override
  ConsumerState<TransportBookingScreen> createState() =>
      _TransportBookingScreenState();
}

class _TransportBookingScreenState
    extends ConsumerState<TransportBookingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _originCtrl = TextEditingController();
  final _destCtrl = TextEditingController();
  final _recipientNameCtrl = TextEditingController();
  final _recipientPhoneCtrl = TextEditingController();
  final _packageCtrl = TextEditingController();
  bool _loading = false;

  // Coordenadas resueltas por el autocompletado (null = texto libre; el
  // backend usa el centro de Pamplona como fallback).
  double? _originLat;
  double? _originLng;
  double? _destLat;
  double? _destLng;

  bool get _isEnvios =>
      widget.serviceType == TransportServiceType.envios;

  @override
  void initState() {
    super.initState();
    final defaultAddr = ref.read(defaultAddressProvider);
    if (defaultAddr != null) {
      _originCtrl.text = defaultAddr.fullAddress;
    }
  }

  @override
  void dispose() {
    _originCtrl.dispose();
    _destCtrl.dispose();
    _recipientNameCtrl.dispose();
    _recipientPhoneCtrl.dispose();
    _packageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(widget.serviceType);

    return Scaffold(
      appBar: AppBar(
        title: Text('Solicitar ${widget.serviceType.label}'),
        leading: const BackButton(),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _ServiceHeader(serviceType: widget.serviceType),
            const SizedBox(height: 24),
            _SectionTitle(title: 'Origen y destino'),
            const SizedBox(height: 12),
            AddressAutocompleteField(
              controller: _originCtrl,
              label: 'Origen',
              hint: '¿Desde dónde saldrás?',
              requiredField: true,
              onPlaceSelected: (place) {
                _originLat = place.lat;
                _originLng = place.lng;
              },
              onManualEdit: () {
                _originLat = null;
                _originLng = null;
              },
              suffixIcon: IconButton(
                icon: const Icon(Icons.bookmarks_outlined, size: 20),
                tooltip: 'Mis direcciones',
                onPressed: () => _pickAddress(_originCtrl),
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _useCurrentLocation,
                icon: const Icon(Icons.my_location_rounded, size: 18),
                label: const Text('Usar mi ubicación actual'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  const SizedBox(width: 16),
                  Icon(Icons.more_vert_rounded,
                      color: AppColors.textTertiary, size: 20),
                ],
              ),
            ),
            AddressAutocompleteField(
              controller: _destCtrl,
              label: 'Destino',
              hint: '¿A dónde vas?',
              requiredField: true,
              onPlaceSelected: (place) {
                _destLat = place.lat;
                _destLng = place.lng;
              },
              onManualEdit: () {
                _destLat = null;
                _destLng = null;
              },
              suffixIcon: IconButton(
                icon: const Icon(Icons.bookmarks_outlined, size: 20),
                tooltip: 'Mis direcciones',
                onPressed: () => _pickAddress(_destCtrl),
              ),
            ),
            if (_isEnvios) ...[
              const SizedBox(height: 24),
              _SectionTitle(title: 'Datos del destinatario'),
              const SizedBox(height: 12),
              TextFormField(
                controller: _recipientNameCtrl,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Nombre del destinatario',
                  prefixIcon: Icon(Icons.person_outline_rounded),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Requerido' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _recipientPhoneCtrl,
                keyboardType: TextInputType.phone,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Teléfono del destinatario',
                  prefixIcon: Icon(Icons.phone_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _packageCtrl,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Descripción del paquete (opcional)',
                  prefixIcon: Icon(Icons.inventory_2_outlined),
                  alignLabelWithHint: true,
                ),
              ),
            ],
            const SizedBox(height: 24),
            _FareEstimateCard(serviceType: widget.serviceType),
            const SizedBox(height: 28),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: color,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      'Solicitar ${widget.serviceType.label}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAddress(TextEditingController ctrl) async {
    final addresses = ref.read(addressesProvider);
    if (addresses.isEmpty) return;

    final selected = await showModalBottomSheet<AddressEntity>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddressPicker(addresses: addresses),
    );

    if (selected != null) {
      ctrl.text = selected.fullAddress;
      // Direcciones guardadas no traen coordenadas: invalidar las anteriores.
      if (ctrl == _originCtrl) {
        _originLat = null;
        _originLng = null;
      } else if (ctrl == _destCtrl) {
        _destLat = null;
        _destLng = null;
      }
    }
  }

  /// Toma la ubicación actual del dispositivo (GPS en móvil, API del navegador
  /// en web) y la fija como origen. Así se puede pedir un viaje sin depender del
  /// autocompletado de Google: el matching solo necesita el punto de recogida.
  Future<void> _useCurrentLocation() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        messenger.showSnackBar(const SnackBar(
            content: Text('Activa la ubicación (GPS) del dispositivo.')));
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        messenger.showSnackBar(const SnackBar(
            content: Text('Permiso de ubicación denegado.')));
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      setState(() {
        _originLat = pos.latitude;
        _originLng = pos.longitude;
        _originCtrl.text = 'Mi ubicación actual';
      });
    } catch (_) {
      messenger.showSnackBar(const SnackBar(
          content: Text('No se pudo obtener tu ubicación.')));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    final surgeMultiplier =
        ref.read(surgeEstimateProvider).valueOrNull?.surgeMultiplier ?? 1.0;

    // Con ambos extremos resueltos por autocompletado se usa la ruta real de
    // Google Directions (distancia/ETA); si no, el provider estima.
    RouteInfo? route;
    if (_originLat != null && _destLat != null) {
      route = await ref.read(geoServiceProvider).directions(
            originLat: _originLat!,
            originLng: _originLng!,
            destLat: _destLat!,
            destLng: _destLng!,
          );
    }

    final id = await ref.read(transportProvider.notifier).request(
          serviceType: widget.serviceType,
          origin: _originCtrl.text.trim(),
          destination: _destCtrl.text.trim(),
          originLat: _originLat,
          originLng: _originLng,
          destLat: _destLat,
          destLng: _destLng,
          distanceKm: route?.distanceKm,
          etaMinutes: route?.durationMinutes,
          recipientName: _isEnvios ? _recipientNameCtrl.text.trim() : null,
          recipientPhone: _isEnvios
              ? (_recipientPhoneCtrl.text.trim().isEmpty
                  ? null
                  : _recipientPhoneCtrl.text.trim())
              : null,
          packageDescription: _isEnvios
              ? (_packageCtrl.text.trim().isEmpty
                  ? null
                  : _packageCtrl.text.trim())
              : null,
          surgeMultiplier: surgeMultiplier,
        );

    if (!mounted) return;

    final trip = ref.read(transportByIdProvider(id));
    final fare = trip?.estimatedFare ?? widget.serviceType.estimateFare(4);

    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PaymentSheet(
        tripId: id,
        fare: fare,
        serviceType: widget.serviceType,
        ref: ref,
      ),
    );

    if (!mounted) return;
    context.go(AppRoutes.transportTrackingPath(id));
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _ServiceHeader extends StatelessWidget {
  const _ServiceHeader({required this.serviceType});

  final TransportServiceType serviceType;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(serviceType);
    final containerColor = _containerColorOf(serviceType);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: containerColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(_iconOf(serviceType), color: color, size: 28),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  serviceType.label,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  serviceType.description,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: AppColors.textSecondary,
      ),
    );
  }
}

class _FareEstimateCard extends ConsumerWidget {
  const _FareEstimateCard({required this.serviceType});

  final TransportServiceType serviceType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = _colorOf(serviceType);
    final minFare = serviceType.estimateFare(2);
    final maxFare = serviceType.estimateFare(7);
    final surgeAsync = ref.watch(surgeEstimateProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceVariantLight,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              const Icon(Icons.receipt_outlined,
                  color: AppColors.textSecondary, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Precio estimado',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${CurrencyFormatter.format(minFare)} – '
                      '${CurrencyFormatter.format(maxFare)}',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                  ],
                ),
              ),
              const Text(
                '2–7 km',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
        surgeAsync.when(
          data: (estimate) => estimate != null && estimate.isSurge
              ? _SurgeBadge(multiplier: estimate.surgeMultiplier)
              : const SizedBox.shrink(),
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
        ),
      ],
    );
  }
}

class _SurgeBadge extends StatelessWidget {
  const _SurgeBadge({required this.multiplier});

  final double multiplier;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF3E0),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFFFB74D)),
      ),
      child: Row(
        children: [
          const Icon(Icons.trending_up_rounded,
              color: Color(0xFFE65100), size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Tarifa más alta por alta demanda '
              '×${multiplier.toStringAsFixed(1)}',
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xFFBF360C),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

IconData _iconOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => Icons.directions_car_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => AppColors.serviceParticular,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };

Color _containerColorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.transporte => AppColors.serviceParticularContainer,
      TransportServiceType.moto => AppColors.serviceMotoContainer,
      TransportServiceType.envios => AppColors.serviceEnviosContainer,
    };

class _AddressPicker extends StatelessWidget {
  const _AddressPicker({required this.addresses});

  final List<AddressEntity> addresses;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
          child: Text(
            'Mis direcciones',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        const Divider(height: 1),
        ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.4,
          ),
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: addresses.length,
            itemBuilder: (_, i) {
              final addr = addresses[i];
              return ListTile(
                leading: const Icon(Icons.location_on_outlined,
                    color: AppColors.primary),
                title: Text(
                  addr.alias,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  addr.fullAddress,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                onTap: () => Navigator.of(context).pop(addr),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }
}

// ── Payment sheet ─────────────────────────────────────────────────────────────

class _PaymentSheet extends StatefulWidget {
  const _PaymentSheet({
    required this.tripId,
    required this.fare,
    required this.serviceType,
    required this.ref,
  });

  final String tripId;
  final double fare;
  final TransportServiceType serviceType;
  final WidgetRef ref;

  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  bool _loading = false;
  String? _error;

  Future<void> _payWithWompi() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final dio = widget.ref.read(apiClientProvider);
      final res = await dio.post<Map<String, dynamic>>(
        '/client/payments/init',
        data: {
          'tripId': widget.tripId,
          'amount': widget.fare.round(),
          'description': 'Pago viaje ${widget.serviceType.label}',
        },
      );
      final responseData = res.data ?? {};
      final innerData = responseData['data'] as Map<String, dynamic>?;
      final paymentUrl = innerData?['paymentUrl'] as String? ??
          responseData['paymentUrl'] as String?;

      if (paymentUrl == null || paymentUrl.isEmpty) {
        throw Exception('No se recibió URL de pago');
      }

      final uri = Uri.parse(paymentUrl);
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw Exception('No se pudo abrir el enlace de pago');
      }

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() {
        _loading = false;
        _error = 'No se pudo iniciar el pago. Intenta de nuevo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(widget.serviceType);

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 20),
            decoration: BoxDecoration(
              color: AppColors.outlineLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Text(
            'Método de pago',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'Tarifa estimada',
            style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 4),
          Text(
            CurrencyFormatter.format(widget.fare),
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF00B4D8),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: _loading ? null : _payWithWompi,
              icon: _loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.credit_card_rounded),
              label: const Text(
                'Pagar con Wompi',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: _loading
                  ? null
                  : () => Navigator.of(context).pop(false),
              icon: const Icon(Icons.payments_outlined),
              label: const Text(
                'Pagar en efectivo',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
