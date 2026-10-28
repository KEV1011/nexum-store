/// «Pedidos en el local»: lo que el cliente pidió en mesas o para llevar
/// desde la app con su sesión. Sin sesión la lista sale vacía, y se dice.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/features/mesa/data/mesa_api.dart';
import 'package:nexum_client/features/mesa/domain/pedido_mesa.dart';
import 'package:nexum_client/features/mesa/presentation/mesa_providers.dart';

final _misPedidosMesaProvider = FutureProvider.autoDispose<List<PedidoMesa>>(
  (ref) => ref.watch(mesaApiProvider).misPedidos(),
);

class MisPedidosMesaScreen extends ConsumerWidget {
  const MisPedidosMesaScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidos = ref.watch(_misPedidosMesaProvider);
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Volver',
          onPressed: () => safeBack(context),
        ),
        title: const Text('Pedidos en el local'),
      ),
      body: pedidos.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(mensajeDe(e, 'No pudimos cargar tus pedidos.')),
              const SizedBox(height: AppConstants.spacingM),
              OutlinedButton(
                onPressed: () => ref.invalidate(_misPedidosMesaProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (lista) => lista.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppConstants.spacingL),
                  child: Text(
                    'Aquí salen los pedidos que hagas sentado en un local, escaneando '
                    'el QR de la mesa.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: context.textSecondaryColor),
                  ),
                ),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(_misPedidosMesaProvider.future),
                child: ListView.separated(
                  padding: const EdgeInsets.all(AppConstants.spacingM),
                  itemCount: lista.length,
                  separatorBuilder: (_, __) => const Divider(),
                  itemBuilder: (context, i) {
                    final p = lista[i];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(p.negocio, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                        '${p.paraLlevar ? 'Para llevar' : 'Mesa ${p.mesa}'} · ${p.estadoTexto}',
                      ),
                      trailing: Text(CurrencyFormatter.format(p.total)),
                      onTap: p.codigo == null
                          ? null
                          : () => context.push(AppRoutes.mesaPedidoPath(p.codigo!, p.id)),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
