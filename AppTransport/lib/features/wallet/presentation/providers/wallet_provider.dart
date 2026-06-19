import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/wallet/domain/entities/payout_entity.dart';

class WalletState {
  const WalletState({
    this.balance,
    this.payouts = const [],
    this.isLoading = true,
    this.error,
  });

  final DriverBalance? balance;
  final List<PayoutItem> payouts;
  final bool isLoading;
  final String? error;

  WalletState copyWith({
    DriverBalance? balance,
    List<PayoutItem>? payouts,
    bool? isLoading,
    String? error,
  }) =>
      WalletState(
        balance: balance ?? this.balance,
        payouts: payouts ?? this.payouts,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class WalletNotifier extends StateNotifier<WalletState> {
  WalletNotifier(this._client) : super(const WalletState()) {
    load();
  }

  final DioClient _client;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final results = await Future.wait([
        _client.get<Map<String, dynamic>>('/driver/payouts/balance'),
        _client.get<Map<String, dynamic>>('/driver/payouts'),
      ]);
      final balanceData = results[0].data?['data'] as Map<String, dynamic>?;
      final payoutsData = results[1].data?['data'] as List<dynamic>?;
      state = WalletState(
        balance:
            balanceData != null ? DriverBalance.fromJson(balanceData) : null,
        payouts: (payoutsData ?? [])
            .map((e) => PayoutItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        error: 'No se pudo cargar tu billetera.',
      );
    }
  }

  /// Solicita un retiro. Devuelve `null` en éxito o el mensaje de error.
  Future<String?> requestPayout(double amount, {String? method}) async {
    try {
      await _client.post<Map<String, dynamic>>(
        '/driver/payouts',
        data: {'amount': amount, if (method != null) 'method': method},
      );
      await load();
      return null;
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['error'] as String?;
      return msg ?? 'No se pudo solicitar el retiro.';
    } catch (_) {
      return 'No se pudo solicitar el retiro.';
    }
  }
}

final walletProvider = StateNotifierProvider<WalletNotifier, WalletState>(
  (ref) => WalletNotifier(DioClient()),
);
