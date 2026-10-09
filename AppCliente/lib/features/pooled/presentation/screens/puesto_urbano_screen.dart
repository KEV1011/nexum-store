/// Los taxis que van por tu ruta y venden el puesto.
///
/// Es lo que ya pasa en la calle: el taxi sale del terminal recogiendo persona
/// por persona en vez de quedarse quieto. La diferencia es que aquí el puesto
/// se reserva antes y el precio está dicho, así que no se negocia por la
/// ventanilla.
///
/// Va APARTE del intermunicipal a propósito. Aquélla es una pantalla de
/// comparar viajes entre ciudades —con fecha, empresa y condiciones del
/// tiquete—; esto es «me quiero mover ahora», y meterlo ahí lo habría
/// escondido bajo dos selectores de municipio.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/ubicacion/ubicacion_gate.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';
import 'package:nexum_client/shared/widgets/address_autocomplete_field.dart';

const _kUrbano = AppColors.serviceTaxi;

class PuestoUrbanoScreen extends ConsumerStatefulWidget {
  const PuestoUrbanoScreen({super.key});

  @override
  ConsumerState<PuestoUrbanoScreen> createState() => _PuestoUrbanoScreenState();
}

class _PuestoUrbanoScreenState extends ConsumerState<PuestoUrbanoScreen> {
  /// Se supo dónde está. Distinto de «no hay puestos»: sin ubicación no se
  /// puede ni buscar, y decir «no hay ninguno» sería afirmar algo que nadie
  /// comprobó.
  bool _sinUbicacion = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  Future<void> _cargar() async {
    double? lat;
    double? lng;
    try {
      // Aquí SÍ se puede pedir el permiso: la persona entró a una pantalla que
      // solo tiene sentido con su ubicación, así que la divulgación no
      // interrumpe nada.
      if (await Ubicacion.concedido() ||
          (mounted && await Ubicacion.pedir(context))) {
        final pos = await Geolocator.getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      }
    } catch (_) {
      // Sin GPS: se dice abajo.
    }
    if (!mounted) return;
    setState(() => _sinUbicacion = lat == null);
    if (lat == null || lng == null) return;
    await ref.read(pooledProvider.notifier).buscarPuestosUrbanos(lat: lat, lng: lng);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kUrbano,
        foregroundColor: Colors.white,
        leading: IconButton(
          tooltip: 'Volver',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, fallback: '/home'),
        ),
        title: const Text('Viaje por puestos'),
      ),
      // Publicar es la mitad que faltaba: no siempre el que arma el viaje es
      // el taxista. Va en un botón fijo y no al final de la lista porque
      // justo cuando NO hay ninguno publicado —que es cuando más falta
      // hace— la lista es un estado vacío y el botón quedaría escondido.
      floatingActionButton: _sinUbicacion || state.slugUrbano == null
          ? null
          : FloatingActionButton.extended(
              backgroundColor: _kUrbano,
              foregroundColor: Colors.white,
              onPressed: _publicar,
              icon: const Icon(Icons.add_road_rounded),
              label: const Text('Publicar mi viaje'),
            ),
      body: RefreshIndicator(
        color: _kUrbano,
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            const _Explicacion(),
            const SizedBox(height: 16),
            if (state.ciudadUrbano != null && !_sinUbicacion)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    const Icon(Icons.place_rounded, size: 16, color: _kUrbano),
                    const SizedBox(width: 6),
                    Text(
                      'Saliendo pronto en ${state.ciudadUrbano}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: context.textSecondaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ..._cuerpo(state),
          ],
        ),
      ),
    );
  }

  List<Widget> _cuerpo(PooledState state) {
    if (_sinUbicacion) {
      return [
        _Aviso(
          icono: Icons.location_off_rounded,
          titulo: 'Necesitamos saber dónde estás',
          cuerpo: 'Los viajes por puestos son de tu ciudad. Activa la '
              'ubicación para ver los que salen cerca.',
          accion: 'Reintentar',
          onAccion: _cargar,
        ),
      ];
    }
    if (state.isSearchingUrbano) {
      return const [
        Padding(
          padding: EdgeInsets.only(top: 48),
          child: Center(child: CircularProgressIndicator(color: _kUrbano)),
        ),
      ];
    }
    if (state.urbanoError != null) {
      return [
        _Aviso(
          icono: Icons.wifi_off_rounded,
          titulo: 'No pudimos cargar los viajes',
          cuerpo: state.urbanoError!,
          accion: 'Reintentar',
          onAccion: _cargar,
        ),
      ];
    }
    if (state.ciudadUrbano == null && state.buscoUrbano) {
      return [
        const _Aviso(
          icono: Icons.explore_off_rounded,
          titulo: 'Todavía no estamos en tu ciudad',
          cuerpo: 'Los viajes por puestos funcionan en las ciudades donde ZIPA '
              'ya opera.',
        ),
      ];
    }
    if (state.puestosUrbanos.isEmpty) {
      return [
        _Aviso(
          icono: Icons.schedule_rounded,
          titulo: 'Ningún taxi tiene puestos ahora',
          // Antes esto terminaba en «vuelve más tarde», que es pedirle a la
          // persona que resuelva sola un problema que la app puede resolver:
          // puede armar ella el viaje y esperar a que alguien lo tome.
          cuerpo: 'Puedes publicar el tuyo: dices a dónde vas y a qué hora, '
              'otros pasajeros se suman y un taxista lo toma.',
          accion: 'Publicar mi viaje',
          onAccion: _publicar,
        ),
      ];
    }
    return [
      for (final t in state.puestosUrbanos)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _TarjetaPuesto(trip: t, onReservar: () => _reservar(t)),
        ),
    ];
  }

  Future<void> _publicar() async {
    final ciudad = ref.read(pooledProvider).slugUrbano;
    if (ciudad == null) return;
    final publicado = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _HojaPublicar(ciudad: ciudad),
    );
    if (publicado == true) {
      HapticFeedback.mediumImpact();
      await _cargar();
    }
  }

  Future<void> _reservar(PooledTripEntity trip) async {
    final confirmado = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _HojaReserva(trip: trip),
    );
    if (confirmado == true) {
      HapticFeedback.mediumImpact();
      await _cargar();
    }
  }
}

class _Explicacion extends StatelessWidget {
  const _Explicacion();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.serviceTaxiContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.groups_rounded, color: _kUrbano),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Comparte el taxi con otras personas que van por tu misma ruta '
                'y paga solo tu puesto.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  // Sobre el contenedor ámbar claro, que no cambia con el tema.
                  color: Color(0xFF5B3D00),
                ),
              ),
            ),
          ],
        ),
      );
}

class _TarjetaPuesto extends StatelessWidget {
  const _TarjetaPuesto({required this.trip, required this.onReservar});

  final PooledTripEntity trip;
  final VoidCallback onReservar;

  @override
  Widget build(BuildContext context) {
    final faltan = trip.departureTime.difference(DateTime.now());
    final cuando = faltan.inMinutes <= 0
        ? 'Sale ya'
        : faltan.inMinutes < 60
            ? 'Sale en ${faltan.inMinutes} min'
            : 'Sale a las ${trip.departureTime.hour.toString().padLeft(2, '0')}:'
                '${trip.departureTime.minute.toString().padLeft(2, '0')}';

    return Material(
      color: context.surfaceColor,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onReservar,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      trip.tituloRuta,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimaryColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    CurrencyFormatter.format(trip.farePerSeat),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: _kUrbano,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.schedule_rounded,
                      size: 14, color: context.textSecondaryColor),
                  const SizedBox(width: 4),
                  Text(cuando,
                      style: TextStyle(
                          fontSize: 13, color: context.textSecondaryColor)),
                  const SizedBox(width: 12),
                  Icon(Icons.event_seat_rounded,
                      size: 14, color: context.textSecondaryColor),
                  const SizedBox(width: 4),
                  Text(
                    '${trip.availableSeats} '
                    '${trip.availableSeats == 1 ? 'puesto libre' : 'puestos libres'}',
                    style: TextStyle(
                        fontSize: 13, color: context.textSecondaryColor),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                trip.sinConductor
                    ? trip.conductorLabel
                    : '${trip.driverName} · ${trip.vehicleDescription}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
              ),
              // Solo si el servidor mandó el ahorro: sin dato no se promete
              // ninguno.
              if ((trip.savingsPerSeat ?? 0) > 0) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Ahorras ${CurrencyFormatter.format(trip.savingsPerSeat!)} '
                    'frente a ir solo',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.success,
                    ),
                  ),
                ),
              ],
              if (trip.notes != null && trip.notes!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  trip.notes!,
                  style: TextStyle(
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Reservar: cuántos puestos y dónde recoger. Nada más.
///
/// No se piden documentos ni se enseñan condiciones de empresa como en el
/// intermunicipal: esto es un taxi de la ciudad por dos mil pesos, y un
/// formulario de tiquete sería más largo que el viaje.
class _HojaReserva extends ConsumerStatefulWidget {
  const _HojaReserva({required this.trip});
  final PooledTripEntity trip;

  @override
  ConsumerState<_HojaReserva> createState() => _HojaReservaState();
}

class _HojaReservaState extends ConsumerState<_HojaReserva> {
  int _puestos = 1;
  bool _enviando = false;
  final _dondeCtrl = TextEditingController();

  @override
  void dispose() {
    _dondeCtrl.dispose();
    super.dispose();
  }

  Future<void> _confirmar() async {
    setState(() => _enviando = true);
    final error = await ref.read(pooledProvider.notifier).bookSeats(
          tripId: widget.trip.id,
          seats: _puestos,
          pickupAddress: _dondeCtrl.text.trim(),
        );
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
      return;
    }
    setState(() => _enviando = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.trip;
    final total = t.farePerSeat * _puestos;

    return Padding(
      // El teclado no puede tapar el campo: es el fallo que ya se corrigió en
      // pedidos y en la hoja de pedir viaje.
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
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
            Text(
              t.tituloRuta,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 16),

            Text('¿Cuántos puestos?',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.textSecondaryColor)),
            const SizedBox(height: 8),
            Row(
              children: [
                IconButton.filled(
                  tooltip: 'Quitar un puesto',
                  onPressed: _puestos > 1 ? () => setState(() => _puestos--) : null,
                  icon: const Icon(Icons.remove_rounded),
                  style: IconButton.styleFrom(
                      backgroundColor: _kUrbano, foregroundColor: Colors.white),
                ),
                Expanded(
                  child: Center(
                    child: Text('$_puestos',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimaryColor)),
                  ),
                ),
                IconButton.filled(
                  tooltip: 'Agregar un puesto',
                  onPressed: _puestos < t.availableSeats
                      ? () => setState(() => _puestos++)
                      : null,
                  icon: const Icon(Icons.add_rounded),
                  style: IconButton.styleFrom(
                      backgroundColor: _kUrbano, foregroundColor: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Con Google y con mapa, igual que al publicar. Es el campo que ve
            // quien se SUMA a un viaje, y era texto libre: el taxista recibía
            // «frente a la panadería» sin más. La reserva guarda solo el
            // texto, así que lo que aporta el buscador es que la dirección
            // esté bien escrita — y el mapa, que exista aunque no se sepa
            // escribir.
            AddressAutocompleteField(
              controller: _dondeCtrl,
              label: '¿Dónde te recogemos? (opcional)',
              hint: 'Ej: Calle 6 # 4-20, frente a la panadería',
              requiredField: false,
            ),
            const SizedBox(height: 16),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total a pagar',
                    style: TextStyle(
                        fontSize: 14, color: context.textSecondaryColor)),
                Text(
                  CurrencyFormatter.format(total),
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w900, color: _kUrbano),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Le pagas al conductor cuando te subas.',
              style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _kUrbano),
                onPressed: _enviando ? null : _confirmar,
                child: Text(_enviando ? 'Reservando…' : 'Reservar mi puesto'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({
    required this.icono,
    required this.titulo,
    required this.cuerpo,
    this.accion,
    this.onAccion,
  });

  final IconData icono;
  final String titulo;
  final String cuerpo;
  final String? accion;
  final VoidCallback? onAccion;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 40),
        child: Column(
          children: [
            Icon(icono, size: 48, color: context.textTertiaryColor),
            const SizedBox(height: 12),
            Text(
              titulo,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              cuerpo,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
            ),
            if (accion != null && onAccion != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onAccion, child: Text(accion!)),
            ],
          ],
        ),
      );
}

/// El pasajero arma su propio viaje por puestos.
///
/// La pieza que faltaba: hasta ahora solo publicaban el taxista y la empresa,
/// y en la calle pasa igual de seguido al revés — alguien tiene que ir a un
/// sitio y busca con quién compartir el carro.
///
/// El precio NO se escribe a ciegas: en cuanto hay origen y destino se le
/// pregunta al servidor cuánto cuesta la carrera sola y cuál es el máximo por
/// puesto, y se enseñan los dos. Escribir una cifra y que te la rechacen
/// después es la forma más rápida de que alguien abandone un formulario.
class _HojaPublicar extends ConsumerStatefulWidget {
  const _HojaPublicar({required this.ciudad});

  /// Slug del municipio donde está el pasajero, resuelto por el servidor.
  final String ciudad;

  @override
  ConsumerState<_HojaPublicar> createState() => _HojaPublicarState();
}

class _HojaPublicarState extends ConsumerState<_HojaPublicar> {
  final _origenCtrl = TextEditingController();
  final _destinoCtrl = TextEditingController();
  final _notasCtrl = TextEditingController();

  int _puestos = 4;
  int _mios = 1;

  /// `null` = «lo antes posible».
  ///
  /// Es el estado por defecto a propósito: la mayoría de quien publica un
  /// puesto urbano quiere moverse AHORA. Antes había que elegir una hora en el
  /// reloj, y poner la más cercana dejaba el viaje inservible.
  DateTime? _salida;

  /// Coordenadas de los dos extremos, cuando se eligieron de Google o del mapa.
  /// Sin ellas el servidor geocodifica la frase, y si falla el taxista no ve
  /// en el mapa dónde recoger.
  double? _origenLat, _origenLng, _destinoLat, _destinoLng;

  bool _enviando = false;
  bool _consultandoPrecio = false;
  ({double carreraSola, double tope, double precio})? _precio;

  DateTime get _salidaEfectiva => _salida ?? DateTime.now();

  @override
  void dispose() {
    _origenCtrl.dispose();
    _destinoCtrl.dispose();
    _notasCtrl.dispose();
    super.dispose();
  }

  /// Se pregunta cuando ya hay los dos extremos y al cambiar los puestos: el
  /// precio del puesto es la carrera repartida entre las sillas.
  Future<void> _consultarPrecio() async {
    final o = _origenCtrl.text.trim();
    final d = _destinoCtrl.text.trim();
    if (o.isEmpty || d.isEmpty) return;
    setState(() => _consultandoPrecio = true);
    final t = await ref.read(pooledProvider.notifier).precioDePuesto(
          ciudad: widget.ciudad, origen: o, destino: d, puestos: _puestos,
        );
    if (!mounted) return;
    setState(() {
      _precio = t;
      _consultandoPrecio = false;
    });
  }

  Future<void> _elegirHora() async {
    final ahora = DateTime.now();
    final fecha = await showDatePicker(
      context: context,
      initialDate: _salidaEfectiva,
      firstDate: ahora,
      lastDate: ahora.add(const Duration(days: 7)),
    );
    if (fecha == null || !mounted) return;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_salidaEfectiva),
    );
    if (hora == null || !mounted) return;
    setState(() {
      _salida = DateTime(fecha.year, fecha.month, fecha.day, hora.hour, hora.minute);
    });
  }

  String? _loQueFalta() {
    if (_origenCtrl.text.trim().isEmpty) return 'Escribe de dónde sales';
    if (_destinoCtrl.text.trim().isEmpty) return 'Escribe a dónde vas';
    // El precio ya no se pide: lo pone la plataforma.
    if (_salida != null && !_salida!.isAfter(DateTime.now())) {
      return 'Esa hora ya pasó. Usa «lo antes posible» o elige otra.';
    }
    return null;
  }

  Future<void> _publicar() async {
    final falta = _loQueFalta();
    if (falta != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(falta), backgroundColor: AppColors.error),
      );
      return;
    }
    setState(() => _enviando = true);
    final error = await ref.read(pooledProvider.notifier).publicarMiViaje(
          ciudad: widget.ciudad,
          origen: _origenCtrl.text.trim(),
          destino: _destinoCtrl.text.trim(),
          // «Lo antes posible» manda la hora de AHORA: el servidor acepta un
          // pasado corto, porque entre el teléfono y él pasan décimas.
          salida: _salidaEfectiva,
          puestos: _puestos,
          puestosParaMi: _mios,
          notas: _notasCtrl.text,
          origenLat: _origenLat,
          origenLng: _origenLng,
          destinoLat: _destinoLat,
          destinoLng: _destinoLng,
        );
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
      return;
    }
    setState(() => _enviando = false);
    // El motivo del servidor, tal cual: son concretos («no puede pasar de
    // $X», «ya tienes 2 sin terminar») y cada uno se arregla distinto.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    String dosDigitos(int n) => n.toString().padLeft(2, '0');
    final cuando = _salida == null
        ? 'Lo antes posible'
        : 'Sale el ${dosDigitos(_salida!.day)}/${dosDigitos(_salida!.month)} · '
            '${dosDigitos(_salida!.hour)}:${dosDigitos(_salida!.minute)}';

    return Padding(
      // El teclado no puede tapar el campo, el mismo fallo que ya se corrigió
      // en pedidos y en la hoja de pedir viaje.
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: SingleChildScrollView(
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
              Text(
                'Publica tu viaje',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimaryColor,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Otros pasajeros se suman y un taxista lo toma. Tú vas en él.',
                style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
              ),
              const SizedBox(height: 16),

              // Con Google y con mapa. Antes eran dos `TextField` pelados, así
              // que el servidor tenía que geocodificar la frase y, si fallaba,
              // el viaje quedaba sin punto: el taxista no veía en el mapa
              // dónde recoger. `allowMapPicker` viene activado por defecto y
              // es la salida cuando la dirección no existe en Google o no se
              // sabe escribir («frente a la cancha»), que en pueblo es la
              // mitad de los casos.
              AddressAutocompleteField(
                controller: _origenCtrl,
                label: 'De dónde sales',
                hint: 'Ej. Barrio El Rosario',
                requiredField: true,
                onPlaceSelected: (p) {
                  setState(() {
                    _origenLat = p.lat;
                    _origenLng = p.lng;
                  });
                  _consultarPrecio();
                },
                // Al escribir a mano se TIRAN las coordenadas de la selección
                // anterior: conservarlas mandaría al taxi al sitio viejo con
                // el texto nuevo, y nada en pantalla lo delataría.
                onManualEdit: () => setState(() {
                  _origenLat = null;
                  _origenLng = null;
                }),
              ),
              const SizedBox(height: 12),
              AddressAutocompleteField(
                controller: _destinoCtrl,
                label: 'A dónde vas',
                hint: 'Ej. Hospital San Juan de Dios',
                requiredField: true,
                onPlaceSelected: (p) {
                  setState(() {
                    _destinoLat = p.lat;
                    _destinoLng = p.lng;
                  });
                  _consultarPrecio();
                },
                onManualEdit: () => setState(() {
                  _destinoLat = null;
                  _destinoLng = null;
                }),
              ),
              const SizedBox(height: 16),

              _FilaContador(
                titulo: 'Puestos en total',
                valor: _puestos,
                minimo: 2,
                maximo: 4,
                onCambio: (v) {
                  setState(() {
                    _puestos = v;
                    // Nunca puede quedarse con todos: es la regla que impide
                    // pagar una carrera entera al precio de un puesto, y el
                    // servidor la vuelve a comprobar.
                    if (_mios >= _puestos) _mios = _puestos - 1;
                  });
                  _consultarPrecio();
                },
              ),
              const SizedBox(height: 8),
              _FilaContador(
                titulo: 'Para mí',
                valor: _mios,
                minimo: 1,
                maximo: _puestos - 1,
                onCambio: (v) => setState(() => _mios = v),
              ),
              const SizedBox(height: 16),

              // Dos opciones, y «lo antes posible» de primera: es lo que
              // quiere casi todo el mundo que publica un puesto urbano. Antes
              // solo había reloj, y poner la hora más cercana dejaba el viaje
              // inservible — se evaporaba del tablero al minuto.
              Row(
                children: [
                  Expanded(
                    child: _OpcionCuando(
                      texto: 'Lo antes posible',
                      icono: Icons.bolt_rounded,
                      activa: _salida == null,
                      onTap: () => setState(() => _salida = null),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _OpcionCuando(
                      texto: _salida == null ? 'A una hora' : cuando,
                      icono: Icons.schedule_rounded,
                      activa: _salida != null,
                      onTap: _elegirHora,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // EL PRECIO NO SE PREGUNTA: lo pone la plataforma. Antes era un
              // campo de texto con un tope, así que dos pasajeros publicaban
              // el mismo trayecto a precios distintos y había que validarlo
              // contra un cálculo que dependía de Google.
              _PrecioFijo(
                cargando: _consultandoPrecio,
                precio: _precio?.precio,
                carreraSola: _precio?.carreraSola,
                puestos: _puestos,
              ),
              const SizedBox(height: 12),

              _Campo(
                controller: _notasCtrl,
                label: 'Notas (opcional)',
                hint: 'Ej. Llevo una maleta',
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _kUrbano,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _enviando ? null : _publicar,
                  child: _enviando
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Publicar viaje'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Campo extends StatelessWidget {
  const _Campo({
    required this.controller,
    required this.label,
    required this.hint,
    this.teclado,
    this.onEditado,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType? teclado;
  final VoidCallback? onEditado;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        keyboardType: teclado,
        onEditingComplete: onEditado,
        onTapOutside: (_) {
          FocusManager.instance.primaryFocus?.unfocus();
          onEditado?.call();
        },
        style: TextStyle(color: context.textPrimaryColor),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
}

class _FilaContador extends StatelessWidget {
  const _FilaContador({
    required this.titulo,
    required this.valor,
    required this.minimo,
    required this.maximo,
    required this.onCambio,
  });

  final String titulo;
  final int valor;
  final int minimo;
  final int maximo;
  final ValueChanged<int> onCambio;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: Text(
              titulo,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
          ),
          IconButton.filledTonal(
            // El título ya dice de qué es el número («Puestos»), así que la
            // etiqueta lo reusa: «Quitar» a secas no dice de qué.
            tooltip: 'Menos $titulo',
            onPressed: valor > minimo ? () => onCambio(valor - 1) : null,
            icon: const Icon(Icons.remove_rounded, size: 18),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              '$valor',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
          ),
          IconButton.filledTonal(
            tooltip: 'Más $titulo',
            onPressed: valor < maximo ? () => onCambio(valor + 1) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
          ),
        ],
      );
}

/// Una de las dos formas de decir cuándo: ya, o a una hora.
class _OpcionCuando extends StatelessWidget {
  const _OpcionCuando({
    required this.texto,
    required this.icono,
    required this.activa,
    required this.onTap,
  });

  final String texto;
  final IconData icono;
  final bool activa;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
          decoration: BoxDecoration(
            color: activa ? _kUrbano.withValues(alpha: 0.10) : null,
            border: Border.all(
              color: activa ? _kUrbano : context.outlineColor,
              width: activa ? 1.6 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(icono, size: 18, color: activa ? _kUrbano : context.textSecondaryColor),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  texto,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: activa ? _kUrbano : context.textPrimaryColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

/// El precio del puesto, que pone la plataforma.
///
/// Enseña el ahorro frente a tomar el taxi solo cuando se sabe cuánto cuesta
/// esa carrera: es el argumento del servicio. **Si no se sabe, no se inventa
/// ningún ahorro** — un «ahorras $X» calculado sobre un número que no se pudo
/// medir sería peor que no decir nada.
class _PrecioFijo extends StatelessWidget {
  const _PrecioFijo({
    required this.cargando,
    required this.precio,
    required this.carreraSola,
    required this.puestos,
  });

  final bool cargando;
  final double? precio;
  final double? carreraSola;
  final int puestos;

  @override
  Widget build(BuildContext context) {
    final p = precio;
    final sola = carreraSola;
    final ahorro = (p != null && sola != null && sola > p) ? sola - p : null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: _kUrbano.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.confirmation_number_rounded, size: 20, color: _kUrbano),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  cargando || p == null
                      ? 'Calculando el precio del puesto…'
                      : '${CurrencyFormatter.format(p)} por puesto',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimaryColor,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  ahorro != null
                      ? 'Ahorras ${CurrencyFormatter.format(ahorro)} frente a ir solo'
                      : 'Precio fijo de ZIPA · la carrera entre $puestos puestos',
                  style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
