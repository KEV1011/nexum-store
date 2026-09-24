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
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, fallback: '/home'),
        ),
        title: const Text('Viaje por puestos'),
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
        const _Aviso(
          icono: Icons.schedule_rounded,
          titulo: 'Ningún taxi tiene puestos ahora',
          cuerpo: 'Los conductores publican sus recorridos a lo largo del día. '
              'Vuelve más tarde o pide una carrera normal.',
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
                '${trip.driverName} · ${trip.vehicleDescription}',
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

            TextField(
              controller: _dondeCtrl,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: '¿Dónde te recogemos? (opcional)',
                hintText: 'Ej: Calle 6 # 4-20, frente a la panadería',
                prefixIcon: Icon(Icons.my_location_rounded),
                border: OutlineInputBorder(),
              ),
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
