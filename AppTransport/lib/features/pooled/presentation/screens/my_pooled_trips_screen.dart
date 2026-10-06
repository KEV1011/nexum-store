import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/freight/presentation/widgets/freight_route_map.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/pooled_driver_provider.dart';
import 'package:nexum_driver/shared/services/abordaje_tiquete.dart';
import 'package:nexum_driver/shared/widgets/hoja_deslizable.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class MyPooledTripsScreen extends ConsumerStatefulWidget {
  const MyPooledTripsScreen({super.key});

  @override
  ConsumerState<MyPooledTripsScreen> createState() =>
      _MyPooledTripsScreenState();
}

class _MyPooledTripsScreenState extends ConsumerState<MyPooledTripsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final n = ref.read(pooledDriverProvider.notifier);
      n.loadMine();
      n.cargarLibres();
    });
  }

  Future<void> _confirm(String title, String body, VoidCallback onYes) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sí')),
        ],
      ),
    );
    if (ok == true) onYes();
  }

  /// Dos formas de vender puestos, y son negocios distintos: el intermunicipal
  /// va de una ciudad a otra y el urbano es el recorrido de siempre dentro de
  /// la ciudad. Se pregunta en vez de meterlas en el mismo formulario porque
  /// las reglas de precio no son las mismas.
  Future<void> _elegirQuePublicar() async {
    final destino = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              leading: const CircleAvatar(
                backgroundColor: AppColors.serviceTaxiContainer,
                child: Icon(Icons.groups_rounded, color: AppColors.serviceTaxi),
              ),
              title: const Text('Viaje por puestos en la ciudad'),
              subtitle: const Text(
                  'Tu recorrido de siempre, vendido por sillas'),
              onTap: () => Navigator.pop(ctx, '/puesto-urbano/publicar'),
            ),
            ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFE0E7FF),
                child: Icon(Icons.alt_route_rounded, color: _kPooledColor),
              ),
              title: const Text('Viaje a otro municipio'),
              subtitle: const Text('Intermunicipal, con tarifa por puesto'),
              onTap: () => Navigator.pop(ctx, '/pooled-publish'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (destino != null && mounted) context.push(destino);
  }

  /// Ejecuta la acción y SIEMPRE da feedback: éxito o el motivo del rechazo
  /// del backend (antes el error se perdía y el botón parecía roto).
/// Abre la hoja donde el conductor teclea el código que le dictan.
  Future<void> _abrirAbordaje(String salidaId) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _HojaAbordaje(salidaId: salidaId),
    );
    // Al cerrar se recarga: el manifiesto tiene que reflejar quién ya subió.
    if (mounted) await ref.read(pooledDriverProvider.notifier).loadMine();
  }

  Future<void> _run(Future<String?> Function() action, String okMsg) async {
    final error = await action();
    if (!mounted) return;
    if (error == null) {
      AppSnackbar.showSuccess(context, okMsg);
    } else {
      AppSnackbar.showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledDriverProvider);
    final notifier = ref.read(pooledDriverProvider.notifier);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Mis viajes compartidos'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Publicar'),
        onPressed: _elegirQuePublicar,
      ),
      body: RefreshIndicator(
        color: _kPooledColor,
        onRefresh: () async {
          await notifier.loadMine();
          await notifier.cargarLibres();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
          children: [
            // ── Lo que están pidiendo los pasajeros ───────────────────────
            // Va ARRIBA de los propios: es trabajo que se puede tomar ahora,
            // y los propios ya se sabe que existen.
            ..._tableroLibres(state, notifier),
            const SizedBox(height: 8),
            Text(
              'Mis viajes compartidos',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
            const SizedBox(height: 12),
            if (state.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                    child: CircularProgressIndicator(color: _kPooledColor)),
              )
            else if (state.trips.isEmpty)
              _sinPropios()
            else
              for (final trip in state.trips)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _PooledTripCard(
                    trip: trip,
                    onDepart: () => _confirm(
                      'Iniciar viaje',
                      '¿Marcar este viaje como en camino? Ya no se podrán reservar puestos.',
                      () => _run(
                        () => notifier.depart(trip.id),
                        'Viaje iniciado. ¡Buen camino!',
                      ),
                    ),
                    onComplete: () => _confirm(
                      'Finalizar viaje',
                      '¿Confirmas que el viaje terminó?',
                      () => _run(
                        () => notifier.complete(trip.id),
                        'Viaje finalizado.',
                      ),
                    ),
                    // Validar tiquetes: solo tiene sentido con la salida
                    // ya publicada y antes de cerrarla. Después de terminar
                    // no hay a quién subir.
                    onAbordar: () => _abrirAbordaje(trip.id),
                    onCancel: () => _confirm(
                      'Cancelar viaje',
                      'Se cancelará el viaje y se notificará a los pasajeros.',
                      () => _run(
                        () => notifier.cancel(trip.id),
                        'Viaje cancelado.',
                      ),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  /// El tablero de viajes que armaron PASAJEROS y nadie ha tomado.
  ///
  /// Cargando, falló y vacío son TRES cosas distintas y se dicen distinto: un
  /// «no hay viajes» cuando en realidad se cayó la red hace que el conductor
  /// deje de mirar el tablero.
  List<Widget> _tableroLibres(
    PooledDriverState state,
    PooledDriverNotifier notifier,
  ) {
    final titulo = Text(
      state.libres.isEmpty
          ? 'Pasajeros buscando taxi'
          : 'Pasajeros buscando taxi (${state.libres.length})',
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w800,
        color: context.textPrimaryColor,
      ),
    );

    Widget cuerpo;
    if (state.cargandoLibres && state.libres.isEmpty) {
      cuerpo = const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator(color: _kPooledColor)),
      );
    } else if (state.errorLibres != null) {
      cuerpo = _NotaTablero(
        texto: state.errorLibres!,
        accion: 'Reintentar',
        onAccion: notifier.cargarLibres,
      );
    } else if (state.avisoLibres != null) {
      cuerpo = _NotaTablero(texto: state.avisoLibres!);
    } else if (state.libres.isEmpty) {
      cuerpo = const _NotaTablero(
        texto: 'Ahora mismo nadie está buscando compartir taxi en tu ciudad. '
            'Cuando alguien publique un viaje, te aparece aquí.',
      );
    } else {
      cuerpo = Column(
        children: [
          for (final t in state.libres)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _TarjetaLibre(
                trip: t,
                onTomar: () => _confirm(
                  'Tomar este viaje',
                  'Quedará a tu nombre y los pasajeros verán tu carro. '
                      '¿Confirmas?',
                  () => _run(
                    () => notifier.tomarLibre(t.id),
                    'Viaje tomado. Aparece abajo en tus viajes.',
                  ),
                ),
              ),
            ),
        ],
      );
    }

    return [titulo, const SizedBox(height: 12), cuerpo, const SizedBox(height: 16)];
  }

  Widget _sinPropios() => Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Column(
          children: [
            Icon(Icons.groups_rounded,
                size: 48, color: context.textSecondaryColor),
            const SizedBox(height: 12),
            Text('Aún no has publicado viajes compartidos.',
                textAlign: TextAlign.center,
                style: TextStyle(color: context.textSecondaryColor)),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _elegirQuePublicar,
              icon: const Icon(Icons.add_rounded, color: _kPooledColor),
              label: const Text('Publicar tu primer viaje',
                  style: TextStyle(color: _kPooledColor)),
            ),
          ],
        ),
      );
}

class _PooledTripCard extends StatelessWidget {
  const _PooledTripCard({
    required this.trip,
    required this.onDepart,
    required this.onComplete,
    required this.onAbordar,
    required this.onCancel,
  });

  final PooledTripEntity trip;
  final VoidCallback onDepart;
  final VoidCallback onComplete;
  final VoidCallback onAbordar;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final d = trip.departureTime;
    final dtLabel =
        '${d.day}/${d.month} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(color: Color(0x0F000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                // En una salida urbana el origen y el destino son la misma
                // ciudad: «Pamplona → Pamplona» se leería como un error. El
                // nombre de la ruta lo resuelve la entidad.
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      trip.tituloRuta,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800),
                    ),
                    if (trip.esUrbano)
                      Text(
                        'Por puestos · ${trip.origin.displayName}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.serviceTaxi,
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: trip.status.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(trip.status.label,
                    style: TextStyle(
                        color: trip.status.color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.schedule_rounded,
                  size: 15, color: context.textSecondaryColor),
              const SizedBox(width: 6),
              Text(dtLabel,
                  style: TextStyle(
                      fontSize: 13, color: context.textSecondaryColor)),
              const Spacer(),
              Text('${CurrencyFormatter.format(trip.farePerSeat)} / puesto',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: _kPooledColor)),
            ],
          ),
          const SizedBox(height: 12),

          // Ruta del trayecto en el mapa (paridad con intermunicipal/flete):
          // el conductor ve por dónde va la salida de un vistazo. Si alguno de
          // los municipios llegó sin coordenadas, no se dibuja nada: mejor sin
          // mapa que con un trayecto inventado.
          if (trip.origin.coords != null && trip.destination.coords != null)
            FreightRouteMap(
              originLat: trip.origin.coords!.lat,
              originLng: trip.origin.coords!.lng,
              destLat: trip.destination.coords!.lat,
              destLng: trip.destination.coords!.lng,
              height: 140,
            ),
          // Lugares por donde pasa la salida (paradas publicadas).
          if (trip.stops.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.alt_route_rounded,
                      size: 15, color: _kPooledColor),
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
            ),
          const SizedBox(height: 12),

          // Occupancy
          Row(
            children: [
              const Icon(Icons.event_seat_rounded, size: 16, color: _kPooledColor),
              const SizedBox(width: 6),
              Text(
                '${trip.bookedSeats} de ${trip.totalSeats} puestos reservados',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: trip.totalSeats == 0 ? 0 : trip.bookedSeats / trip.totalSeats,
              minHeight: 7,
              backgroundColor: context.surfaceVariantColor,
              valueColor: const AlwaysStoppedAnimation(_kPooledColor),
            ),
          ),

          if (trip.bookings.isNotEmpty) ...[
            const SizedBox(height: 12),
            ...trip.bookings.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.person_rounded,
                          size: 15, color: context.textSecondaryColor),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              b.passengerName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 12.5, color: context.textSecondaryColor),
                            ),
                            // Dónde recogerlo: el punto que eligió, o su
                            // dirección si va puerta a puerta. Es lo primero
                            // que necesita el conductor al armar la ruta.
                            if (b.boardingPoint != null ||
                                (b.pickupAddress?.isNotEmpty ?? false))
                              Text(
                                b.boardingPoint ?? b.pickupAddress!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w600,
                                  color: _kPooledColor,
                                ),
                              ),
                            // Cuánto cobrarle. Con un código de la empresa,
                            // pedirle la tarifa completa sería cobrarle de más.
                            if (b.amountToPay != null)
                              Text(
                                b.discount > 0
                                    ? 'Cobrar ${CurrencyFormatter.format(b.amountToPay!)}'
                                        ' (−${CurrencyFormatter.format(b.discount)}'
                                        '${b.promoCode != null ? ' · ${b.promoCode}' : ''})'
                                    : 'Cobrar ${CurrencyFormatter.format(b.amountToPay!)}',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: context.textSecondaryColor,
                                ),
                              ),
                            // La planilla: quién viaja, con documento. Es lo
                            // que se contrasta al subir, y con una reserva de
                            // cuatro puestos el nombre de la cuenta no basta.
                            for (final p in b.passengers)
                              Text(
                                p,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: context.textSecondaryColor,
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      // La silla va fuera del texto que se recorta: es lo que
                      // el conductor busca en la puerta, y con la dirección
                      // larga se la comía el ellipsis.
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: b.seats.isEmpty
                              ? context.surfaceVariantColor
                              : _kPooledColor.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          b.seatLabel,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: b.seats.isEmpty
                                ? context.textSecondaryColor
                                : _kPooledColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                )),
          ],

          const SizedBox(height: 12),
          _actions(),
        ],
      ),
    );
  }

/// El botón de validar tiquetes. Icono y no texto: va al lado de acciones
  /// con nombre largo y en pantallas de 320 px la fila se parte.
  Widget _botonTiquete() => OutlinedButton(
        onPressed: onAbordar,
        style: OutlinedButton.styleFrom(
          foregroundColor: _kPooledColor,
          side: const BorderSide(color: _kPooledColor),
          padding: const EdgeInsets.symmetric(horizontal: 14),
        ),
        child: const Icon(Icons.confirmation_number_rounded, size: 20),
      );

  Widget _actions() {
    switch (trip.status) {
      case PooledTripStatus.open:
      case PooledTripStatus.full:
        return Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: onDepart,
                icon: const Icon(Icons.play_arrow_rounded, size: 18),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPooledColor,
                  foregroundColor: Colors.white,
                ),
                label: const Text('Iniciar'),
              ),
            ),
            const SizedBox(width: 10),
            _botonTiquete(),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: onCancel,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.error,
                side: const BorderSide(color: AppColors.error),
              ),
              child: const Text('Cancelar'),
            ),
          ],
        );
      case PooledTripStatus.departed:
        // En camino sigue habiendo gente que sube: los puntos de embarque
        // están repartidos por la ciudad de origen, no solo en la terminal.
        return Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: onComplete,
                icon: const Icon(Icons.flag_rounded, size: 18),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.success,
                  foregroundColor: Colors.white,
                ),
                label: const Text('Finalizar viaje'),
              ),
            ),
            const SizedBox(width: 10),
            _botonTiquete(),
          ],
        );
      case PooledTripStatus.completed:
      case PooledTripStatus.cancelled:
        return const SizedBox.shrink();
    }
  }
}

/// Una nota del tablero: cargando no, pero «no hay», «falló» o «falta algo».
class _NotaTablero extends StatelessWidget {
  const _NotaTablero({required this.texto, this.accion, this.onAccion});

  final String texto;
  final String? accion;
  final VoidCallback? onAccion;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.cardColor2,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.outlineColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              texto,
              style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
            ),
            if (accion != null && onAccion != null) ...[
              const SizedBox(height: 8),
              TextButton(onPressed: onAccion, child: Text(accion!)),
            ],
          ],
        ),
      );
}

/// Un viaje que armó un pasajero y que todavía no tiene conductor.
///
/// Enseña lo que decide si vale la pena: a qué hora, el recorrido, cuántos
/// puestos ya están vendidos y cuánto suma eso. Un taxista no toma un viaje
/// por «cuatro puestos a dos mil» sino por lo que se va a llevar.
class _TarjetaLibre extends StatelessWidget {
  const _TarjetaLibre({required this.trip, required this.onTomar});

  final PooledTripEntity trip;
  final VoidCallback onTomar;

  @override
  Widget build(BuildContext context) {
    final d = trip.departureTime;
    final cuando = '${d.day}/${d.month} · '
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    final vendidos = trip.totalSeats - trip.availableSeats;
    final yaVale = trip.farePerSeat * vendidos;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.serviceTaxi.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.schedule_rounded,
                  size: 16, color: AppColors.serviceTaxi),
              const SizedBox(width: 6),
              Text(
                cuando,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimaryColor,
                ),
              ),
              const Spacer(),
              Text(
                '${CurrencyFormatter.format(trip.farePerSeat)}/puesto',
                style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            trip.tituloRuta,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '$vendidos de ${trip.totalSeats} puestos vendidos · '
            'llevas ${CurrencyFormatter.format(yaVale)} si sale así',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
          ),
          if ((trip.notes ?? '').isNotEmpty) ...[
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
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.serviceTaxi,
                foregroundColor: Colors.white,
              ),
              onPressed: onTomar,
              child: const Text('Tomar este viaje'),
            ),
          ),
        ],
      ),
    );
  }
}

/// La hoja donde el conductor teclea el código que el pasajero le dicta.
///
/// Pensada para usarse de pie, en la puerta del bus, con una mano: campo
/// grande, teclado abierto solo, y el resultado en un color que se entiende
/// sin leer. El foco vuelve al campo tras cada validación porque lo normal
/// es que suban varios seguidos.
class _HojaAbordaje extends StatefulWidget {
  const _HojaAbordaje({required this.salidaId});

  final String salidaId;

  @override
  State<_HojaAbordaje> createState() => _HojaAbordajeState();
}

class _HojaAbordajeState extends State<_HojaAbordaje> {
  final _codigo = TextEditingController();
  final _foco = FocusNode();
  ResultadoAbordaje? _resultado;
  bool _validando = false;

  @override
  void dispose() {
    _codigo.dispose();
    _foco.dispose();
    super.dispose();
  }

  Future<void> _validar() async {
    final texto = _codigo.text.trim();
    if (texto.isEmpty || _validando) return;
    setState(() => _validando = true);
    final r = await validarTiquete(widget.salidaId, texto);
    if (!mounted) return;
    setState(() {
      _resultado = r;
      _validando = false;
    });
    if (r.ok) {
      // Se limpia solo cuando SÍ subió: si falló, el conductor quiere ver
      // lo que tecleó para comprobar si se equivocó de carácter.
      _codigo.clear();
    }
    _foco.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final r = _resultado;
    return envolverHoja(
      context,
      Padding(
        // El teclado se suma al margen: sin esto tapa el campo, que es el
        // mismo fallo ya corregido en pedidos y en la hoja de pedir viaje.
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 38, height: 4,
                  decoration: BoxDecoration(
                    color: context.textSecondaryColor.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Validar tiquete',
                style: TextStyle(
                  fontFamily: 'Inter', fontSize: 18, fontWeight: FontWeight.w800,
                  color: context.textPrimaryColor,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Pídele el código al pasajero y escríbelo.',
                style: TextStyle(
                  fontFamily: 'Inter', fontSize: 13, color: context.textSecondaryColor,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _codigo,
                focusNode: _foco,
                autofocus: true,
                textCapitalization: TextCapitalization.characters,
                // `text` y no `number`: el código lleva letras. Con el teclado
                // numérico habría que cambiar de capa para cada letra.
                keyboardType: TextInputType.text,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _validar(),
                style: const TextStyle(
                  fontFamily: 'Inter', fontSize: 26, fontWeight: FontWeight.w900,
                  letterSpacing: 6,
                ),
                decoration: const InputDecoration(
                  hintText: 'K7M3PQ',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _validando ? null : _validar,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kPooledColor,
                    foregroundColor: Colors.white,
                  ),
                  child: _validando
                      ? const SizedBox(
                          height: 20, width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Validar'),
                ),
              ),
              if (r != null) ...[
                const SizedBox(height: 14),
                _ResultadoTiquete(resultado: r),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// El veredicto, en un color que se entiende sin leer.
class _ResultadoTiquete extends StatelessWidget {
  const _ResultadoTiquete({required this.resultado});

  final ResultadoAbordaje resultado;

  @override
  Widget build(BuildContext context) {
    final ok = resultado.ok;
    final color = ok ? AppColors.success : AppColors.error;
    final hora = resultado.abordoEn?.toLocal();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
                  color: color, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  ok ? 'Puede subir' : (resultado.motivo ?? 'No puede subir'),
                  style: TextStyle(
                    fontFamily: 'Inter', fontSize: 15, fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
            ],
          ),
          if (ok) ...[
            const SizedBox(height: 8),
            Text(
              '${resultado.pasajero ?? 'Pasajero'} · '
              '${resultado.puestos ?? 1} puesto${(resultado.puestos ?? 1) == 1 ? '' : 's'}',
              style: TextStyle(
                fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
            if (resultado.aCobrar != null)
              Text(
                'Cóbrale ${CurrencyFormatter.format(resultado.aCobrar!)}',
                style: TextStyle(
                  fontFamily: 'Inter', fontSize: 14, color: context.textPrimaryColor,
                ),
              ),
            if (resultado.recogeEn != null && resultado.recogeEn!.isNotEmpty)
              Text(
                'Recoge en: ${resultado.recogeEn}',
                style: TextStyle(
                  fontFamily: 'Inter', fontSize: 13, color: context.textSecondaryColor,
                ),
              ),
          ],
          // La hora del primer abordaje es lo que resuelve el caso de alguien
          // que fotografió el tiquete de otro: no es una acusación, es un
          // dato con el que el conductor zanja la conversación.
          if (!ok && hora != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Se usó a las '
                '${hora.hour.toString().padLeft(2, '0')}:'
                '${hora.minute.toString().padLeft(2, '0')}.',
                style: TextStyle(
                  fontFamily: 'Inter', fontSize: 13, color: context.textSecondaryColor,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
