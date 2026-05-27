import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/trip_requests/data/datasources/trip_requests_datasource.dart';
import 'package:nexum_driver/features/trip_requests/data/repositories/trip_requests_repository_impl.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/usecases/accept_trip_usecase.dart';
import 'package:nexum_driver/features/trip_requests/domain/usecases/reject_trip_usecase.dart';

// ── TripRequestState ──────────────────────────────────────────────────────────

/// Estado sellado del flujo de solicitudes de viaje.
sealed class TripRequestState {
  const TripRequestState();
}

/// Sin solicitudes pendientes. Estado de reposo.
final class TripRequestIdle extends TripRequestState {
  const TripRequestIdle();
}

/// Solicitud activa con cuenta regresiva. El conductor tiene
/// [secondsRemaining] segundos para aceptar o rechazar.
final class TripRequestIncoming extends TripRequestState {
  const TripRequestIncoming({
    required this.request,
    required this.secondsRemaining,
  });

  final TripRequestEntity request;
  final int secondsRemaining;

  TripRequestIncoming copyWithSeconds(int seconds) {
    return TripRequestIncoming(
      request: request,
      secondsRemaining: seconds,
    );
  }
}

/// El conductor aceptó la solicitud. La UI debe navegar al viaje activo.
final class TripRequestAccepted extends TripRequestState {
  const TripRequestAccepted({required this.request});

  final TripRequestEntity request;
}

/// El conductor rechazó la solicitud o el tiempo expiró.
final class TripRequestRejected extends TripRequestState {
  const TripRequestRejected();
}

// ── Infrastructure providers ──────────────────────────────────────────────────

final _tripRequestsDataSourceProvider =
    Provider<TripRequestsDataSource>((ref) {
  return TripRequestsDataSource();
});

final _tripRequestsRepositoryProvider =
    Provider<TripRequestsRepositoryImpl>((ref) {
  return TripRequestsRepositoryImpl(
    dataSource: ref.watch(_tripRequestsDataSourceProvider),
  );
});

final _acceptTripUseCaseProvider = Provider<AcceptTripUseCase>((ref) {
  return AcceptTripUseCase(
      repository: ref.watch(_tripRequestsRepositoryProvider));
});

final _rejectTripUseCaseProvider = Provider<RejectTripUseCase>((ref) {
  return RejectTripUseCase(
      repository: ref.watch(_tripRequestsRepositoryProvider));
});

// ── TripRequestNotifier ───────────────────────────────────────────────────────

/// Notifier que gestiona el ciclo de vida de una solicitud de viaje entrante.
///
/// Flujo de estados:
///   Idle → Incoming (15s countdown) → Accepted | Rejected → Idle
///
/// El countdown decrementa cada segundo. Al llegar a 0 auto-rechaza
/// la solicitud (expirada).
class TripRequestNotifier extends StateNotifier<TripRequestState> {
  TripRequestNotifier({
    required AcceptTripUseCase acceptTripUseCase,
    required RejectTripUseCase rejectTripUseCase,
  })  : _acceptTripUseCase = acceptTripUseCase,
        _rejectTripUseCase = rejectTripUseCase,
        super(const TripRequestIdle());

  final AcceptTripUseCase _acceptTripUseCase;
  final RejectTripUseCase _rejectTripUseCase;

  Timer? _countdownTimer;

  // ── incomingRequest ───────────────────────────────────────────────────────

  /// Registra una nueva solicitud entrante y arranca el countdown de 15s.
  ///
  /// Si ya había una solicitud activa, la cancela antes de mostrar la nueva.
  void incomingRequest(TripRequestEntity request) {
    _cancelTimer();
    state = TripRequestIncoming(
      request: request,
      secondsRemaining: AppConstants.tripRequestTimeoutSeconds,
    );
    _startCountdown(request);
  }

  // ── acceptTrip ────────────────────────────────────────────────────────────

  /// El conductor acepta la solicitud.
  ///
  /// Cancela el countdown, llama al use case y transiciona a [TripRequestAccepted].
  Future<void> acceptTrip(TripRequestEntity request) async {
    _cancelTimer();
    try {
      final accepted = await _acceptTripUseCase(request);
      state = TripRequestAccepted(request: accepted);
    } catch (_) {
      // Si falla la aceptación, volver a Idle para no bloquear al conductor.
      state = const TripRequestIdle();
    }
  }

  // ── rejectTrip ────────────────────────────────────────────────────────────

  /// El conductor rechaza manualmente la solicitud.
  ///
  /// Cancela el countdown y transiciona a [TripRequestRejected].
  Future<void> rejectTrip(TripRequestEntity request) async {
    _cancelTimer();
    try {
      await _rejectTripUseCase(request);
    } catch (_) {
      // Ignorar errores en rechazo; el estado cambia de todos modos.
    }
    state = const TripRequestRejected();
  }

  // ── resetToIdle ───────────────────────────────────────────────────────────

  /// Reinicia el estado a [TripRequestIdle].
  ///
  /// Llamar después de [TripRequestAccepted] o [TripRequestRejected]
  /// una vez que la UI haya reaccionado al cambio.
  void resetToIdle() {
    _cancelTimer();
    state = const TripRequestIdle();
  }

  // ── Countdown logic ───────────────────────────────────────────────────────

  void _startCountdown(TripRequestEntity request) {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final current = state;
      if (current is! TripRequestIncoming) {
        timer.cancel();
        return;
      }

      final newSeconds = current.secondsRemaining - 1;

      if (newSeconds <= 0) {
        timer.cancel();
        // Tiempo expirado: auto-rechaza la solicitud
        _expireRequest(request);
        return;
      }

      state = current.copyWithSeconds(newSeconds);
    });
  }

  void _expireRequest(TripRequestEntity request) {
    // ignore: avoid_print
    print('[TripRequestNotifier] Solicitud ${request.id} expirada.');
    _rejectTripUseCase(request).ignore();
    state = const TripRequestRejected();
  }

  void _cancelTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
  }

  @override
  void dispose() {
    _cancelTimer();
    super.dispose();
  }
}

// ── Public providers ──────────────────────────────────────────────────────────

/// Proveedor principal del estado de solicitudes de viaje.
///
/// Úsalo con `ref.watch(tripRequestProvider)` para reaccionar a solicitudes
/// entrantes y `ref.read(tripRequestProvider.notifier)` para aceptar/rechazar.
final tripRequestProvider =
    StateNotifierProvider<TripRequestNotifier, TripRequestState>((ref) {
  return TripRequestNotifier(
    acceptTripUseCase: ref.watch(_acceptTripUseCaseProvider),
    rejectTripUseCase: ref.watch(_rejectTripUseCaseProvider),
  );
});
