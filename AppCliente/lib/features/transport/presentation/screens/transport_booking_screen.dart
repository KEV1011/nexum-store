import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/config/app_config_provider.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:nexum_client/features/payments/presentation/payment_checkout.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/domain/entities/trip_option_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';
import 'package:nexum_client/shared/widgets/vehicle_glyph.dart';

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

  // Coordenadas resueltas por el autocompletado, por el mapa o por el GPS.
  // Null = solo hay texto escrito a mano, y con eso NO se puede pedir el
  // viaje: el emparejamiento busca conductores alrededor del punto de
  // recogida, así que sin punto real la solicitud saldría a buscar a otra
  // parte. El botón queda deshabilitado y se explica qué falta.
  double? _originLat;
  double? _originLng;
  double? _destLat;
  double? _destLng;

  bool get _isEnvios =>
      widget.serviceType == TransportServiceType.envios;

  /// Categoría elegida en el selector ('TAXI' | 'PARTICULAR' | 'MOTO') y su
  /// precio, tal como los cotizó el servidor. Null mientras no haya elección.
  TripOptionEntity? _categoria;

  /// El selector solo aplica a viajes de pasajero. Los envíos no eligen
  /// categoría (los lleva cualquier vehículo) y conservan su tarjeta.
  bool get _eligeCategoria => !_isEnvios;

  /// Los cuatro puntos del trayecto, o null si aún falta alguno.
  TripRoutePoints? get _puntos =>
      (_originLat != null && _originLng != null &&
              _destLat != null && _destLng != null)
          ? TripRoutePoints(
              originLat: _originLat!,
              originLng: _originLng!,
              destLat: _destLat!,
              destLng: _destLng!,
            )
          : null;

  /// Qué punto falta por marcar, o null si ya se puede pedir el viaje.
  /// Escribir la dirección no basta: hace falta la coordenada, que sale del
  /// autocompletado, del mapa o del GPS.
  String? get _faltaPunto {
    final sinOrigen = _originLat == null;
    final sinDestino = _destLat == null;
    if (sinOrigen && sinDestino) {
      return 'Marca en el mapa el punto de recogida y el de destino, o usa tu '
          'ubicación actual para la recogida.';
    }
    if (sinOrigen) {
      return 'Falta el punto exacto de recogida: toca "Usar mi ubicación '
          'actual" o elígelo en el mapa.';
    }
    if (sinDestino) {
      return 'Falta el punto exacto del destino: elígelo en el mapa con el '
          'icono de la derecha del campo.';
    }
    return null;
  }

  /// Con el trayecto listo hay que elegir categoría antes de pedir: sin ella
  /// no se sabe si es un taxi o una moto, y son precios y vehículos distintos.
  bool get _faltaCategoria =>
      _eligeCategoria && _puntos != null && _categoria == null;

  /// El botón dice qué se pide y cuánto cuesta. Un "Solicitar" a secas obliga a
  /// mirar hacia arriba para recordar qué se eligió y por cuánto.
  ///
  /// [sinVehiculos] = la cotización llegó y NINGUNA categoría tiene vehículo
  /// cerca. Sin esto el botón se quedaba pidiendo "elige una categoría" cuando
  /// no había ninguna que elegir: un callejón sin salida sin explicación.
  String _textoBotonCon({required bool sinVehiculos}) {
    final c = _categoria;
    if (c != null) {
      return 'Pedir ${c.nombre} · ${CurrencyFormatter.format(c.fare.toDouble())}';
    }
    if (sinVehiculos) return 'No hay vehículos disponibles ahora';
    if (_faltaCategoria) return 'Elige una categoría';
    return 'Solicitar ${widget.serviceType.label}';
  }

  @override
  void initState() {
    super.initState();
    final defaultAddr = ref.read(defaultAddressProvider);
    if (defaultAddr != null) {
      _originCtrl.text = defaultAddr.fullAddress;
      // Con sus coordenadas, no solo el texto: si se copiaba solo el nombre, el
      // punto quedaba sin resolver y el botón salía deshabilitado aunque el
      // campo se viera lleno — que es lo más desconcertante posible.
      _originLat = defaultAddr.lat;
      _originLng = defaultAddr.lng;
    }
    // Sin dirección guardada (o guardada sin punto), se intenta el GPS: pedir
    // un viaje desde donde uno está es el caso normal, y así el formulario
    // nace listo en vez de con el botón apagado esperando que la persona
    // descubra el icono del mapa.
    if (_originLat == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_useCurrentLocation(silencioso: true));
      });
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

    // Misma clave que el selector ⇒ misma respuesta cacheada, no una segunda
    // consulta. Solo se mira si quedó alguna categoría con vehículo cerca.
    final puntos = _puntos;
    final cotizacion = (_eligeCategoria && puntos != null)
        ? ref.watch(tripOptionsProvider(puntos)).valueOrNull
        : null;
    final sinVehiculos =
        cotizacion != null && cotizacion.disponibles.isEmpty;

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
              // `setState`: el aviso de abajo y el botón dependen de que haya
              // punto resuelto, así que la pantalla tiene que repintarse.
              onPlaceSelected: (place) => setState(() {
                _originLat = place.lat;
                _originLng = place.lng;
              }),
              onManualEdit: () {
                if (_originLat == null) return;
                setState(() {
                  _originLat = null;
                  _originLng = null;
                });
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
                onPressed: () => unawaited(_useCurrentLocation()),
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
                      color: context.textTertiaryColor, size: 20),
                ],
              ),
            ),
            AddressAutocompleteField(
              controller: _destCtrl,
              label: 'Destino',
              hint: '¿A dónde vas?',
              requiredField: true,
              onPlaceSelected: (place) => setState(() {
                _destLat = place.lat;
                _destLng = place.lng;
              }),
              onManualEdit: () {
                if (_destLat == null) return;
                setState(() {
                  _destLat = null;
                  _destLng = null;
                });
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
            // Con el trayecto resuelto, el selector de categorías con los
            // precios del servidor; si aún falta un punto, no hay nada que
            // cotizar y se mantiene la tarjeta de siempre.
            if (_eligeCategoria && puntos != null)
              _CategorySelector(
                puntos: puntos,
                seleccionada: _categoria,
                entroPor: widget.serviceType,
                onSeleccionar: (o) {
                  if (!mounted) return;
                  setState(() => _categoria = o);
                },
              )
            else
              _FareEstimateCard(serviceType: widget.serviceType),
            if (_faltaPunto != null) ...[
              const SizedBox(height: 16),
              _AvisoPunto(texto: _faltaPunto!),
            ],
            const SizedBox(height: 28),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: color,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: (_loading || _faltaPunto != null || _faltaCategoria)
                  ? null
                  : _submit,
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
                      _textoBotonCon(sinVehiculos: sinVehiculos),
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
      // Las direcciones guardadas SÍ traen su punto (`AddressEntity.lat/lng`,
      // que se resuelve al guardarlas). El comentario anterior decía lo
      // contrario y por eso se descartaban: elegir "Casa" dejaba el campo lleno
      // y el botón de pedir apagado, sin explicación visible.
      setState(() {
        ctrl.text = selected.fullAddress;
        if (ctrl == _originCtrl) {
          _originLat = selected.lat;
          _originLng = selected.lng;
        } else if (ctrl == _destCtrl) {
          _destLat = selected.lat;
          _destLng = selected.lng;
        }
      });
    }
  }

  /// Toma la ubicación actual del dispositivo (GPS en móvil, API del navegador
  /// en web) y la fija como origen. Así se puede pedir un viaje sin depender del
  /// autocompletado de Google: el matching solo necesita el punto de recogida.
  /// [silencioso] = intento automático al abrir la pantalla: si no hay
  /// permiso o GPS no se molesta a nadie con un aviso, simplemente queda el
  /// mensaje de "falta el punto de recogida" y sus dos botones. Los avisos
  /// solo salen cuando la persona TOCÓ "usar mi ubicación" y espera respuesta.
  Future<void> _useCurrentLocation({bool silencioso = false}) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (!silencioso) {
          messenger.showSnackBar(const SnackBar(
              content: Text('Activa la ubicación (GPS) del dispositivo.')));
        }
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (!silencioso) {
          messenger.showSnackBar(const SnackBar(
              content: Text('Permiso de ubicación denegado.')));
        }
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
      if (!silencioso) {
        messenger.showSnackBar(const SnackBar(
            content: Text('No se pudo obtener tu ubicación.')));
      }
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

    final String id;
    try {
      id = await ref.read(transportProvider.notifier).request(
            // La categoría elegida MANDA sobre la pestaña por la que se entró:
            // quien abrió "Transporte" y eligió Taxi pide un taxi, y así queda
            // registrado y tarifado.
            serviceType: _categoria?.serviceType ?? widget.serviceType,
            categoria: _categoria?.categoria,
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
    } catch (e) {
      // El servidor no recibió el viaje: se informa en lugar de simular, y con
      // el motivo que dio él (el provider ya lo propaga) en vez de suponer que
      // siempre es la conexión.
      if (!mounted) return;
      setState(() => _loading = false);
      final motivo = e is Exception
          ? e.toString().replaceFirst('Exception: ', '')
          : 'No se pudo solicitar el viaje. Revisa tu conexión e inténtalo de nuevo.';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(motivo)));
      return;
    }

    if (!mounted) return;

    final trip = ref.read(transportByIdProvider(id));
    // El importe a pagar es el del viaje que creó el servidor; si faltara, el
    // de la categoría cotizada. La estimación local queda como último recurso.
    final fare = trip?.estimatedFare ??
        _categoria?.fare.toDouble() ??
        widget.serviceType.estimateFare(4);

    final choice = await showModalBottomSheet<_PayChoice>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _PaymentSheet(fare: fare, serviceType: widget.serviceType),
    );

    if (!mounted) return;

    // Pago en línea: se cierra el ciclo dentro de la app (Wompi + sondeo de
    // estado). Efectivo: el pasajero paga al conductor al final del viaje.
    if (choice == _PayChoice.online) {
      await showPaymentCheckout(
        context,
        ref,
        amount: fare,
        description: 'Pago viaje ${widget.serviceType.label}',
        tripId: id,
      );
      if (!mounted) return;
    }

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
                  style: TextStyle(
                    fontSize: 13,
                    color: context.textSecondaryColor,
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
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: context.textSecondaryColor,
      ),
    );
  }
}

/// Explica qué punto falta por marcar mientras el botón está deshabilitado.
/// Un botón apagado sin motivo se lee como una app rota; con el motivo, se
/// lee como un paso que falta.
class _AvisoPunto extends StatelessWidget {
  const _AvisoPunto({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.warningContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.place_outlined, size: 20, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              texto,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: context.textPrimaryColor,
              ),
            ),
          ),
        ],
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
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.receipt_outlined,
                  color: context.textSecondaryColor, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Precio estimado',
                      style: TextStyle(
                        fontSize: 12,
                        color: context.textSecondaryColor,
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
              Text(
                '2–7 km',
                style: TextStyle(
                  fontSize: 12,
                  color: context.textTertiaryColor,
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

/// Selector de categoría, con los precios que cotizó el SERVIDOR.
///
/// Sustituye a la tarjeta de "precio estimado", que mostraba un rango sacado de
/// una fórmula escrita en la propia app: el número no era el que se iba a
/// cobrar y además dependía de la versión instalada.
class _CategorySelector extends ConsumerWidget {
  const _CategorySelector({
    required this.puntos,
    required this.seleccionada,
    required this.onSeleccionar,
    required this.entroPor,
  });

  final TripRoutePoints puntos;
  final TripOptionEntity? seleccionada;
  final void Function(TripOptionEntity) onSeleccionar;

  /// La pestaña por la que entró el pasajero: se usa para preseleccionar. Quien
  /// tocó "Moto" espera una moto, no tener que elegirla otra vez.
  final TransportServiceType entroPor;

  /// Preselección: la categoría de la pestaña por la que entró si está
  /// disponible; si no, la más barata de las que hay. Nunca una apagada — el
  /// botón se quedaría muerto sin decir por qué.
  TripOptionEntity? _preseleccion(List<TripOptionEntity> opciones) {
    final disponibles = opciones.where((o) => o.disponible).toList();
    if (disponibles.isEmpty) return null;
    final preferida = entroPor == TransportServiceType.moto ? 'MOTO' : 'TAXI';
    for (final o in disponibles) {
      if (o.categoria == preferida) return o;
    }
    for (final o in disponibles) {
      if (o.cheapest) return o;
    }
    return disponibles.first;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tripOptionsProvider(puntos));

    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 28),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      // Un fallo al cotizar se DICE. Dejar la tarjeta en blanco haría pedir un
      // viaje sin saber cuánto cuesta.
      error: (e, _) => _AvisoPunto(
        texto: e is Exception
            ? e.toString().replaceFirst('Exception: ', '')
            : 'No pudimos calcular las tarifas. Revisa tu conexión.',
      ),
      data: (opciones) {
        if (opciones.opciones.isEmpty) {
          return const _AvisoPunto(
            texto: 'No hay categorías disponibles para este trayecto.',
          );
        }
        // Preselección y RESINCRONIZACIÓN. Lo segundo importa tanto como lo
        // primero: si el pasajero cambia el destino después de elegir, esta
        // lista se vuelve a cotizar pero la elección guardada se quedaría con
        // el precio del trayecto anterior — el botón mostraría una cifra que
        // ya no es la suya. Se aplica después del build: cambiar el estado del
        // padre mientras se construye este widget es un error en Flutter.
        TripOptionEntity? elegida;
        if (seleccionada != null) {
          for (final o in opciones.opciones) {
            if (o.categoria == seleccionada!.categoria) {
              elegida = o;
              break;
            }
          }
        }
        final TripOptionEntity? aReportar;
        if (elegida == null || !elegida.disponible) {
          aReportar = _preseleccion(opciones.opciones);
        } else if (elegida.fare != seleccionada!.fare ||
            elegida.etaMinutes != seleccionada!.etaMinutes) {
          aReportar = elegida;
        } else {
          aReportar = null;
        }
        final nueva = aReportar;
        if (nueva != null) {
          WidgetsBinding.instance
              .addPostFrameCallback((_) => onSeleccionar(nueva));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(title: 'Elige tu viaje'),
            const SizedBox(height: 4),
            Text(
              '${opciones.distanceKm.toStringAsFixed(1)} km · '
              '${opciones.durationMinutes} min',
              style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
            ),
            // Sin ruta real de Google el trayecto se estimó en línea recta. Se
            // avisa: el precio es aproximado y conviene que se sepa antes, no
            // al recibir el cobro.
            if (!opciones.rutaReal) ...[
              const SizedBox(height: 4),
              Text(
                'Distancia aproximada: el precio puede variar según la ruta.',
                style: TextStyle(fontSize: 11, color: context.textTertiaryColor),
              ),
            ],
            const SizedBox(height: 12),
            ...opciones.opciones.map(
              (o) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _CategoryCard(
                  opcion: o,
                  seleccionada: o.categoria == seleccionada?.categoria,
                  onTap: o.disponible ? () => onSeleccionar(o) : null,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.opcion,
    required this.seleccionada,
    required this.onTap,
  });

  final TripOptionEntity opcion;
  final bool seleccionada;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final glyph = vehicleGlyphKindFor(opcion.categoria);
    final activa = opcion.disponible;
    final acento = seleccionada
        ? AppColors.serviceParticular
        : context.textSecondaryColor;

    return Opacity(
      // Apagada, no escondida: si desapareciera, el selector cambiaría de
      // tamaño solo cada vez que un conductor se conecta o se va.
      opacity: activa ? 1 : 0.45,
      child: Material(
        color: seleccionada
            ? AppColors.serviceParticularContainer
            : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: seleccionada ? acento : Colors.transparent,
                width: 1.6,
              ),
            ),
            child: Row(
              children: [
                Icon(vehicleGlyphIcon(glyph), size: 30, color: acento),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            opcion.nombre,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: context.textPrimaryColor,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Icon(Icons.person_outline_rounded,
                              size: 13, color: context.textTertiaryColor),
                          Text(
                            '${opcion.capacidad}',
                            style: TextStyle(
                              fontSize: 12,
                              color: context.textTertiaryColor,
                            ),
                          ),
                          if (opcion.cheapest) ...[
                            const SizedBox(width: 8),
                            const _Etiqueta(
                                texto: 'La más barata', color: Color(0xFF0E9F6E)),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _subtitulo(),
                        style: TextStyle(
                          fontSize: 12,
                          color: context.textSecondaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      CurrencyFormatter.format(opcion.fare.toDouble()),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimaryColor,
                      ),
                    ),
                    // La tarifa del taxi la fija el decreto municipal. Decirlo
                    // es parte de por qué el servicio es legal, y explica que
                    // su precio no baje aunque otra categoría cueste menos.
                    if (opcion.regulada)
                      Text(
                        'Tarifa autorizada',
                        style: TextStyle(
                            fontSize: 10, color: context.textTertiaryColor),
                      )
                    else if (opcion.conRecargo)
                      Text(
                        'x${opcion.surgeMultiplier.toStringAsFixed(1)} demanda',
                        style: const TextStyle(
                            fontSize: 10, color: Color(0xFFD97706)),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _subtitulo() {
    if (!opcion.disponible) return 'Sin ${opcion.nombre.toLowerCase()} cerca ahora';
    final eta = opcion.etaMinutes;
    final cuantos = opcion.availableNearby;
    final cerca = cuantos == 1 ? '1 cerca' : '$cuantos cerca';
    return eta != null ? '$eta min · $cerca' : cerca;
  }
}

class _Etiqueta extends StatelessWidget {
  const _Etiqueta({required this.texto, required this.color});

  final String texto;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        texto,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
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

/// Método de pago elegido por el pasajero para el viaje.
enum _PayChoice { online, cash }

/// Selector de método de pago del viaje. El pago en línea (Wompi + sondeo) lo
/// corre el llamador con `showPaymentCheckout`; en efectivo se paga al conductor.
class _PaymentSheet extends ConsumerWidget {
  const _PaymentSheet({required this.fare, required this.serviceType});

  final double fare;
  final TransportServiceType serviceType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = _colorOf(serviceType);
    // Sin pasarela configurada no se ofrece pagar en línea: ese botón abría un
    // checkout que no cobraba nada y el conductor cobraba en efectivo igual.
    final pagoEnLinea =
        ref.watch(appConfigProvider).valueOrNull?.pagoEnLinea ?? false;

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
              color: context.outlineColor,
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
            style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 4),
          Text(
            CurrencyFormatter.format(fare),
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
          const SizedBox(height: 24),
          if (pagoEnLinea) ...[
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
                onPressed: () => Navigator.of(context).pop(_PayChoice.online),
                icon: const Icon(Icons.credit_card_rounded),
                label: const Text(
                  'Pagar en línea (tarjeta, Nequi, PSE)',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          SizedBox(
            width: double.infinity,
            child: pagoEnLinea
                ? OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => Navigator.of(context).pop(_PayChoice.cash),
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text(
                      'Pagar en efectivo al conductor',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                    ),
                  )
                // Único método disponible: se presenta como la acción
                // principal, no como el plan B de algo que no existe.
                : FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: color,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => Navigator.of(context).pop(_PayChoice.cash),
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text(
                      'Continuar · pago en efectivo',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
