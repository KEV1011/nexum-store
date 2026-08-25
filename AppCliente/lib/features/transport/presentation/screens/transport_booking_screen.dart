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
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:nexum_client/features/addresses/presentation/providers/addresses_provider.dart';
import 'package:nexum_client/features/payments/presentation/payment_checkout.dart';
import 'package:nexum_client/features/payments/presentation/providers/payment_method_provider.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/domain/entities/trip_option_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/features/transport/presentation/widgets/route_preview_map.dart';
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

  /// Manda la hoja arriba cuando sale el teclado. Sin esto, el campo de
  /// dirección queda debajo del teclado y se escribe a ciegas — que es
  /// exactamente lo que ya pasó una vez en la pantalla de pedidos.
  final _hojaCtrl = DraggableScrollableController();
  bool _tecladoAbierto = false;
  bool _teniaTrayecto = false;

  /// Con el trayecto puesto, los campos de dirección se pliegan y en su lugar
  /// queda una píldora sobre el mapa. Es lo que hacen las demás plataformas y
  /// no es capricho: dos campos de texto y el botón de "usar mi ubicación"
  /// ocupan media hoja, que es justo el sitio donde tienen que verse las
  /// categorías. Se vuelve a abrir tocando la píldora.
  bool _editandoDirecciones = false;

  // Coordenadas resueltas por el autocompletado, por el mapa o por el GPS.
  // Null = solo hay texto escrito a mano, y con eso NO se puede pedir el
  // viaje: el emparejamiento busca conductores alrededor del punto de
  // recogida, así que sin punto real la solicitud saldría a buscar a otra
  // parte. El botón queda deshabilitado y se explica qué falta.
  double? _originLat;
  double? _originLng;
  double? _destLat;
  double? _destLng;

  /// Paradas intermedias que el pasajero añade («pasa por»). Máx. 6, igual que
  /// el intermunicipal — el límite lo impone el backend y aquí solo se respeta.
  final List<_ParadaEdit> _paradas = [];
  static const int _maxParadas = 6;

  /// Las paradas CON punto, en el formato del servidor. Solo esas cuentan para
  /// el precio: una escrita a mano no se puede medir.
  String get _paradasClave => _paradas
      .where((p) => p.lat != null && p.lng != null)
      .map((p) => '${p.lat},${p.lng}')
      .join(';');

  /// Lo que se manda al pedir: aquí sí van todas, con punto o sin él. Una
  /// parada sin coordenada no cambia el precio pero el conductor tiene que
  /// leerla igual («donde mi tía») para saber por dónde pasa.
  List<Map<String, dynamic>> get _paradasParaPedir {
    final out = <Map<String, dynamic>>[];
    for (final p in _paradas) {
      final nombre = p.ctrl.text.trim();
      if (nombre.isEmpty) continue;
      out.add({
        'name': nombre,
        // El spread es necesario: un `if` de colección solo protege la
        // ENTRADA siguiente, así que sin él 'lng' se colaría siempre y una
        // parada escrita a mano viajaría con longitud y sin latitud.
        if (p.lat != null && p.lng != null) ...{'lat': p.lat, 'lng': p.lng},
        'order': out.length,
      });
    }
    return out;
  }

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
              paradas: _paradasClave,
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
    _hojaCtrl.dispose();
    for (final p in _paradas) {
      p.ctrl.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Misma clave que el selector ⇒ misma respuesta cacheada, no una segunda
    // consulta. Solo se mira si quedó alguna categoría con vehículo cerca.
    final puntos = _puntos;
    final cotizacion = (_eligeCategoria && puntos != null)
        ? ref.watch(tripOptionsProvider(puntos)).valueOrNull
        : null;
    final sinVehiculos = cotizacion != null && cotizacion.disponibles.isEmpty;

    // Los ENVÍOS conservan el formulario: llevan datos del destinatario y no
    // eligen categoría, así que un mapa protagonista solo les quitaría sitio.
    if (!_eligeCategoria) {
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
              ..._camposDelViaje(),
              const SizedBox(height: 24),
              _FareEstimateCard(serviceType: widget.serviceType),
              if (_faltaPunto != null) ...[
                const SizedBox(height: 16),
                _AvisoPunto(texto: _faltaPunto!),
              ],
              const SizedBox(height: 28),
              _botonPedir(sinVehiculos: sinVehiculos),
              const SizedBox(height: 16),
            ],
          ),
        ),
      );
    }

    // Viaje de pasajero: el mapa manda y las opciones viven en una hoja
    // arrastrable encima, como en el resto de plataformas. La hoja arranca casi
    // entera mientras faltan puntos —ahí lo único que hay que hacer es
    // escribir— y se recoge cuando ya hay trayecto que mirar.
    final hayTrayecto = puntos != null;
    final inicial = hayTrayecto ? 0.56 : 0.9;
    final medios = MediaQuery.of(context);
    final alto = medios.size.height;
    final tecladoAlto = medios.viewInsets.bottom;
    _sincronizarConTeclado(tecladoAlto > 0);
    _sincronizarConTrayecto(hayTrayecto);

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: _mapaOPlaceholder(inicial * alto)),
          // Píldora con el trayecto, como en las demás plataformas: con las
          // direcciones ya puestas no hacen falta dos campos de texto ocupando
          // media hoja. Tocarla los devuelve.
          if (puntos != null && !_editandoDirecciones)
            Positioned(
              top: medios.padding.top + 8,
              left: 64,
              right: 12,
              child: _PildoraTrayecto(
                origen: _originCtrl.text.trim(),
                destino: _destCtrl.text.trim(),
                onTap: () => setState(() => _editandoDirecciones = true),
              ),
            ),
          // Botón de volver flotante en vez de una AppBar transparente: sobre
          // las teselas del mapa una barra sin fondo se lee mal, y con la hoja
          // casi entera se le metía por debajo.
          Positioned(
            top: medios.padding.top + 8,
            left: 12,
            child: Material(
              color: Theme.of(context).colorScheme.surface,
              shape: const CircleBorder(),
              elevation: 3,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => safeBack(context),
                child: const Padding(
                  padding: EdgeInsets.all(10),
                  child: Icon(Icons.arrow_back_rounded, size: 20),
                ),
              ),
            ),
          ),
          DraggableScrollableSheet(
            controller: _hojaCtrl,
            initialChildSize: inicial,
            minChildSize: 0.28,
            maxChildSize: 0.92,
            snap: true,
            snapSizes: const [0.28, 0.56, 0.92],
            builder: (context, scrollController) => Container(
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(22)),
                boxShadow: const [
                  BoxShadow(color: AppColors.shadow, blurRadius: 18),
                ],
              ),
              child: Form(
                key: _formKey,
                child: ListView(
                  controller: scrollController,
                  // El hueco del teclado se suma abajo: si no, el último campo
                  // queda justo debajo de él y no hay forma de verlo.
                  padding: EdgeInsets.fromLTRB(16, 10, 16, 24 + tecladoAlto),
                  children: [
                    Center(
                      child: Container(
                        width: 42,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 14),
                        decoration: BoxDecoration(
                          color: context.outlineColor,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Center(
                      child: Text(
                        puntos == null || _editandoDirecciones
                            ? 'Solicitar ${widget.serviceType.label}'
                            : 'Elige tu viaje',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimaryColor,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (puntos == null || _editandoDirecciones) ...[
                      ..._camposDelViaje(),
                      if (puntos != null)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () =>
                                setState(() => _editandoDirecciones = false),
                            child: const Text('Listo'),
                          ),
                        ),
                      const SizedBox(height: 20),
                    ],
                    if (puntos != null && !_editandoDirecciones)
                      _CategorySelector(
                        puntos: puntos,
                        seleccionada: _categoria,
                        entroPor: widget.serviceType,
                        onSeleccionar: (o) {
                          if (!mounted) return;
                          setState(() => _categoria = o);
                        },
                      ),
                    if (_faltaPunto != null) ...[
                      const SizedBox(height: 8),
                      _AvisoPunto(texto: _faltaPunto!),
                    ],
                    const SizedBox(height: 16),
                    // El método de pago se elige AQUÍ, antes de confirmar.
                    // Antes se preguntaba después de crear el viaje: quien
                    // cerraba esa hoja se quedaba con el viaje ya buscando
                    // conductor y sin haber decidido cómo iba a pagar.
                    const _FilaMetodoPago(),
                    const SizedBox(height: 14),
                    _botonPedir(sinVehiculos: sinVehiculos),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Recoge la hoja en cuanto hay trayecto que mirar.
  ///
  /// Hace falta hacerlo a mano: `initialChildSize` solo se lee la primera vez
  /// que se construye la hoja, así que cambiar ese número en los siguientes
  /// repintados no la mueve — la hoja se habría quedado tapando el mapa justo
  /// cuando por fin había algo que enseñar.
  void _sincronizarConTrayecto(bool hayTrayecto) {
    if (hayTrayecto == _teniaTrayecto) return;
    _teniaTrayecto = hayTrayecto;
    if (_tecladoAbierto) return; // el teclado manda mientras esté abierto
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_hojaCtrl.isAttached) return;
      _hojaCtrl.animateTo(
        hayTrayecto ? 0.56 : 0.9,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOut,
      );
    });
  }

  /// Sube la hoja al abrirse el teclado y la devuelve a su sitio al cerrarse.
  /// Se hace después del frame: mover la hoja mientras se construye la pantalla
  /// es pelearse con el propio layout.
  void _sincronizarConTeclado(bool abierto) {
    if (abierto == _tecladoAbierto) return;
    _tecladoAbierto = abierto;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_hojaCtrl.isAttached) return;
      final destino = abierto ? 0.92 : (_puntos != null ? 0.56 : 0.9);
      _hojaCtrl.animateTo(
        destino,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  /// El mapa del trayecto, o una superficie neutra mientras no haya un punto
  /// de recogida. No se centra en ninguna parte "por defecto": un mapa apuntando
  /// a un sitio que nadie eligió es peor que no tener mapa.
  Widget _mapaOPlaceholder(double tapadoPorLaHoja) {
    if (_originLat == null || _originLng == null) {
      return ColoredBox(
        color: context.surfaceVariantColor,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.map_outlined, size: 34, color: context.textTertiaryColor),
                const SizedBox(height: 8),
                Text(
                  'Marca el punto de recogida y verás el trayecto aquí',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return RoutePreviewMap(
      // La clave fuerza a rehacer el mapa si cambia el trayecto: así el
      // encuadre se recalcula en vez de quedarse en el viaje anterior.
      key: ValueKey('$_originLat,$_originLng>$_destLat,$_destLng'),
      originLat: _originLat!,
      originLng: _originLng!,
      destLat: _destLat,
      destLng: _destLng,
      bottomPadding: tapadoPorLaHoja,
      // Los minutos que se pintan sobre el mapa son los de la categoría
      // elegida: cambiar de taxi a moto cambia la espera, y el mapa tiene que
      // decir lo mismo que la fila seleccionada.
      etaMinutos: _categoria?.etaMinutes,
    );
  }

  /// Botón de confirmar. Vive aparte porque lo usan las dos disposiciones
  /// (el formulario de envíos y la hoja del viaje de pasajero).
  Widget _botonPedir({required bool sinVehiculos}) {
    final color = _colorOf(widget.serviceType);
    return FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: color,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed:
          (_loading || _faltaPunto != null || _faltaCategoria) ? null : _submit,
      child: _loading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Text(
              _textoBotonCon(sinVehiculos: sinVehiculos),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
    );
  }

  /// Origen, destino y —solo en envíos— los datos del destinatario.
  List<Widget> _camposDelViaje() {
    return [
      AddressAutocompleteField(
        controller: _originCtrl,
        label: 'Origen',
        hint: '¿Desde dónde saldrás?',
        requiredField: true,
        // `setState`: el mapa, el aviso y el botón dependen de que haya punto
        // resuelto, así que la pantalla tiene que repintarse.
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
            Icon(Icons.more_vert_rounded, color: context.textTertiaryColor, size: 20),
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

      // ── Paradas por el camino ────────────────────────────────────────────
      // Van con autocompletado, no con un campo de texto suelto, porque solo
      // las que tienen punto se pueden medir: una parada sin coordenada se
      // guarda para que el conductor la lea, pero no cambia el precio.
      for (var i = 0; i < _paradas.length; i++) ...[
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: AddressAutocompleteField(
                controller: _paradas[i].ctrl,
                label: 'Parada ${i + 1}',
                hint: '¿Por dónde pasamos?',
                onPlaceSelected: (place) => setState(() {
                  _paradas[i].lat = place.lat;
                  _paradas[i].lng = place.lng;
                }),
                onManualEdit: () {
                  if (_paradas[i].lat == null) return;
                  // Al reescribir a mano se pierde el punto: mantenerlo
                  // cobraría por un desvío a un sitio que ya no es ese.
                  setState(() {
                    _paradas[i].lat = null;
                    _paradas[i].lng = null;
                  });
                },
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close_rounded, size: 20),
              tooltip: 'Quitar parada',
              onPressed: () => setState(() => _paradas.removeAt(i).ctrl.dispose()),
            ),
          ],
        ),
      ],
      if (!_isEnvios && _paradas.length < _maxParadas) ...[
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _paradas.add(_ParadaEdit())),
            icon: const Icon(Icons.add_location_alt_outlined, size: 18),
            label: Text(
              _paradas.isEmpty ? 'Agregar parada' : 'Agregar otra parada',
            ),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              visualDensity: VisualDensity.compact,
            ),
          ),
        ),
        if (_paradas.any((p) => p.lat != null))
          Padding(
            padding: const EdgeInsets.only(left: 8, bottom: 4),
            child: Text(
              'Las paradas alargan el trayecto y el precio ya las incluye.',
              style: TextStyle(fontSize: 11.5, color: context.textTertiaryColor),
            ),
          ),
      ],

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
          validator: (v) => (v == null || v.trim().isEmpty) ? 'Requerido' : null,
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
    ];
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

    // Ya no se pide la ruta a Google desde el teléfono: el servidor mide el
    // trayecto él mismo y descarta la distancia que mande la app, así que esa
    // llamada solo añadía una espera de red justo al tocar "Pedir".

    final String id;
    try {
      id = await ref.read(transportProvider.notifier).request(
            // La categoría elegida MANDA sobre la pestaña por la que se entró:
            // quien abrió "Transporte" y eligió Taxi pide un taxi, y así queda
            // registrado y tarifado.
            serviceType: _categoria?.serviceType ?? widget.serviceType,
            categoria: _categoria?.categoria,
            paymentMethod: ref.read(metodoPagoEfectivoProvider).valorApi,
            origin: _originCtrl.text.trim(),
            destination: _destCtrl.text.trim(),
            originLat: _originLat,
            originLng: _originLng,
            destLat: _destLat,
            destLng: _destLng,
            stops: _paradasParaPedir,
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

    // El método de pago YA está decidido: se eligió en la hoja, antes de
    // confirmar. Antes se preguntaba aquí, con el viaje ya creado y buscando
    // conductor; quien cerraba esa hoja se quedaba con un viaje en marcha y sin
    // método elegido, y no había forma de volver a preguntarle.
    //
    // Pago en línea: se cierra el ciclo dentro de la app (Wompi + sondeo de
    // estado). Efectivo: el pasajero paga al conductor al final del viaje.
    if (ref.read(metodoPagoEfectivoProvider) == MetodoPago.enLinea) {
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
                        _cuando(),
                        style: TextStyle(
                          fontSize: 12,
                          color: context.textSecondaryColor,
                        ),
                      ),
                      // Para qué sirve la categoría. El dato lo manda el
                      // servidor y no se estaba pintando: es lo que distingue
                      // un taxi de un particular para quien no lo tiene claro.
                      if (opcion.disponible && opcion.descripcion.isNotEmpty)
                        Text(
                          opcion.descripcion,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: context.textTertiaryColor,
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

  /// Primera línea bajo el nombre: a qué hora te recogen y en cuántos minutos.
  ///
  /// La hora es la de AHORA más el ETA, calculada en el momento de pintar. No
  /// es un dato inventado: es la misma cuenta que hace quien mira el reloj, y
  /// sirve para decidir mucho mejor que un "5 min" suelto.
  String _cuando() {
    if (!opcion.disponible) return 'Sin ${opcion.nombre.toLowerCase()} cerca ahora';
    final eta = opcion.etaMinutes;
    final cuantos = opcion.availableNearby;
    final cerca = cuantos == 1 ? '1 cerca' : '$cuantos cerca';
    if (eta == null) return cerca;
    final llegada = DateTime.now().add(Duration(minutes: eta));
    final hh = llegada.hour.toString().padLeft(2, '0');
    final mm = llegada.minute.toString().padLeft(2, '0');
    return '$hh:$mm · $eta min · $cerca';
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

/// El trayecto resumido sobre el mapa: recogida en pequeño, destino en grande.
class _PildoraTrayecto extends StatelessWidget {
  const _PildoraTrayecto({
    required this.origen,
    required this.destino,
    required this.onTap,
  });

  final String origen;
  final String destino;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.surfaceColor,
      borderRadius: BorderRadius.circular(24),
      elevation: 3,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.circle, size: 8, color: context.textTertiaryColor),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      origen.isEmpty ? 'Tu ubicación' : origen,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 1),
              Text(
                destino,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Método de pago, visible y editable ANTES de confirmar el viaje.
///
/// Sustituye a la hoja que salía después de crear el viaje. Además recuerda la
/// elección entre viajes: casi todo el mundo paga siempre igual, y volver a
/// preguntarlo cada vez era un paso de más en el peor momento.
class _FilaMetodoPago extends ConsumerWidget {
  const _FilaMetodoPago();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metodo = ref.watch(metodoPagoEfectivoProvider);
    // Siempre hay al menos dos opciones —efectivo y transferencia—, así que el
    // selector nunca se apaga. El pago EN LÍNEA es el único que depende de que
    // haya pasarela configurada: ofrecerlo sin llaves sería un botón que no
    // cobra.
    final pagoEnLinea =
        ref.watch(appConfigProvider).valueOrNull?.pagoEnLinea ?? false;

    return Material(
      color: context.surfaceVariantColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _elegir(context, ref, pagoEnLinea),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(
                switch (metodo) {
                  MetodoPago.efectivo => Icons.payments_outlined,
                  MetodoPago.transferencia => Icons.swap_horiz_rounded,
                  MetodoPago.enLinea => Icons.credit_card_rounded,
                },
                size: 22,
                color: context.textSecondaryColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      metodo.etiqueta,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimaryColor,
                      ),
                    ),
                    Text(
                      metodo.detalle,
                      style: TextStyle(
                        fontSize: 11.5,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                'Cambiar',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.textSecondaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _elegir(
    BuildContext context,
    WidgetRef ref,
    bool pagoEnLinea,
  ) async {
    final elegido = await showModalBottomSheet<MetodoPago>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 18),
            const Text(
              'Método de pago',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            for (final m in MetodoPago.values)
              if (m != MetodoPago.enLinea || pagoEnLinea)
              ListTile(
                leading: Icon(switch (m) {
                  MetodoPago.efectivo => Icons.payments_outlined,
                  MetodoPago.transferencia => Icons.swap_horiz_rounded,
                  MetodoPago.enLinea => Icons.credit_card_rounded,
                }),
                title: Text(m.etiqueta),
                subtitle: Text(m.detalle),
                onTap: () => Navigator.of(context).pop(m),
              ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    if (elegido != null) {
      await ref.read(metodoPagoProvider.notifier).elegir(elegido);
    }
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


/// Una parada mientras se edita: su texto y, si se eligió del autocompletado,
/// su punto. Sin punto no se puede medir, así que no encarece el viaje — pero
/// el conductor la lee igual.
class _ParadaEdit {
  final TextEditingController ctrl = TextEditingController();
  double? lat;
  double? lng;
}
