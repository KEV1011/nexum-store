import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/presentation/providers/active_trip_provider.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/going_to_passenger_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/trip_in_progress_card.dart';
import 'package:nexum_driver/features/active_trip/presentation/widgets/waiting_passenger_card.dart';
import 'package:nexum_driver/features/driver_status/presentation/providers/driver_status_provider.dart';

/// Pantalla principal de viaje activo.
///
/// Muestra el mapa con la ruta como polilínea y la tarjeta de acción inferior
/// que cambia según el estado del viaje (toPickup / waiting / inProgress).
///
/// Recibe el [ActiveTripEntity] desde [activeTripProvider] y reacciona a cambios
/// en tiempo real.
class ActiveTripScreen extends ConsumerStatefulWidget {
  const ActiveTripScreen({this.tripExtra, super.key});

  /// Datos del viaje pasados como `extra` desde el router (legacy compat).
  final Object? tripExtra;

  @override
  ConsumerState<ActiveTripScreen> createState() => _ActiveTripScreenState();
}

class _ActiveTripScreenState extends ConsumerState<ActiveTripScreen> {
  GoogleMapController? _mapController;
  bool _isLoading = false;

  // Posición del conductor (mock: centro de Pamplona — Parque Águeda Gallardo)
  static const LatLng _driverPosition = LatLng(
    MapConstants.pamplonaCenterLat,
    MapConstants.pamplonaCenterLng,
  );

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final trip = ref.watch(activeTripProvider);

    // Cuando no hay viaje activo (cancelado o finalizado), volver al home.
    if (trip == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/home');
      });
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.primary)),
      );
    }

    return PopScope(
      canPop: !trip.isInProgress,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && trip.isInProgress) {
          _showCannotLeaveDialog();
        }
      },
      child: Scaffold(
        body: Stack(
          children: [
            // ── Map ─────────────────────────────────────────────────────
            _buildMap(trip),

            // ── AppBar overlay ───────────────────────────────────────────
            _buildTopBar(trip),

            // ── Loading overlay ──────────────────────────────────────────
            if (_isLoading)
              Container(
                color: AppColors.overlay,
                child: const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              ),
          ],
        ),

        // ── Bottom card ──────────────────────────────────────────────────
        bottomSheet: _buildBottomCard(trip),
      ),
    );
  }

  // ── Map ──────────────────────────────────────────────────────────────────────

  Widget _buildMap(ActiveTripEntity trip) {
    final originLatLng = trip.request.origin.latLng;
    final destinationLatLng = trip.request.destination.latLng;

    // Durante toPickup/waiting: driver → origin; durante inProgress: origin → destination
    final polylinePoints = trip.isInProgress
        ? [originLatLng, destinationLatLng]
        : [_driverPosition, originLatLng];

    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: trip.isInProgress ? originLatLng : _driverPosition,
        zoom: MapConstants.tripZoom,
      ),
      onMapCreated: (controller) {
        _mapController = controller;
        _fitBoundsToRoute(polylinePoints);
      },
      markers: _buildMarkers(trip),
      polylines: {
        Polyline(
          polylineId: const PolylineId('active_route'),
          points: polylinePoints,
          color: AppColors.routeColor,
          width: 5,
          // Dashed line while going to pickup to differentiate from trip route
          patterns: trip.isToPickup
              ? [PatternItem.dash(20), PatternItem.gap(10)]
              : [],
        ),
      },
      myLocationEnabled: true,
      myLocationButtonEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      compassEnabled: true,
    );
  }

  Set<Marker> _buildMarkers(ActiveTripEntity trip) {
    return {
      Marker(
        markerId: const MarkerId('origin'),
        position: trip.request.origin.latLng,
        infoWindow: InfoWindow(
          title: 'Punto de recogida',
          snippet: trip.request.origin.address,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
      ),
      Marker(
        markerId: const MarkerId('destination'),
        position: trip.request.destination.latLng,
        infoWindow: InfoWindow(
          title: 'Destino',
          snippet: trip.request.destination.address,
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
      ),
    };
  }

  void _fitBoundsToRoute(List<LatLng> points) {
    if (points.length < 2 || _mapController == null) return;

    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }

    _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        ),
        80.0,
      ),
    );
  }

  // ── Top bar overlay ──────────────────────────────────────────────────────────

  Widget _buildTopBar(ActiveTripEntity trip) {
    final label = switch (trip.state) {
      ActiveTripState.toPickup =>
        'Yendo al pasajero · ${trip.request.etaToPickupMinutes} min',
      ActiveTripState.waiting => 'Esperando al pasajero',
      ActiveTripState.inProgress =>
        'En camino al destino · ${trip.request.durationMinutes} min est.',
    };

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingS,
          ),
          child: Row(
            children: [
              // Back / cancel button
              Material(
                color: Colors.white,
                elevation: 4,
                shape: const CircleBorder(),
                child: InkWell(
                  onTap: trip.isInProgress
                      ? _showCannotLeaveDialog
                      : () => _confirmGoBack(),
                  customBorder: const CircleBorder(),
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(Icons.arrow_back_rounded, size: 24),
                  ),
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),

              // State label
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingM,
                    vertical: AppConstants.spacingS,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusCircular),
                    boxShadow: const [
                      BoxShadow(color: AppColors.shadow, blurRadius: 8),
                    ],
                  ),
                  child: Text(
                    label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Bottom card ──────────────────────────────────────────────────────────────

  Widget _buildBottomCard(ActiveTripEntity trip) {
    return switch (trip.state) {
      ActiveTripState.toPickup => GoingToPassengerCard(
          trip: trip,
          onArrived: _isLoading ? null : _handleArrived,
          onCancelled: () => _handleCancelled(),
        ),
      ActiveTripState.waiting => WaitingPassengerCard(
          trip: trip,
          onStartTrip: _isLoading ? null : _handleStartTrip,
        ),
      ActiveTripState.inProgress => TripInProgressCard(
          trip: trip,
          onFinishTrip: _isLoading ? null : _handleFinishTrip,
        ),
    };
  }

  // ── Action handlers ──────────────────────────────────────────────────────────

  Future<void> _handleArrived() async {
    setState(() => _isLoading = true);
    try {
      await ref.read(activeTripProvider.notifier).arrivedAtPassenger();
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al actualizar estado');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleStartTrip() async {
    setState(() => _isLoading = true);
    try {
      await ref.read(activeTripProvider.notifier).startTrip();

      // Re-fit map to show origin → destination once trip starts
      final trip = ref.read(activeTripProvider);
      if (trip != null && mounted) {
        _fitBoundsToRoute([
          trip.request.origin.latLng,
          trip.request.destination.latLng,
        ]);
      }
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al iniciar el viaje');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleFinishTrip() async {
    setState(() => _isLoading = true);
    try {
      final tripModel =
          await ref.read(activeTripProvider.notifier).finishTrip();

      // Register earnings in driver status
      await ref
          .read(driverStatusProvider.notifier)
          .updateEarnings(tripModel.netEarning);

      if (mounted) {
        context.go('/trip-summary', extra: tripModel);
      }
    } catch (_) {
      if (mounted) {
        AppSnackbar.showError(context, 'Error al finalizar el viaje');
        setState(() => _isLoading = false);
      }
    }
  }

  void _handleCancelled() {
    // Reset the active trip state and go back to home
    ref.read(activeTripProvider.notifier).state = null;
    if (mounted) context.go('/home');
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────────

  Future<void> _showCannotLeaveDialog() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Viaje en curso'),
        content: const Text(
          'No puedes salir mientras el viaje está en progreso. '
          'Finaliza el viaje primero.',
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            child: const Text('Entendido'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmGoBack() async {
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Salir del viaje?'),
        content: const Text('Si sales ahora el viaje será cancelado.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Quedarse'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Salir'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      _handleCancelled();
    }
  }
}
