import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'favorites_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_comercio.dart';
import 'package:nexum_client/features/shell/presentation/providers/'
    'shell_provider.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';

/// Los comercios marcados como favoritos.
///
/// Existía el guardado —`favoritesProvider`, con su persistencia— y no había
/// ninguna pantalla que lo mostrara: se podía marcar un corazón y no había
/// dónde ver la lista. Ahora es una pestaña.
///
/// Los favoritos son ids en el teléfono, así que la lista se arma cruzándolos
/// con los comercios del servidor. Si uno deja de existir, simplemente no
/// aparece: no se pinta una fila fantasma con un nombre guardado que ya no
/// corresponde a nada.
class FavoritosScreen extends ConsumerWidget {
  const FavoritosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favoritos = ref.watch(favoritesProvider);
    final comerciosAsync = ref.watch(businessesProvider);

    return Scaffold(
      backgroundColor: context.zFondo,
      appBar: AppBar(
        backgroundColor: context.zFondo,
        foregroundColor: context.zTexto,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: const Text('Favoritos'),
      ),
      body: SafeArea(
        top: false,
        child: comerciosAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: EsqueletoFilas(cuantas: 3),
          ),
          error: (_, __) => BannerSinConexion(
            onReintentar: () => ref.invalidate(businessesProvider),
          ),
          data: (todos) {
            final mios = todos.where((b) => favoritos.contains(b.id)).toList();
            if (mios.isEmpty) {
              return EstadoZipa(
                icono: ZipaIconName.favoritos,
                titulo: 'Todavía no tienes favoritos',
                mensaje: 'Toca el corazón de un comercio y lo tendrás aquí, a '
                    'un golpe de vista.',
                accion: 'Ver comercios',
                onAccion: () =>
                    ref.read(shellTabProvider.notifier).state = kTabInicio,
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              itemCount: mios.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) => FilaComercio(
                comercio: mios[i],
                onTap: () => context.push(
                  AppRoutes.businessPath(mios[i].id),
                  extra: mios[i],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
