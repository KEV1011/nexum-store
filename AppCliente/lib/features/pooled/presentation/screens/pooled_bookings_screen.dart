import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_client/features/pooled/presentation/providers/pooled_provider.dart';
import 'package:nexum_client/features/pooled/presentation/widgets/datos_empresa.dart';

const _kPooledColor = Color(0xFF1E3A8A);

class PooledBookingsScreen extends ConsumerStatefulWidget {
  const PooledBookingsScreen({super.key});

  @override
  ConsumerState<PooledBookingsScreen> createState() =>
      _PooledBookingsScreenState();
}

class _PooledBookingsScreenState extends ConsumerState<PooledBookingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(pooledProvider.notifier).loadMyBookings(),
    );
  }

  /// Antes marcaba `tel:` con el teléfono que manda el backend, que viene
  /// ENMASCARADO (`+57 •••• ••• 34`): el marcador se abría con un número que
  /// no existe. El mismo barrido ya se hizo en intermunicipal y mandados; esta
  /// pantalla se quedó fuera.
  void _contactoProtegido(String referencia) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.lock_outline_rounded,
                    color: _kPooledColor, size: 22),
                SizedBox(width: 10),
                Text('Contacto protegido',
                    style:
                        TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Por tu seguridad y la del conductor, el número real se mantiene '
              'privado. Si necesitas coordinar la recogida, escríbenos desde '
              'Ayuda y soporte y te ponemos en contacto.',
              style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
            ),
            if (referencia.isNotEmpty) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(Icons.phone_outlined,
                      size: 18, color: context.textTertiaryColor),
                  const SizedBox(width: 8),
                  Text('Referencia: $referencia',
                      style: TextStyle(
                          fontSize: 13, color: context.textTertiaryColor)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _cancel(PooledTripEntity trip) async {
    final booking = trip.myBooking;
    if (booking == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cancelar reserva?'),
        content: Text(
          'Vas a liberar ${booking.seatLabel} en el viaje '
          '${trip.origin.displayName} → ${trip.destination.displayName}.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('No')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Sí, cancelar'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final err = await ref.read(pooledProvider.notifier).cancelBooking(booking.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Reserva cancelada'),
        backgroundColor: err == null ? AppColors.success : AppColors.error,
      ),
    );
  }

  /// Califica la salida: las estrellas son para la empresa que la prestó.
  ///
  /// Si el servidor dice que todavía no —el bus sigue rodando— se enseña SU
  /// motivo en vez de un «no se pudo» que obligaría a adivinar.
  Future<void> _calificar(PooledTripEntity trip) async {
    final booking = trip.myBooking;
    if (booking == null) return;
    final resultado = await showModalBottomSheet<(int, String)>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _HojaCalificar(
        empresa: trip.operatorName,
        inicial: booking.rating,
      ),
    );
    if (resultado == null || !mounted) return;
    final err = await ref
        .read(pooledProvider.notifier)
        .calificarSalida(booking.id, resultado.$1, comentario: resultado.$2);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(err ?? 'Gracias, tu calificación quedó registrada'),
        backgroundColor: err == null ? AppColors.success : AppColors.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(pooledProvider);
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kPooledColor,
        foregroundColor: Colors.white,
        title: const Text('Mis reservas'),
      ),
      body: state.isLoadingBookings
          ? const Center(child: CircularProgressIndicator(color: _kPooledColor))
          : state.myBookings.isEmpty
              ? _empty(state.bookingsError)
              : RefreshIndicator(
                  color: _kPooledColor,
                  onRefresh: () =>
                      ref.read(pooledProvider.notifier).loadMyBookings(),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: state.myBookings.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _BookingCard(
                      trip: state.myBookings[i],
                      onCall: () =>
                          _contactoProtegido(state.myBookings[i].driverPhone),
                      onCancel: () => _cancel(state.myBookings[i]),
                      onCalificar: () => _calificar(state.myBookings[i]),
                    ),
                  ),
                ),
    );
  }

  /// Con `fallo` no se dice «no tienes reservas»: la lista está vacía porque
  /// no se pudo preguntar, y a quien sí compró un puesto decirle que no tiene
  /// ninguno es la peor respuesta posible. Se ofrece reintentar.
  Widget _empty(String? fallo) => ListView(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        children: [
          const SizedBox(height: 100),
          Icon(
            fallo != null
                ? Icons.cloud_off_rounded
                : Icons.confirmation_number_outlined,
            size: 64,
            color: context.textSecondaryColor,
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              fallo ?? 'Aún no tienes reservas de viajes compartidos.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.textSecondaryColor),
            ),
          ),
          if (fallo != null) ...[
            const SizedBox(height: 16),
            Center(
              child: OutlinedButton.icon(
                onPressed: () =>
                    ref.read(pooledProvider.notifier).loadMyBookings(),
                icon: const Icon(Icons.refresh_rounded, size: 18),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _kPooledColor,
                  side: const BorderSide(color: _kPooledColor),
                ),
                label: const Text('Reintentar'),
              ),
            ),
          ],
        ],
      );
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({
    required this.trip,
    required this.onCall,
    required this.onCancel,
    required this.onCalificar,
  });

  final PooledTripEntity trip;
  final VoidCallback onCall;
  final VoidCallback onCancel;
  final VoidCallback onCalificar;

  @override
  Widget build(BuildContext context) {
    final booking = trip.myBooking;
    final t = trip.departureTime;
    final timeLabel =
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final seats = booking?.seatsBooked ?? 1;
    final canCancel = trip.status == PooledTripStatus.open ||
        trip.status == PooledTripStatus.full;
    // Se ofrece calificar cuando el viaje ya pasó o va en camino. La regla
    // exacta —si ya debería haber llegado según la duración de la ruta— la
    // decide el SERVIDOR, y si dice que todavía no, se enseña su motivo. Dos
    // copias de esa regla acabarían discrepando.
    final puedeCalificar = booking != null &&
        booking.status == 'confirmed' &&
        (trip.status == PooledTripStatus.completed ||
            trip.status == PooledTripStatus.departed);

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
                child: Text(
                  '${trip.origin.displayName} → ${trip.destination.displayName}',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800),
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
          _row(context, Icons.schedule_rounded,
              '$timeLabel · ${t.day}/${t.month}/${t.year}'),
          // La silla va PRIMERO y destacada: es el dato que se busca con el
          // bus delante, y decir «2 puestos» a quien eligió ventana obliga a
          // preguntárselo al conductor.
          _row(
            context,
            Icons.event_seat_rounded,
            '${booking?.seatLabel ?? '$seats puesto${seats == 1 ? '' : 's'}'}'
            ' · ${CurrencyFormatter.format(trip.farePerSeat * seats)}',
            destacado: booking != null && booking.seats.isNotEmpty,
          ),
          _row(context, Icons.directions_car_rounded,
              '${trip.driverName} · ${trip.vehicleDescription}'),
          if (trip.operatorName != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: [
                  const Icon(Icons.verified_rounded,
                      size: 15, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      trip.operatorName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
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
            ),
          if (booking?.pickupAddress != null && booking!.pickupAddress!.isNotEmpty)
            _row(context, Icons.my_location_rounded, booking.pickupAddress!),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onCall,
                  icon: const Icon(Icons.shield_outlined, size: 18),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _kPooledColor,
                    side: const BorderSide(color: _kPooledColor),
                  ),
                  label: const Text('Contacto'),
                ),
              ),
              if (canCancel) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onCancel,
                    icon: const Icon(Icons.close_rounded, size: 18),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                    ),
                    label: const Text('Cancelar'),
                  ),
                ),
              ],
            ],
          ),
          // Se piden aquí y no solo al comprar: las condiciones se releen
          // cuando hay que cancelar o cuando aparece la maleta de más.
          if (trip.operatorName != null && trip.operatorPolicies.isNotEmpty) ...[
            const SizedBox(height: 12),
            CondicionesTiquete(lineas: trip.operatorPolicies),
          ],
          if (puedeCalificar) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 10),
            if (booking.rating != null)
              Row(
                children: [
                  for (var i = 1; i <= 5; i++)
                    Icon(
                      i <= booking.rating! ? Icons.star_rounded : Icons.star_border_rounded,
                      size: 20,
                      color: AppColors.starText,
                    ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Gracias por calificar',
                      style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
                    ),
                  ),
                  TextButton(
                    onPressed: onCalificar,
                    child: const Text('Cambiar'),
                  ),
                ],
              )
            else
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onCalificar,
                  icon: const Icon(Icons.star_rounded, size: 18),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _kPooledColor,
                    side: const BorderSide(color: _kPooledColor),
                  ),
                  label: Text(
                    trip.operatorName != null
                        ? 'Calificar a ${trip.operatorName}'
                        : 'Calificar el viaje',
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _row(
    BuildContext context,
    IconData icon,
    String text, {
    bool destacado = false,
  }) =>
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(icon,
                size: 15,
                color: destacado ? _kPooledColor : context.textSecondaryColor),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: destacado ? 14 : 13,
                  fontWeight: destacado ? FontWeight.w800 : FontWeight.normal,
                  color:
                      destacado ? _kPooledColor : context.textSecondaryColor,
                ),
              ),
            ),
          ],
        ),
      );
}


/// Las estrellas y, si quiere, por qué.
///
/// El comentario es opcional a propósito: obligarlo hace que la gente escriba
/// «bien» para poder cerrar, y eso no le sirve a nadie. Sale con la nota ya
/// puesta cuando viene a corregirla.
class _HojaCalificar extends StatefulWidget {
  const _HojaCalificar({this.empresa, this.inicial});

  final String? empresa;
  final int? inicial;

  @override
  State<_HojaCalificar> createState() => _HojaCalificarState();
}

class _HojaCalificarState extends State<_HojaCalificar> {
  late int _estrellas = widget.inicial ?? 0;
  final _comentario = TextEditingController();

  @override
  void dispose() {
    _comentario.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 28,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.empresa == null
                ? '¿Qué tal estuvo el viaje?'
                : '¿Qué tal viajaste con ${widget.empresa}?',
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            'Tu calificación ayuda a los demás pasajeros a elegir.',
            style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  onPressed: () => setState(() => _estrellas = i),
                  icon: Icon(
                    i <= _estrellas ? Icons.star_rounded : Icons.star_border_rounded,
                    size: 38,
                    color: AppColors.starText,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _comentario,
            maxLength: 300,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Cuéntanos (opcional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _estrellas == 0
                  ? null
                  : () => Navigator.pop(context, (_estrellas, _comentario.text)),
              style: FilledButton.styleFrom(backgroundColor: _kPooledColor),
              child: const Text('Enviar'),
            ),
          ),
        ],
      ),
    );
  }
}
