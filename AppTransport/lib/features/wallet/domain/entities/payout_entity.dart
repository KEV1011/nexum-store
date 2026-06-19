/// Saldo del conductor devuelto por GET /driver/payouts/balance.
class DriverBalance {
  const DriverBalance({
    required this.totalEarned,
    required this.totalPaidOut,
    required this.pending,
    required this.available,
    required this.minPayout,
    this.bankName,
    this.bankAccountType,
    this.bankAccountNumber,
  });

  factory DriverBalance.fromJson(Map<String, dynamic> j) {
    final bank = j['bank'] as Map<String, dynamic>?;
    return DriverBalance(
      totalEarned: (j['totalEarned'] as num?)?.toDouble() ?? 0,
      totalPaidOut: (j['totalPaidOut'] as num?)?.toDouble() ?? 0,
      pending: (j['pending'] as num?)?.toDouble() ?? 0,
      available: (j['available'] as num?)?.toDouble() ?? 0,
      minPayout: (j['minPayout'] as num?)?.toDouble() ?? 0,
      bankName: bank?['name'] as String?,
      bankAccountType: bank?['accountType'] as String?,
      bankAccountNumber: bank?['accountNumber'] as String?,
    );
  }

  final double totalEarned;
  final double totalPaidOut;
  final double pending;
  final double available;
  final double minPayout;
  final String? bankName;
  final String? bankAccountType;
  final String? bankAccountNumber;

  bool get hasBank => (bankAccountNumber ?? '').isNotEmpty;

  String? get bankSummary => hasBank
      ? [bankName, bankAccountType, bankAccountNumber]
          .whereType<String>()
          .where((e) => e.isNotEmpty)
          .join(' · ')
      : null;
}

/// Estado de un retiro.
enum PayoutStatus {
  requested,
  processing,
  paid,
  rejected;

  static PayoutStatus fromApi(String s) => switch (s) {
        'PROCESSING' => PayoutStatus.processing,
        'PAID' => PayoutStatus.paid,
        'REJECTED' => PayoutStatus.rejected,
        _ => PayoutStatus.requested,
      };

  String get label => switch (this) {
        PayoutStatus.requested => 'Solicitado',
        PayoutStatus.processing => 'En proceso',
        PayoutStatus.paid => 'Pagado',
        PayoutStatus.rejected => 'Rechazado',
      };

  bool get isPending =>
      this == PayoutStatus.requested || this == PayoutStatus.processing;
}

/// Un retiro del historial (GET /driver/payouts).
class PayoutItem {
  const PayoutItem({
    required this.id,
    required this.amount,
    required this.status,
    required this.requestedAt,
    this.method,
    this.accountInfo,
    this.reference,
    this.processedAt,
  });

  factory PayoutItem.fromJson(Map<String, dynamic> j) => PayoutItem(
        id: j['id'] as String,
        amount: (j['amount'] as num).toDouble(),
        status: PayoutStatus.fromApi(j['status'] as String? ?? 'REQUESTED'),
        method: j['method'] as String?,
        accountInfo: j['accountInfo'] as String?,
        reference: j['reference'] as String?,
        requestedAt:
            DateTime.tryParse(j['requestedAt'] as String? ?? '') ?? DateTime.now(),
        processedAt: j['processedAt'] != null
            ? DateTime.tryParse(j['processedAt'] as String)
            : null,
      );

  final String id;
  final double amount;
  final PayoutStatus status;
  final String? method;
  final String? accountInfo;
  final String? reference;
  final DateTime requestedAt;
  final DateTime? processedAt;
}
