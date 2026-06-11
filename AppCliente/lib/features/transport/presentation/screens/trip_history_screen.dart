import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/date_formatter.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final tripHistoryProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(apiClientProvider);
  final resp = await dio.get<Map<String, dynamic>>('/client/trips/history');
  final data = resp.data?['data'];
  if (data is List) {
    return data.whereType<Map<String, dynamic>>().toList();
  }
  return [];
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TripHistoryScreen extends ConsumerWidget {
  const TripHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final histAsync = ref.watch(tripHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Historial de viajes'),
        centerTitle: true,
      ),
      body: histAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              const Text('No se pudo cargar el historial'),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(tripHistoryProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (trips) {
          if (trips.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.directions_car_outlined, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    'Aún no has realizado viajes',
                    style: TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(tripHistoryProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: trips.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, i) => _TripCard(trip: trips[i]),
            ),
          );
        },
      ),
    );
  }
}

// ── Trip card ─────────────────────────────────────────────────────────────────

class _TripCard extends StatelessWidget {
  const _TripCard({required this.trip});

  final Map<String, dynamic> trip;

  @override
  Widget build(BuildContext context) {
    final status = (trip['status'] as String? ?? '').toUpperCase();
    final driver = trip['driver'] as Map<String, dynamic>?;
    final vehicle = trip['vehicle'] as Map<String, dynamic>?;
    final fare = trip['fare'] as num?;
    final createdAt = trip['createdAt'] as String?;

    final statusColor = switch (status) {
      'COMPLETED' => Colors.green,
      'CANCELLED' => Colors.red,
      _ => Colors.orange,
    };
    final statusLabel = switch (status) {
      'COMPLETED' => 'Completado',
      'CANCELLED' => 'Cancelado',
      _ => status,
    };

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    createdAt != null
                        ? DateFormatter.formatDate(DateTime.tryParse(createdAt) ?? DateTime.now())
                        : '—',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _RouteRow(
              origin: trip['originAddress'] as String? ?? 'Origen',
              destination: trip['destinationAddress'] as String? ?? 'Destino',
            ),
            if (driver != null) ...[
              const Divider(height: 20),
              Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.grey[200],
                    backgroundImage: driver['avatarUrl'] != null
                        ? NetworkImage(driver['avatarUrl'] as String)
                        : null,
                    child: driver['avatarUrl'] == null
                        ? const Icon(Icons.person, size: 18, color: Colors.grey)
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          driver['name'] as String? ?? 'Conductor',
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                        if (vehicle != null)
                          Text(
                            '${vehicle['brand'] ?? ''} ${vehicle['model'] ?? ''} • ${vehicle['plate'] ?? ''}'.trim(),
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey),
                          ),
                      ],
                    ),
                  ),
                  if (fare != null)
                    Text(
                      CurrencyFormatter.format(fare.toDouble()),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.origin, required this.destination});

  final String origin;
  final String destination;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            const Icon(Icons.radio_button_checked, size: 14, color: Colors.green),
            Container(width: 2, height: 20, color: Colors.grey[300]),
            const Icon(Icons.location_on, size: 14, color: Colors.red),
          ],
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(origin, maxLines: 1, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 12),
              Text(destination, maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ],
    );
  }
}
