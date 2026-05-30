import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';

/// Tab de movilidad: selección de servicio y viajes en curso.
class TransportHomeScreen extends ConsumerWidget {
  const TransportHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(transportProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: CustomScrollView(
        slivers: [
          _HeroHeader(),
          if (!state.isLoading && state.active.isNotEmpty)
            _ActiveSection(active: state.active),
          _ServicesGrid(),
          if (!state.isLoading && state.past.isNotEmpty)
            _HistorySection(past: state.past.take(4).toList()),
          const SliverPadding(padding: EdgeInsets.only(bottom: 24)),
        ],
      ),
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

class _HeroHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SliverAppBar(
      expandedHeight: 148,
      pinned: true,
      backgroundColor: AppColors.secondary,
      foregroundColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        titlePadding: const EdgeInsets.only(left: 20, bottom: 14),
        title: const Text(
          'Movilidad',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 20,
          ),
        ),
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [AppColors.secondary, AppColors.secondaryDark],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 56),
          alignment: Alignment.bottomLeft,
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '¿A dónde vas hoy?',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Active rides ─────────────────────────────────────────────────────────────

class _ActiveSection extends StatelessWidget {
  const _ActiveSection({required this.active});

  final List<TransportRequestEntity> active;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionLabel(label: 'En curso', icon: Icons.directions_car_rounded),
          ...active.map((r) => _ActiveCard(request: r)),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _ActiveCard extends StatelessWidget {
  const _ActiveCard({required this.request});

  final TransportRequestEntity request;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () =>
            context.push(AppRoutes.transportTrackingPath(request.id)),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(_iconOf(request.serviceType),
                    color: color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          request.requestRef,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            request.status.label,
                            style: TextStyle(
                              fontSize: 10,
                              color: color,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      request.destinationAddress,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textTertiary, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Services grid ─────────────────────────────────────────────────────────────

class _ServicesGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionLabel(
              label: '¿Qué necesitas?',
              icon: Icons.touch_app_rounded,
            ),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.05,
              children: TransportServiceType.values
                  .map((t) => _ServiceCard(serviceType: t))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({required this.serviceType});

  final TransportServiceType serviceType;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(serviceType);
    final containerColor = _containerColorOf(serviceType);

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push(
        AppRoutes.transportBooking,
        extra: serviceType,
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: containerColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(_iconOf(serviceType), color: color, size: 24),
            ),
            const Spacer(),
            Text(
              serviceType.label,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              serviceType.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Desde ${CurrencyFormatter.format(serviceType.baseFare)}',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── History ───────────────────────────────────────────────────────────────────

class _HistorySection extends StatelessWidget {
  const _HistorySection({required this.past});

  final List<TransportRequestEntity> past;

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionLabel(
              label: 'Recientes',
              icon: Icons.history_rounded,
            ),
            const SizedBox(height: 8),
            ...past.map(
              (r) => _HistoryTile(
                request: r,
                onTap: () =>
                    context.push(AppRoutes.transportTrackingPath(r.id)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.request, required this.onTap});

  final TransportRequestEntity request;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = _colorOf(request.serviceType);
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          shape: BoxShape.circle,
        ),
        child:
            Icon(_iconOf(request.serviceType), color: color, size: 20),
      ),
      title: Text(
        '${request.serviceType.label} · ${request.requestRef}',
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        request.destinationAddress,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            CurrencyFormatter.format(request.estimatedFare),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 2),
          _StatusBadge(status: request.status),
        ],
      ),
      onTap: onTap,
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final TransportStatus status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      TransportStatus.completed => (AppColors.successContainer, AppColors.success),
      TransportStatus.cancelled => (AppColors.errorContainer, AppColors.error),
      _ => (AppColors.warningContainer, AppColors.warning),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status.label,
        style: TextStyle(fontSize: 9, color: fg, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.textSecondary,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

IconData _iconOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => Icons.local_taxi_rounded,
      TransportServiceType.moto => Icons.two_wheeler_rounded,
      TransportServiceType.particular => Icons.directions_car_rounded,
      TransportServiceType.envios => Icons.inventory_2_rounded,
    };

Color _colorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => AppColors.serviceTaxi,
      TransportServiceType.moto => AppColors.serviceMoto,
      TransportServiceType.particular => AppColors.serviceParticular,
      TransportServiceType.envios => AppColors.serviceEnvios,
    };

Color _containerColorOf(TransportServiceType t) => switch (t) {
      TransportServiceType.taxi => AppColors.serviceTaxiContainer,
      TransportServiceType.moto => AppColors.serviceMotoContainer,
      TransportServiceType.particular => AppColors.serviceParticularContainer,
      TransportServiceType.envios => AppColors.serviceEnviosContainer,
    };
