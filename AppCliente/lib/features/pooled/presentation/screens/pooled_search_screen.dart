import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/zipa_vehiculos.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart'
    show IntercityCity;
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/widgets/datos_pasajeros.dart';
import 'package:nexum_client/features/pooled/presentation/widgets/mapa_sillas.dart';
import 'package:nexum_client/features/pooled/presentation/widgets/datos_empresa.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';
import 'package:nexum_client/features/intercity/presentation/providers/municipalities_provider.dart';
import 'package:nexum_client/features/intercity/presentation/widgets/city_search_sheet.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class PooledSearchScreen extends ConsumerStatefulWidget {
  const PooledSearchScreen({super.key});

  @override
  ConsumerState<PooledSearchScreen> createState() => _PooledSearchScreenState();
}

class _PooledSearchScreenState extends ConsumerState<PooledSearchScreen> {
  // Nacen VACÍOS a propósito: así la pantalla abre mostrando TODAS las salidas
  // publicadas. Antes venían fijos en Pamplona → Cúcuta y se buscaba solo ese
  // par, de modo que una salida Cúcuta → Bogotá existía y el pasajero leía «no
  // hay viajes». La pantalla afirmaba algo falso sobre la oferta, que es peor
  // que no filtrar. El backend ya aceptaba los dos parámetros vacíos.
  IntercityCity? _origin;
  IntercityCity? _destination;
  DateTime? _date;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _runSearch());
  }

  void _runSearch() {
    ref.read(pooledProvider.notifier).search(
          origin: _origin,
          destination: _destination,
          date: _date,
        );
  }

  void _swap() {
    setState(() {
      final tmp = _origin;
      _origin = _destination;
      _destination = tmp;
    });
    _runSearch();
  }

  /// Vuelve a mostrarlo todo. Sin esto, quien filtra una vez ya no sabe cómo
  /// salir del filtro: los municipios se eligen pero no se des-eligen.
  void _limpiarFiltros() {
    setState(() {
      _origin = null;
      _destination = null;
      _date = null;
    });
    _runSearch();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 30)),
    );
    if (picked != null) {
      setState(() => _date = picked);
      _runSearch();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Municipios desde el backend (ver intercity_booking_screen).
    ref.watch(municipalitiesProvider);
    final state = ref.watch(pooledProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Viajes compartidos'),
        actions: [
          IconButton(
            tooltip: 'Mis reservas',
            icon: const Icon(Icons.confirmation_number_outlined),
            onPressed: () => context.push('/pooled/bookings'),
          ),
        ],
      ),
      body: Column(
        children: [
          _buildSearchForm(),
          Expanded(child: _buildResults(state)),
        ],
      ),
    );
  }

  Widget _buildSearchForm() {
    return Container(
      color: _kPooledColor,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Expanded(child: _cityDropdown(_origin, 'Desde cualquier parte', (c) {
                  setState(() => _origin = c);
                  _runSearch();
                })),
                IconButton(
                  icon: const Icon(Icons.swap_horiz_rounded, color: _kPooledColor),
                  onPressed: _swap,
                ),
                Expanded(child: _cityDropdown(_destination, 'A cualquier destino', (c) {
                  setState(() => _destination = c);
                  _runSearch();
                })),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.event_rounded, size: 18),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  label: Text(
                    _date == null
                        ? 'Cualquier fecha'
                        : '${_date!.day}/${_date!.month}/${_date!.year}',
                  ),
                ),
              ),
              if (_date != null) ...[
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.clear_rounded, color: Colors.white70),
                  onPressed: () {
                    setState(() => _date = null);
                    _runSearch();
                  },
                ),
              ],
            ],
          ),
          // La salida del filtro. Los municipios se eligen pero no se
          // des-eligen, así que sin esto quien filtra una vez se queda dentro.
          if (_hayFiltro) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _limpiarFiltros,
                icon: const Icon(Icons.close_rounded, size: 16, color: Colors.white70),
                label: const Text(
                  'Ver todas las salidas',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  bool get _hayFiltro => _origin != null || _destination != null || _date != null;

  /// Abre el buscador de municipios (antes era un desplegable: con cuarenta y
  /// cinco municipios había que recorrerlo a dedo).
  Widget _cityDropdown(
    IntercityCity? value,
    String vacio,
    ValueChanged<IntercityCity> onChanged,
  ) {
    return InkWell(
      onTap: () async {
        final elegido = await showCitySearchSheet(
          context,
          titulo: 'Buscar municipio',
          seleccionado: value,
        );
        if (elegido != null) onChanged(elegido);
      },
      child: Row(
        children: [
          Expanded(
            child: Text(
              value?.displayName ?? vacio,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                // Sin elegir se ve como marcador, no como una ciudad puesta:
                // el mismo peso haría creer que ya hay un filtro aplicado.
                color: value == null
                    ? context.textSecondaryColor
                    : context.textPrimaryColor,
                fontWeight: value == null ? FontWeight.w400 : FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
          const Icon(Icons.search_rounded, size: 18, color: _kPooledColor),
        ],
      ),
    );
  }

  Widget _buildResults(PooledState state) {
    if (state.isSearching) {
      return const Center(child: CircularProgressIndicator(color: _kPooledColor));
    }
    if (state.searchResults.isEmpty) {
      return _emptyState(state.error);
    }
    return RefreshIndicator(
      color: _kPooledColor,
      onRefresh: () async => _runSearch(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: state.searchResults.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _TripCard(
          trip: state.searchResults[i],
          onTap: () => _openBookSheet(state.searchResults[i]),
        ),
      ),
    );
  }

  Widget _emptyState(String? error) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Icon(
          error != null ? Icons.cloud_off_rounded : Icons.search_off_rounded,
          size: 64,
          color: context.textSecondaryColor,
        ),
        const SizedBox(height: 16),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              // Sin filtro, «prueba otra ciudad» sería un consejo absurdo:
              // ya se está mirando todo lo que hay.
              error ??
                  (_hayFiltro
                      ? 'No hay salidas publicadas para esta búsqueda.\n'
                          'Prueba otra fecha o quita el filtro.'
                      : 'Todavía no hay salidas publicadas.\n'
                          'Las empresas las publican con antelación; vuelve más tarde.'),
              textAlign: TextAlign.center,
              style: TextStyle(color: context.textSecondaryColor, height: 1.4),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openBookSheet(PooledTripEntity trip) async {
    // `null` = cerró sin comprar. Una lista (aunque vacía) = compró; vacía
    // significa salida por cupos, donde no hay silla que nombrar.
    final compradas = await showModalBottomSheet<List<int>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BookSeatsSheet(trip: trip),
    );
    if (compradas != null && mounted) {
      _runSearch();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            compradas.isEmpty
                ? '¡Reserva confirmada! La verás en "Mis reservas".'
                : '¡Listo! ${compradas.length == 1 ? "Silla" : "Sillas"} '
                    '${compradas.join(', ')}. Las verás en "Mis reservas".',
          ),
          backgroundColor: AppColors.success,
        ),
      );
    }
  }
}

// ── Trip card ──────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip, required this.onTap});
  final PooledTripEntity trip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = trip.departureTime;
    final timeLabel =
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final dateLabel = '${t.day}/${t.month}';

    return Material(
      color: context.cardColor2,
      borderRadius: BorderRadius.circular(16),
      elevation: 1,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.schedule_rounded, size: 16, color: _kPooledColor),
                  const SizedBox(width: 6),
                  Text('$timeLabel · $dateLabel',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: context.textPrimaryColor)),
                  const Spacer(),
                  Text(
                    CurrencyFormatter.format(trip.farePerSeat),
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: _kPooledColor,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('${trip.origin.displayName} → ${trip.destination.displayName}',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimaryColor)),
              const SizedBox(height: 2),
              Row(
                children: [
                  Text('por puesto · ${trip.durationLabel}',
                      style: TextStyle(
                          fontSize: 12, color: context.textSecondaryColor)),
                  // Con qué vehículo va la salida, antes de abrirla. Es lo que
                  // decide entre dos salidas a la misma hora: nadie elige
                  // «buseta» leyendo la palabra, la reconoce por la forma.
                  if (vehiculoDeTipo(trip.seatMap?.tipo) != null) ...[
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 28,
                      height: 16,
                      child: CustomPaint(
                        painter: ZipaVehiculoPainter(
                          vehiculo: vehiculoDeTipo(trip.seatMap!.tipo)!,
                          cuerpo: _kPooledColor,
                          hueco: context.cardColor2,
                          rueda: _kPooledColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(trip.seatMap!.etiqueta,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: context.textSecondaryColor)),
                  ],
                ],
              ),
              const Divider(height: 20),
              // Salida oficial de empresa: sello de confianza (vs particular).
              if (trip.operatorName != null) ...[
                Row(
                  children: [
                    const Icon(Icons.verified_rounded,
                        size: 16, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Empresa: ${trip.operatorName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                    NotaEmpresa(
                      rating: trip.operatorRating,
                      votos: trip.operatorRatingCount,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              // El puerta a puerta es POR LO QUE se elige una van frente a un
              // bus, así que va en la tarjeta y no escondido en la hoja de
              // reserva. Solo cuando la salida lo hace: anunciarlo siempre lo
              // volvería ruido y a veces mentira.
              if (trip.doorToDoor) ...[
                Row(
                  children: [
                    const Icon(Icons.home_rounded,
                        size: 15, color: AppColors.liveGreen),
                    const SizedBox(width: 6),
                    Text(
                      'Te recogen en tu dirección',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              // Qué trae el vehículo. Solo lo declarado: sin comodidades no se
              // pinta nada, en vez de una fila de cruces que afirmaría que no
              // las tiene.
              if (trip.amenities.isNotEmpty) ...[
                ChipsComodidades(claves: trip.amenities),
                const SizedBox(height: 6),
              ],
              // Lugares por donde pasa la salida (paradas publicadas).
              if (trip.stops.isNotEmpty) ...[
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.alt_route_rounded,
                        size: 16, color: context.textSecondaryColor),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Pasa por: ${trip.stops.join(' · ')}',
                        style: TextStyle(
                          fontSize: 12,
                          color: context.textSecondaryColor,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              Row(
                children: [
                  Icon(Icons.person_rounded, size: 16, color: context.textSecondaryColor),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '${trip.driverName} · ${trip.vehicleDescription}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12.5, color: context.textSecondaryColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _SeatBadge(available: trip.availableSeats, total: trip.totalSeats),
                  const Spacer(),
                  const Text('Reservar',
                      style: TextStyle(
                          color: _kPooledColor, fontWeight: FontWeight.w700)),
                  const Icon(Icons.chevron_right_rounded, color: _kPooledColor),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SeatBadge extends StatelessWidget {
  const _SeatBadge({required this.available, required this.total});
  final int available;
  final int total;

  @override
  Widget build(BuildContext context) {
    final color = available == 0
        ? AppColors.error
        : available <= 1
            ? AppColors.warning
            : AppColors.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.event_seat_rounded, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            available == 0 ? 'Completo' : '$available de $total libres',
            style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

// ── Booking sheet ────────────────────────────────────────────────────────────

class _BookSeatsSheet extends ConsumerStatefulWidget {
  const _BookSeatsSheet({required this.trip});
  final PooledTripEntity trip;

  @override
  ConsumerState<_BookSeatsSheet> createState() => _BookSeatsSheetState();
}

/// Valor del radio «En mi dirección», y lo que se le manda al servidor.
///
/// Es un marcador EXPLÍCITO y no «sin punto»: sin punto es lo que manda una app
/// vieja que no conoce los puntos, y a esa hay que sellarle la terminal. Si
/// fueran lo mismo, quien pidiera que lo recogieran en su casa acabaría con
/// «Sube en: Terminal · 06:00» en su reserva. El valor lo define
/// `backend/src/lib/recogida-salida.ts`.
const _kEnMiDireccion = 'domicilio';

class _BookSeatsSheetState extends ConsumerState<_BookSeatsSheet> {
  int _seats = 1;
  final _pickupCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;

  /// Sillas elegidas en el mapa. Vacío en las salidas sin numerar, donde lo
  /// único que se decide es CUÁNTOS puestos.
  final Set<int> _sillas = <int>{};

  /// La salida releída tras un choque de sillas. Mientras es null se usa la
  /// que llegó de la búsqueda; el `widget.trip` es una foto del momento en que
  /// se abrió la hoja y no puede quedarse como única verdad.
  PooledTripEntity? _fresco;

  PooledTripEntity get _trip => _fresco ?? widget.trip;

  /// Dónde sube. Arranca en el primero —la terminal— porque es donde sube casi
  /// todo el mundo y deja la compra a un toque.
  String? _puntoId;

  final _cuponCtrl = TextEditingController();
  double? _descuento;
  String? _cuponAplicado;
  String? _cuponError;
  bool _cotizando = false;

  /// Quién viaja en cada silla. Lo emite `DatosPasajeros` en cada tecla.
  List<PasajeroTiquete> _pasajeros = const [];

  /// Si la planilla está completa.
  ///
  /// Se exige en la app aunque el servidor todavía sea tolerante con las
  /// versiones viejas: mandar media planilla la haría rechazar entera, y el
  /// pasajero recibiría un «falta el pasajero 2» después de tocar Reservar en
  /// vez de verlo mientras escribe.
  bool get _pasajerosListos {
    final puestos = _trip.seatMap != null ? _sillas.length : _seats;
    if (puestos < 1) return false;
    return _pasajeros.length == puestos && _pasajeros.every((p) => p.completo);
  }

  /// Lo que se paga, con el descuento ya restado. Una sola cuenta para el
  /// botón y para el total: si cada uno hiciera la suya, el pasajero vería un
  /// precio y pagaría otro.
  double get _totalAPagar {
    final t = _trip;
    final puestos = t.seatMap != null ? _sillas.length : _seats;
    return (t.farePerSeat * puestos) - (_descuento ?? 0);
  }

  /// Vuelve a cotizar cuando cambian los puestos: un cupón del 20 % sobre un
  /// puesto no descuenta lo mismo que sobre tres, y dejar el número viejo
  /// enseñaría un total que el servidor no va a aceptar.
  Future<void> _cotizar() async {
    final codigo = _cuponCtrl.text.trim();
    if (codigo.isEmpty) return;
    setState(() { _cotizando = true; _cuponError = null; });
    final puestos = _trip.seatMap != null ? _sillas.length : _seats;
    final r = await ref
        .read(pooledProvider.notifier)
        .cotizarCupon(_trip.id, codigo, puestos < 1 ? 1 : puestos);
    if (!mounted) return;
    setState(() {
      _cotizando = false;
      _descuento = r.descuento;
      _cuponAplicado = r.error == null ? codigo.toUpperCase() : null;
      _cuponError = r.error;
    });
  }

  int get _maxSelectable {
    final t = _trip;
    // Booking the whole vehicle is only allowed if the driver enabled fleet.
    if (t.allowFleet) return t.availableSeats;
    return t.availableSeats == t.totalSeats
        ? t.totalSeats - 1 == 0
            ? 1
            : t.totalSeats - 1
        : t.availableSeats;
  }

  @override
  void dispose() {
    _pickupCtrl.dispose();
    _notesCtrl.dispose();
    _cuponCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    setState(() => _submitting = true);
    final mapa = _trip.seatMap;
    final err = await ref.read(pooledProvider.notifier).bookSeats(
          tripId: _trip.id,
          // Con mapa, los puestos son las sillas elegidas: mandar otro número
          // sería pagar uno y ocupar tres.
          seats: mapa != null ? _sillas.length : _seats,
          // Los paréntesis son obligatorios: el cascada `..sort()` tiene menos
          // precedencia que el ternario y sin ellos no compila.
          sillas: mapa != null ? (_sillas.toList()..sort()) : null,
          pickupAddress: _pickupCtrl.text.trim(),
          notes: _notesCtrl.text.trim(),
          // El marcador viaja tal cual: el servidor distingue «pidió
          // domicilio» de «no eligió nada».
          boardingPointId: _puntoId,
          promoCode: _cuponAplicado,
          pasajeros: _pasajeros,
        );
    if (!mounted) return;
    if (err == null) {
      HapticFeedback.mediumImpact();
      // Devuelve las sillas compradas (vacío = salida por cupos) para que la
      // pantalla pueda decir CUÁL se llevó: es lo que va a buscar al subir.
      final compradas = _sillas.toList()..sort();
      Navigator.of(context).pop(compradas);
      return;
    }

    // Rechazo: en una salida numerada el motivo casi siempre es que alguien se
    // adelantó, así que se relee el plano y se sueltan las sillas que ya no
    // están. Sin esto el mensaje pide actualizar algo que no se puede.
    if (mapa != null) {
      final fresco = await ref.read(pooledProvider.notifier).fetchTrip(_trip.id);
      if (!mounted) return;
      if (fresco != null) {
        // Las ocupadas se leen del propio plano en vez de guardarse aparte:
        // un segundo listado acabaría discrepando del dibujo.
        final ocupadas = <int>{
          for (final fila in fresco.seatMap?.filas ?? const <List<CeldaAsiento>>[])
            for (final c in fila)
              if (c.ocupada && c.numero != null) c.numero!,
        };
        setState(() {
          _fresco = fresco;
          _sillas.removeWhere(ocupadas.contains);
        });
      }
    }

    setState(() => _submitting = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(err), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final trip = _trip;
    // Una sola cuenta, la del getter: el botón, el total y lo que cobra el
    // conductor tienen que decir lo mismo.
    final total = _totalAPagar;
    final bruto = trip.farePerSeat * (trip.seatMap != null ? _sillas.length : _seats);
    final maxSel = _maxSelectable;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.outlineColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('${trip.origin.displayName} → ${trip.destination.displayName}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('${trip.driverName} · ${trip.vehicleDescription}',
                style: TextStyle(color: context.textSecondaryColor, fontSize: 13)),
            const SizedBox(height: 20),

            if (trip.seatMap != null) ...[
              const Text('Elige tu silla',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              MapaSillas(
                mapa: trip.seatMap!,
                seleccionadas: _sillas,
                maximo: maxSel,
                onToque: (n) => setState(() {
                  if (!_sillas.remove(n)) _sillas.add(n);
                }),
              ),
            ] else ...[
              const Text('¿Cuántos puestos?',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Row(
                children: [
                  _stepBtn(Icons.remove_rounded, _seats > 1, () {
                    setState(() => _seats--);
                  }),
                  Expanded(
                    child: Center(
                      child: Text('$_seats',
                          style: const TextStyle(
                              fontSize: 28, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  _stepBtn(Icons.add_rounded, _seats < maxSel, () {
                    setState(() => _seats++);
                  }),
                ],
              ),
            ],
            if (trip.allowFleet && trip.seatMap == null && _seats == trip.totalSeats)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Reservando el vehículo completo (flete)',
                    style: TextStyle(color: _kPooledColor, fontSize: 12)),
              ),
            const SizedBox(height: 16),

            // ── Dónde sube ────────────────────────────────────────────────
            // Las dos formas CONVIVEN. Una van intermunicipal recoge puerta a
            // puerta y además tiene parada en la terminal; enseñar solo los
            // puntos le quitaría media operación, que es justo lo que pasó al
            // publicar esta pantalla por primera vez.
            if (trip.boardingPoints.isNotEmpty) ...[
              const Text('¿Dónde te subes?',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              for (final p in trip.boardingPoints)
                RadioListTile<String>(
                  value: p.id,
                  groupValue: _puntoId ?? trip.boardingPoints.first.id,
                  onChanged: (v) => setState(() => _puntoId = v),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  activeColor: _kPooledColor,
                  title: Text(p.name,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    p.address == null ? 'Pasa a las ${p.time}' : '${p.address} · ${p.time}',
                    style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
                  ),
                ),
              if (trip.doorToDoor)
                RadioListTile<String>(
                  value: _kEnMiDireccion,
                  groupValue: _puntoId ?? trip.boardingPoints.first.id,
                  onChanged: (v) => setState(() => _puntoId = v),
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  activeColor: _kPooledColor,
                  title: const Text('En mi dirección',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    'Pasan por ti',
                    style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
                  ),
                ),
              // El campo solo cuando eligió domicilio: pedir la dirección a
              // quien va a subir en la terminal es pedir un dato que nadie va
              // a usar.
              if (trip.doorToDoor && _puntoId == _kEnMiDireccion) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _pickupCtrl,
                  decoration: const InputDecoration(
                    labelText: '¿Dónde te recogemos?',
                    prefixIcon: Icon(Icons.my_location_rounded),
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
              const SizedBox(height: 12),
            ] else if (trip.doorToDoor)
              TextField(
                controller: _pickupCtrl,
                decoration: const InputDecoration(
                  labelText: 'Dónde te recogen (opcional)',
                  prefixIcon: Icon(Icons.my_location_rounded),
                  border: OutlineInputBorder(),
                ),
              )
            else
              // Ni puntos ni domicilio: se dice dónde subir en vez de dejar un
              // formulario vacío que no responde nada.
              Row(
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: 16, color: context.textSecondaryColor),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Subes donde arranca la salida, en ${trip.origin.displayName}.',
                      style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              decoration: const InputDecoration(
                labelText: 'Notas para el conductor (opcional)',
                prefixIcon: Icon(Icons.notes_rounded),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),

            // Código de la empresa. Solo se ofrece en salidas de empresa: en la
            // de un conductor particular no hay quien emita uno, y un campo
            // que siempre falla es peor que no tenerlo.
            if (trip.operatorName != null) ...[
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _cuponCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: 'Código de descuento (opcional)',
                        prefixIcon: const Icon(Icons.local_offer_outlined),
                        border: const OutlineInputBorder(),
                        errorText: _cuponError,
                        helperText: _cuponAplicado != null
                            ? 'Aplicado: −${CurrencyFormatter.format(_descuento ?? 0)}'
                            : null,
                      ),
                      onSubmitted: (_) => _cotizar(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: _cotizando ? null : () => _cotizar(),
                    child: Text(_cotizando ? '…' : 'Aplicar'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            // Lo que se termina de mirar antes de pagar: qué trae el bus y qué
            // pasa con la maleta. En la tarjeta del buscador van comprimidas;
            // aquí hay sitio para leerlas.
            if (trip.amenities.isNotEmpty) ...[
              ChipsComodidades(claves: trip.amenities, compacto: false),
              const SizedBox(height: 16),
            ],
            // Quién viaja. Va ANTES del total, como en cualquier taquilla:
            // primero se dice a nombre de quién y después se paga.
            DatosPasajeros(
              puestos: trip.seatMap != null ? _sillas.length : _seats,
              onChanged: (p) => setState(() => _pasajeros = p),
            ),
            const SizedBox(height: 8),

            if (trip.operatorName != null) ...[
              CondicionesTiquete(lineas: trip.operatorPolicies),
              const SizedBox(height: 16),
            ],

            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _kPooledColor.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Text('Total a pagar',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const Spacer(),
                  // Con descuento se enseña el antes tachado: sin él, el
                  // pasajero no ve que el código hizo algo.
                  if ((_descuento ?? 0) > 0) ...[
                    Text(
                      CurrencyFormatter.format(bruto),
                      style: TextStyle(
                        fontSize: 13,
                        color: context.textSecondaryColor,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Text(CurrencyFormatter.format(total),
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: _kPooledColor)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Cómo se paga, DECLARADO por la empresa y redactado en el
            // servidor. Antes había aquí un texto fijo que decía «acuerda el
            // medio con el conductor» para todas: a la empresa que cobra por
            // transferencia le mandaba la gente sin efectivo a la puerta.
            FormaDePago(lineas: trip.operatorPayment),
            const SizedBox(height: 16),

            // Por qué el botón está apagado. Sin esto se queda gris y nadie
            // sabe qué falta — el defecto que este repo ya corrigió en media
            // docena de pantallas.
            if (!_pasajerosListos && !(trip.seatMap != null && _sillas.isEmpty)) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded,
                      size: 15, color: context.textSecondaryColor),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Completa el documento y el nombre de cada pasajero para reservar.',
                      style: TextStyle(
                        fontSize: 12,
                        color: context.textSecondaryColor,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _submitting ||
                        (trip.seatMap != null && _sillas.isEmpty) ||
                        !_pasajerosListos
                    ? null
                    : _confirm,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPooledColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('Confirmar reserva',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _stepBtn(IconData icon, bool enabled, VoidCallback onTap) {
    return Material(
      color: enabled ? _kPooledColor.withValues(alpha: 0.1) : context.surfaceVariantColor,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Icon(icon,
              color: enabled ? _kPooledColor : context.textSecondaryColor),
        ),
      ),
    );
  }
}
