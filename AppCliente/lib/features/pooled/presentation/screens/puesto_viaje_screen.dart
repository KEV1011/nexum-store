/// Un viaje por puestos del pasajero, publicado por él o reservado.
///
/// POR QUÉ EXISTE. Quien reservaba un puesto no volvía a ver su viaje: no
/// sabía si un taxista lo había tomado, cuándo arrancaba, por dónde iba el
/// taxi, ni podía hablar con nadie ni calificar al terminar. Quien lo
/// publicaba lo veía en una tarjeta que desaparecía al terminar. Esto es, para
/// el viaje por puestos, lo que el seguimiento es para la carrera normal.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/core/services/geo_service.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/pooled/domain/entities/mi_viaje_puesto.dart';
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/providers/mis_viajes_puesto_provider.dart';
import 'package:nexum_client/features/transport/presentation/screens/trip_chat_screen.dart';
import 'package:nexum_client/shared/widgets/google_map_tiles.dart';
import 'package:nexum_client/shared/widgets/map_pin.dart';
import 'package:nexum_client/shared/widgets/vehicle_glyph.dart';

const _kUrbano = AppColors.serviceTaxi;

class PuestoViajeScreen extends ConsumerStatefulWidget {
  const PuestoViajeScreen({required this.tripId, super.key});

  final String tripId;

  @override
  ConsumerState<PuestoViajeScreen> createState() => _PuestoViajeScreenState();
}

class _PuestoViajeScreenState extends ConsumerState<PuestoViajeScreen> {
  MiViajePuesto? _viaje;
  String? _error;
  bool _cargando = true;
  bool _trabajando = false;
  Timer? _sondeo;

  @override
  void initState() {
    super.initState();
    _cargar();
    // Cada 8 s mientras el viaje siga vivo: es lo que mueve el taxi en el
    // mapa y lo que cambia «esperando» por «en camino».
    _sondeo = Timer.periodic(const Duration(seconds: 8), (_) {
      if (_viaje?.activo ?? true) _cargar();
    });
  }

  @override
  void dispose() {
    _sondeo?.cancel();
    super.dispose();
  }

  Future<void> _cargar() async {
    final (v, error) =
        await ref.read(misViajesPuestoProvider.notifier).uno(widget.tripId);
    if (!mounted) return;
    setState(() {
      _cargando = false;
      // Un fallo de red NO borra lo que ya se veía: el viaje no puede
      // desaparecer de la pantalla porque se cayó la señal un momento.
      if (v != null) {
        _viaje = v;
        _error = null;
      } else if (_viaje == null) {
        _error = error;
      }
    });
  }

  Future<void> _cancelar(MiViajePuesto v) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(v.soyAutor ? '¿Cancelar el viaje?' : '¿Cancelar tu puesto?'),
        content: Text(
          v.soyAutor
              ? 'Se cancela para todos y les avisamos a los que se sumaron.'
              : 'Liberas tu puesto para que lo tome otra persona.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('No'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: colorDeTextoSobre(AppColors.error),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sí, cancelar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _trabajando = true);
    final error = await ref.read(misViajesPuestoProvider.notifier).cancelar(v);
    if (!mounted) return;
    setState(() => _trabajando = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Listo, quedó cancelado.')),
    );
    if (error == null) await _cargar();
  }

  Future<void> _calificar(MiViajePuesto v, int estrellas) async {
    setState(() => _trabajando = true);
    final error =
        await ref.read(misViajesPuestoProvider.notifier).calificar(v, estrellas);
    if (!mounted) return;
    setState(() => _trabajando = false);
    if (error == null) HapticFeedback.mediumImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? '¡Gracias por calificar!')),
    );
    if (error == null) await _cargar();
  }

  void _abrirChat(MiViajePuesto v) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TripChatScreen(
          tripId: v.id,
          peerName: 'Chat del viaje',
          miId: v.miUsuarioId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final v = _viaje;
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kUrbano,
        foregroundColor: colorDeTextoSobre(_kUrbano),
        leading: IconButton(
          tooltip: 'Volver',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, fallback: '/puesto-urbano'),
        ),
        title: const Text('Tu viaje por puestos'),
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator(color: _kUrbano))
          : v == null
              ? _SinViaje(texto: _error ?? 'No encontramos ese viaje.', onReintentar: _cargar)
              : RefreshIndicator(
                  color: _kUrbano,
                  onRefresh: _cargar,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      if (v.tieneExtremos) ...[
                        _MapaViaje(viaje: v),
                        const SizedBox(height: 14),
                      ],
                      _Estado(viaje: v),
                      const SizedBox(height: 12),
                      _MiReserva(viaje: v),
                      const SizedBox(height: 16),
                      if (v.chatDisponible)
                        OutlinedButton.icon(
                          onPressed: () => _abrirChat(v),
                          icon: const Icon(Icons.chat_bubble_outline_rounded),
                          label: const Text('Chat con el taxista y los pasajeros'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _kUrbano,
                            side: const BorderSide(color: _kUrbano),
                            minimumSize: const Size.fromHeight(48),
                          ),
                        ),
                      if (v.puedeCalificar) ...[
                        const SizedBox(height: 16),
                        _Calificar(
                          conductor: v.driverName,
                          enabled: !_trabajando,
                          onElegir: (n) => _calificar(v, n),
                        ),
                      ] else if (v.estado == PooledTripStatus.completed &&
                          v.reserva.rating != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Calificaste este viaje con ${v.reserva.rating} '
                          '${v.reserva.rating == 1 ? 'estrella' : 'estrellas'}.',
                          style: TextStyle(color: context.textSecondaryColor),
                        ),
                      ],
                      if (v.cancelable) ...[
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: _trabajando ? null : () => _cancelar(v),
                          icon: const Icon(Icons.close_rounded, size: 18),
                          label: Text(v.soyAutor ? 'Cancelar el viaje' : 'Cancelar mi puesto'),
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.error,
                            minimumSize: const Size(0, 44),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }
}

String _hora(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

class _Estado extends StatelessWidget {
  const _Estado({required this.viaje});
  final MiViajePuesto viaje;

  @override
  Widget build(BuildContext context) {
    final v = viaje;
    final Color color = switch (v.estado) {
      PooledTripStatus.cancelled => AppColors.error,
      PooledTripStatus.completed => AppColors.success,
      _ => v.sinConductor ? AppColors.warning : _kUrbano,
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            v.titulo,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            estadoDeMiViaje(v),
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: color),
          ),
          const SizedBox(height: 4),
          Text(
            'Sale a las ${_hora(v.salida)} · '
            '${v.pasajeros} de ${v.totalSeats} puestos ocupados',
            style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor),
          ),
          if (!v.sinConductor) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.local_taxi_rounded, size: 18, color: _kUrbano),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [
                      if ((v.driverName ?? '').isNotEmpty) v.driverName!,
                      if ((v.vehicleDescription ?? '').isNotEmpty) v.vehicleDescription!,
                    ].join(' · '),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimaryColor,
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (v.soyAutor) ...[
            const SizedBox(height: 6),
            Text(
              'Tú publicaste este viaje.',
              style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
            ),
          ],
        ],
      ),
    );
  }
}

class _MiReserva extends StatelessWidget {
  const _MiReserva({required this.viaje});
  final MiViajePuesto viaje;

  @override
  Widget build(BuildContext context) {
    final r = viaje.reserva;
    final total = r.amountToPay ?? r.fareTotal ?? viaje.farePerSeat * r.seatsBooked;
    Widget fila(IconData icono, String texto) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icono, size: 18, color: context.textSecondaryColor),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  texto,
                  style: TextStyle(fontSize: 13.5, color: context.textPrimaryColor),
                ),
              ),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tu puesto',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 10),
          fila(
            Icons.place_rounded,
            (r.pickupAddress?.isNotEmpty ?? false)
                ? 'Te recogen en: ${r.pickupAddress}'
                : 'Sin punto de recogida: escríbele al taxista por el chat',
          ),
          fila(Icons.event_seat_rounded, r.seatLabel),
          fila(
            Icons.payments_rounded,
            'Pagas ${CurrencyFormatter.format(total)} al subir'
            '${r.paymentLabel != null ? ' · ${r.paymentLabel}' : ''}',
          ),
        ],
      ),
    );
  }
}

/// El trayecto: origen → tu recogida → destino, y el taxi si ya hay uno.
class _MapaViaje extends ConsumerStatefulWidget {
  const _MapaViaje({required this.viaje});
  final MiViajePuesto viaje;

  @override
  ConsumerState<_MapaViaje> createState() => _MapaViajeState();
}

class _MapaViajeState extends ConsumerState<_MapaViaje> {
  List<LatLng>? _ruta;

  List<LatLng> _paradas(MiViajePuesto v) => [
        LatLng(v.originLat!, v.originLng!),
        if (v.reserva.pickupLat != null && v.reserva.pickupLng != null)
          LatLng(v.reserva.pickupLat!, v.reserva.pickupLng!),
        LatLng(v.destLat!, v.destLng!),
      ];

  @override
  void initState() {
    super.initState();
    _trazar();
  }

  Future<void> _trazar() async {
    final ps = _paradas(widget.viaje);
    final geo = ref.read(geoServiceProvider);
    final ruta = <LatLng>[ps.first];
    var algunaReal = false;
    for (var i = 0; i < ps.length - 1; i++) {
      final a = ps[i];
      final b = ps[i + 1];
      if (const Distance().as(LengthUnit.Meter, a, b) < 30) continue;
      final tramo = await geo.routePoints(
        originLat: a.latitude,
        originLng: a.longitude,
        destLat: b.latitude,
        destLng: b.longitude,
      );
      if (tramo != null && tramo.length > 1) {
        algunaReal = true;
        ruta.addAll(tramo.skip(1));
      } else {
        ruta.add(b);
      }
    }
    if (mounted && algunaReal) setState(() => _ruta = ruta);
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.viaje;
    final ps = _paradas(v);
    final taxi = v.driverLat != null && v.driverLng != null
        ? LatLng(v.driverLat!, v.driverLng!)
        : null;
    final recogida = v.reserva.pickupLat != null && v.reserva.pickupLng != null
        ? LatLng(v.reserva.pickupLat!, v.reserva.pickupLng!)
        : null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        height: 240,
        child: FlutterMap(
          options: MapOptions(
            backgroundColor: mapaFondoOscuro,
            initialCenter: ps.first,
            initialZoom: 14,
            initialCameraFit: CameraFit.coordinates(
              coordinates: [...ps, if (taxi != null) taxi],
              padding: const EdgeInsets.fromLTRB(40, 56, 40, 28),
              maxZoom: 16,
            ),
          ),
          children: [
            const GoogleMapTiles(),
            PolylineLayer(
              polylines: [
                Polyline(
                  points: _ruta ?? ps,
                  strokeWidth: 4.5,
                  color: _kUrbano,
                ),
              ],
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: ps.first,
                  width: MapPin.markerWidth,
                  height: MapPin.markerHeight,
                  alignment: Alignment.topCenter,
                  child: const MapPin(color: Color(0xFF16A34A), icon: Icons.trip_origin),
                ),
                Marker(
                  point: ps.last,
                  width: MapPin.markerWidth,
                  height: MapPin.markerHeight,
                  alignment: Alignment.topCenter,
                  child: const MapPin(color: Color(0xFFDC2626), icon: Icons.flag_rounded),
                ),
                if (recogida != null)
                  Marker(
                    point: recogida,
                    width: MapPin.markerWidth,
                    height: MapPin.markerHeight,
                    alignment: Alignment.topCenter,
                    child: const MapPin(color: _kUrbano, icon: Icons.person_pin_circle_rounded),
                  ),
                if (taxi != null)
                  Marker(
                    point: taxi,
                    width: VehicleGlyph.markerWidth,
                    height: VehicleGlyph.markerHeight,
                    child: const VehicleGlyph(
                      kind: VehicleGlyphKind.taxi,
                      headingDegrees: 0,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Calificar extends StatelessWidget {
  const _Calificar({required this.conductor, required this.enabled, required this.onElegir});

  final String? conductor;
  final bool enabled;
  final ValueChanged<int> onElegir;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.outlineColor),
      ),
      child: Column(
        children: [
          Text(
            '¿Cómo te fue con ${(conductor ?? '').isNotEmpty ? conductor : 'el taxista'}?',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var n = 1; n <= 5; n++)
                IconButton(
                  tooltip: '$n ${n == 1 ? 'estrella' : 'estrellas'}',
                  onPressed: enabled ? () => onElegir(n) : null,
                  icon: const Icon(Icons.star_border_rounded, size: 34, color: Color(0xFFF59E0B)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SinViaje extends StatelessWidget {
  const _SinViaje({required this.texto, required this.onReintentar});
  final String texto;
  final Future<void> Function() onReintentar;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.directions_car_outlined, size: 48, color: context.textSecondaryColor),
              const SizedBox(height: 12),
              Text(
                texto,
                textAlign: TextAlign.center,
                style: TextStyle(color: context.textSecondaryColor),
              ),
              const SizedBox(height: 12),
              TextButton(onPressed: onReintentar, child: const Text('Reintentar')),
            ],
          ),
        ),
      );
}
