import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/shared/models/oferta_mapper.dart';

/// El tablero de reservas: viajes que alguien programó para más tarde y que el
/// conductor puede APARTAR desde ahora.
///
/// Para qué existe: el estudiante que entra a clase a las 6:00 no quiere que a
/// las 5:45 «se empiece a buscar», y el taxista quiere llegar a la noche con la
/// mañana cuadrada. Antes el viaje programado salía a buscar conductor 15
/// minutos antes y nadie podía comprometerse con antelación.
///
///  - Disponibles: GET /driver/reservas (solo las que atiende su vehículo).
///    Apartar con POST /driver/reservas/:id/apartar.
///  - Mis reservas: GET /driver/reservas/mias (con los datos del pasajero).
///    Soltar con POST /driver/reservas/:id/soltar, mientras no haya empezado.
///
/// Cuando llega la hora, el servidor la activa sola: la reserva pasa a ser un
/// viaje aceptado normal y llega el aviso `reserva_activa` por el socket.
class ReservasScreen extends ConsumerStatefulWidget {
  const ReservasScreen({super.key});

  @override
  ConsumerState<ReservasScreen> createState() => _ReservasScreenState();
}

class _ReservasScreenState extends ConsumerState<ReservasScreen> {
  bool _loading = true;
  bool _fallo = false;
  String? _ocupado;
  List<Map<String, dynamic>> _mias = const [];
  List<Map<String, dynamic>> _libres = const [];

  /// Otro conductor puede apartar en cualquier momento: el tablero se refresca
  /// solo para que no se quede enseñando algo que ya no está.
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _cargar();
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => _cargar());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final dio = DioClient();
      final mias = await dio.get<Map<String, dynamic>>('/driver/reservas/mias');
      final libres = await dio.get<Map<String, dynamic>>('/driver/reservas');
      if (!mounted) return;
      setState(() {
        _mias = (mias.data?['data'] as List?)?.cast<Map<String, dynamic>>() ??
            const [];
        _libres =
            (libres.data?['data'] as List?)?.cast<Map<String, dynamic>>() ??
                const [];
        _fallo = false;
      });
    } catch (_) {
      // Se distingue «no hay reservas» de «no pudimos preguntar»: enseñar el
      // estado vacío cuando falló la red es decirle al conductor que no hay
      // trabajo cuando puede haberlo.
      if (mounted) setState(() => _fallo = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _apartar(Map<String, dynamic> r) async {
    setState(() => _ocupado = r['id'] as String);
    try {
      await DioClient()
          .post<Map<String, dynamic>>('/driver/reservas/${r['id']}/apartar');
      _aviso('Reserva apartada. Te avisamos cuando sea la hora.', error: false);
      await _cargar();
    } on DioException catch (e) {
      // El motivo viene del backend en español y es el que importa: «otro la
      // tomó primero», «ya tienes 6 apartadas», «tu vehículo no corresponde».
      _aviso(_motivo(e) ?? 'No se pudo apartar la reserva.');
      await _cargar();
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  Future<void> _soltar(Map<String, dynamic> r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Soltar esta reserva?'),
        content: Text(
          'El pasajero reservó para ${_cuando(r['scheduledFor'] as String?)}. '
          'Si la sueltas, buscaremos otro conductor y a él se le avisa.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Conservarla')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Soltar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _ocupado = r['id'] as String);
    try {
      await DioClient()
          .post<Map<String, dynamic>>('/driver/reservas/${r['id']}/soltar');
      _aviso('Reserva soltada.', error: false);
      await _cargar();
    } on DioException catch (e) {
      _aviso(_motivo(e) ?? 'No se pudo soltar la reserva.');
    } finally {
      if (mounted) setState(() => _ocupado = null);
    }
  }

  /// Arranca el viaje de una reserva que ya llegó a su hora.
  ///
  /// El servidor ya la pasó a viaje aceptado, así que aquí NO se vuelve a
  /// aceptar nada: se construye el viaje activo con la misma oferta que habría
  /// llegado por el socket y se entra a la pantalla de siempre.
  Future<void> _iniciar(Map<String, dynamic> r) async {
    final oferta = r['oferta'];
    if (oferta is! Map<String, dynamic>) {
      // Sin la oferta no se puede armar el viaje. Se dice, en vez de abrir una
      // pantalla vacía que el conductor no sabría interpretar.
      _aviso('No pudimos cargar el viaje. Desliza para actualizar.');
      return;
    }
    final entidad = ofertaDeViaje(oferta);
    if (entidad == null) {
      _aviso('No pudimos cargar el viaje. Desliza para actualizar.');
      return;
    }
    // El `await` es obligatorio: `/active-trip` se devuelve al inicio si el
    // viaje activo todavía está vacío cuando se construye.
    await ref.read(activeTripProvider.notifier).beginTrip(entidad);
    if (mounted) context.push('/active-trip');
  }

  String? _motivo(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    return null;
  }

  void _aviso(String texto, {bool error = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: error ? const Color(0xFFDC2626) : const Color(0xFF059669),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Reservas'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => safeBack(context, fallback: '/home'),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _cargar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  if (_fallo) const _AvisoSinConexion(),
                  _Seccion('Mis reservas', _mias.length),
                  if (_mias.isEmpty)
                    const _Vacio(
                      'Todavía no has apartado ninguna.',
                      'Las que apartes salen aquí con los datos del pasajero.',
                    ),
                  for (final r in _mias)
                    _TarjetaReserva(
                      reserva: r,
                      mia: true,
                      ocupado: _ocupado == r['id'],
                      onAccion: () => _soltar(r),
                      onIniciar: () => _iniciar(r),
                    ),
                  const SizedBox(height: 24),
                  _Seccion('Disponibles', _libres.length),
                  if (_libres.isEmpty)
                    const _Vacio(
                      'No hay reservas libres ahora mismo.',
                      'Aquí aparecen los viajes que la gente programa para más '
                          'tarde y que tu vehículo puede atender.',
                    ),
                  for (final r in _libres)
                    _TarjetaReserva(
                      reserva: r,
                      mia: false,
                      ocupado: _ocupado == r['id'],
                      onAccion: () => _apartar(r),
                    ),
                ],
              ),
            ),
    );
  }
}

class _AvisoSinConexion extends StatelessWidget {
  const _AvisoSinConexion();

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF3C7),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(children: [
          Icon(Icons.wifi_off_rounded, color: Color(0xFFB45309), size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'No pudimos actualizar el tablero. Puede haber más reservas de '
              'las que ves.',
              style: TextStyle(color: Color(0xFF7C2D12), fontSize: 13),
            ),
          ),
        ]),
      );
}

class _Seccion extends StatelessWidget {
  const _Seccion(this.titulo, this.cuantas);

  final String titulo;
  final int cuantas;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          Text(titulo,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              )),
          const SizedBox(width: 8),
          if (cuantas > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF059669).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$cuantas',
                  style: const TextStyle(
                    color: Color(0xFF059669),
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  )),
            ),
        ]),
      );
}

class _Vacio extends StatelessWidget {
  const _Vacio(this.titulo, this.detalle);

  final String titulo;
  final String detalle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(titulo,
              style: TextStyle(
                  color: context.textPrimaryColor, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(detalle,
              style: TextStyle(color: context.textSecondaryColor, fontSize: 13)),
        ]),
      );
}

class _TarjetaReserva extends StatelessWidget {
  const _TarjetaReserva({
    required this.reserva,
    required this.mia,
    required this.ocupado,
    required this.onAccion,
    this.onIniciar,
  });

  final Map<String, dynamic> reserva;
  final bool mia;
  final bool ocupado;
  final VoidCallback onAccion;

  /// Solo en las propias: entra al viaje activo cuando ya llegó la hora.
  final VoidCallback? onIniciar;

  @override
  Widget build(BuildContext context) {
    final enCurso = reserva['enCurso'] == true;
    final tarifa = (reserva['estimatedFare'] as num?)?.toDouble();
    final km = (reserva['distanceKm'] as num?)?.toDouble();
    final pasajero = reserva['passengerName'] as String?;
    final telefono = reserva['passengerPhone'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: enCurso
              ? const Color(0xFF059669)
              : context.textSecondaryColor.withValues(alpha: 0.18),
          width: enCurso ? 1.6 : 1,
        ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(_icono(reserva['serviceType'] as String?),
              size: 18, color: context.textSecondaryColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _cuando(reserva['scheduledFor'] as String?),
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 15,
                color: context.textPrimaryColor,
              ),
            ),
          ),
          if (enCurso)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFF059669),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('Es ahora',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800)),
            ),
        ]),
        const SizedBox(height: 10),
        _Punto(
          color: const Color(0xFF059669),
          texto: reserva['originAddress'] as String? ?? '',
        ),
        const SizedBox(height: 6),
        _Punto(
          color: const Color(0xFFDC2626),
          texto: reserva['destAddress'] as String? ?? '',
        ),
        const SizedBox(height: 10),
        Row(children: [
          if (tarifa != null)
            Text('\$${tarifa.toStringAsFixed(0)}',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: context.textPrimaryColor,
                )),
          if (km != null) ...[
            const SizedBox(width: 10),
            Text('${km.toStringAsFixed(1)} km',
                style:
                    TextStyle(color: context.textSecondaryColor, fontSize: 13)),
          ],
        ]),
        if (mia && pasajero != null) ...[
          const SizedBox(height: 8),
          Text(
            telefono != null ? '$pasajero · $telefono' : pasajero,
            style: TextStyle(color: context.textSecondaryColor, fontSize: 13),
          ),
        ],
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: enCurso
              // Ya está en marcha: soltarla ahora dejaría al pasajero esperando
              // en la puerta, así que en vez del botón de soltar va el de
              // empezar. Es el momento para el que existe todo esto.
              ? (onIniciar != null
                  ? FilledButton.icon(
                      onPressed: onIniciar,
                      icon: const Icon(Icons.navigation_rounded, size: 18),
                      style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF059669)),
                      label: const Text('Iniciar viaje'),
                    )
                  : Text(
                      'Ya está en marcha.',
                      style: TextStyle(
                          color: context.textSecondaryColor, fontSize: 13),
                    ))
              : ocupado
                  ? const Center(
                      child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : mia
                      ? OutlinedButton(
                          onPressed: onAccion, child: const Text('Soltar'))
                      : FilledButton(
                          onPressed: onAccion,
                          style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF059669)),
                          child: const Text('Apartar'),
                        ),
        ),
      ]),
    );
  }

  IconData _icono(String? tipo) => switch (tipo) {
        'TAXI' => Icons.local_taxi_rounded,
        'MOTO' => Icons.two_wheeler_rounded,
        'ENVIOS' => Icons.inventory_2_rounded,
        _ => Icons.directions_car_rounded,
      };
}

class _Punto extends StatelessWidget {
  const _Punto({required this.color, required this.texto});

  final Color color;
  final String texto;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(texto,
                style:
                    TextStyle(color: context.textPrimaryColor, fontSize: 14)),
          ),
        ],
      );
}

/// «mañana, 06:00» en la zona del teléfono.
///
/// Sin fecha no se inventa una hora: se dice que no se sabe. El conductor tiene
/// que poder distinguir «a las 6 de la mañana» de «no tenemos el dato».
String _cuando(String? iso) {
  if (iso == null) return 'Hora por confirmar';
  final f = DateTime.tryParse(iso)?.toLocal();
  if (f == null) return 'Hora por confirmar';

  final ahora = DateTime.now();
  final hoy = DateTime(ahora.year, ahora.month, ahora.day);
  final dia = DateTime(f.year, f.month, f.day);
  final faltan = dia.difference(hoy).inDays;

  final hora =
      '${f.hour.toString().padLeft(2, '0')}:${f.minute.toString().padLeft(2, '0')}';
  if (faltan == 0) return 'Hoy, $hora';
  if (faltan == 1) return 'Mañana, $hora';

  const dias = [
    'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
  ];
  if (faltan > 1 && faltan < 7) return '${dias[f.weekday - 1]}, $hora';
  return '${f.day}/${f.month}, $hora';
}
