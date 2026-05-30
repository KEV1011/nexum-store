import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

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
            _AddressField(
              controller: _originCtrl,
              label: 'Origen',
              hint: '¿Desde dónde saldrás?',
              required: true,
              onPickAddress: () => _pickAddress(_originCtrl),
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
            _AddressField(
              controller: _destCtrl,
              label: 'Destino',
              hint: '¿A dónde vas?',
              required: true,
              onPickAddress: () => _pickAddress(_destCtrl),
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
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);

    final id = await ref.read(transportProvider.notifier).request(
          serviceType: widget.serviceType,
          origin: _originCtrl.text.trim(),
          destination: _destCtrl.text.trim(),
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

class _AddressField extends StatelessWidget {
  const _AddressField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.required,
    required this.onPickAddress,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final bool required;
  final VoidCallback onPickAddress;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: const Icon(Icons.location_on_outlined),
        suffixIcon: IconButton(
          icon: const Icon(Icons.bookmarks_outlined, size: 20),
          tooltip: 'Mis direcciones',
          onPressed: onPickAddress,
        ),
      ),
      validator: required
          ? (v) => (v == null || v.trim().isEmpty) ? 'Ingresa una dirección' : null
          : null,
    );
  }
}

class _FareEstimateCard extends StatelessWidget {
  const _FareEstimateCard({required this.serviceType});

  final TransportServiceType serviceType;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(serviceType);
    final minFare = serviceType.estimateFare(2);
    final maxFare = serviceType.estimateFare(7);

    return Container(
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
    );
  }
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

IconData _iconOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => Icons.local_taxi_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.particular => Icons.directions_car_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => AppColors.serviceTaxi,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.particular => AppColors.serviceParticular,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };

Color _containerColorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => AppColors.serviceTaxiContainer,
      TransportServiceType.moto => AppColors.serviceMotoContainer,
      TransportServiceType.particular => AppColors.serviceParticularContainer,
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
