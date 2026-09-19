import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'carrusel_destacados.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_comercio.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'sello_confianza.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'tarjeta_servicio.dart';
import 'package:nexum_client/features/errands/presentation/widgets/'
    'fila_categorias_mandado.dart';
import 'package:nexum_client/features/errands/presentation/widgets/'
    'hoja_envios.dart';
import 'package:nexum_client/features/shell/presentation/providers/'
    'shell_provider.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';

// ── La home ──────────────────────────────────────────────────────────────────
//
// Orden, de arriba abajo: dónde entregar · buscar · qué quieres hacer · qué te
// traemos · por qué confiar · qué hay cerca. Es el orden de las preguntas que
// se hace quien abre la app, y antes no era ninguno.
//
// LO QUE SE FUE, Y POR QUÉ:
//
// · El carrusel de promociones. No era solo un carrusel con puntos que se mueve
//   solo: prometía «Domicilio gratis en tus primeros 3 pedidos del mes», una
//   promoción que NO EXISTE. Es la segunda de esta clase que se retira (antes
//   fue el «ZIPA Fest · Domicilios desde $0»). Cuando haya promociones de
//   verdad saldrán de `promoDeTienda`, que ya es la fuente del banner y de la
//   caja — y por eso lo que se anuncia es lo que se cobra.
//
// · La fila de chips de categoría. Cuatro categorías (restaurante, super,
//   farmacia, otro) no necesitan un filtro propio ocupando una franja de la
//   pantalla: con dos docenas de comercios se ven todos de un vistazo, y el
//   buscador cubre el caso de ir a por algo concreto. El filtro sigue vivo,
//   pero se activa desde la tarjeta de Restaurantes y se quita con un toque.
//
// · Las dos tarjetas de servicio con degradado a sangre. Competían con el
//   verde de marca y dejaban fuera Envíos e Intermunicipal, que estaban más
//   abajo o en ninguna parte.

/// Pestaña principal: qué puedo hacer y qué hay cerca de mí.
class BusinessesScreen extends ConsumerStatefulWidget {
  const BusinessesScreen({super.key});

  @override
  ConsumerState<BusinessesScreen> createState() => _BusinessesScreenState();
}

class _BusinessesScreenState extends ConsumerState<BusinessesScreen> {
  BusinessCategory? _filtro;
  String _busqueda = '';

  @override
  Widget build(BuildContext context) {
    final comerciosAsync = ref.watch(businessesProvider);
    final direccion = ref.watch(defaultAddressProvider);

    return Scaffold(
      backgroundColor: context.zFondo,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: ZipaTokens.marca,
          onRefresh: () async => ref.refresh(businessesProvider.future),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: _BarraDireccion(
                  direccion: direccion?.fullAddress,
                  onTap: () => context.push(AppRoutes.addresses),
                  // La campana lleva a Pedidos. No hay pantalla de
                  // notificaciones y no se va a fingir una: un icono que abre
                  // una lista vacía «de avisos» es peor que llevar a donde
                  // está lo que la persona quiere mirar.
                  onCampana: () =>
                      ref.read(shellTabProvider.notifier).state = kTabPedidos,
                ),
              ),
              SliverToBoxAdapter(
                child: _Buscador(
                  onChanged: (v) => setState(() => _busqueda = v),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 18)),
              SliverToBoxAdapter(child: _RejillaServicios(onFiltrarRestaurantes: () {
                setState(() => _filtro = BusinessCategory.restaurant);
              })),
              const SliverToBoxAdapter(child: SizedBox(height: 22)),
              // Va ARRIBA del sello y de los comercios porque es la oferta que
              // nadie descubría: estaba a cinco toques dentro de dos hojas.
              const SliverToBoxAdapter(child: FilaCategoriasMandado()),
              const SliverToBoxAdapter(child: SizedBox(height: 20)),
              const SliverPadding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverToBoxAdapter(child: SelloConfianza()),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 22)),
              // Foto grande para los que la tienen; la lista de abajo sigue
              // siendo de filas porque comparar pide densidad. Si ningún
              // comercio tiene portada, esto no se dibuja — ni un marco gris.
              if (comerciosAsync.valueOrNull != null) ...[
                SliverToBoxAdapter(
                  child: CarruselDestacados(
                    comercios: comerciosAsync.valueOrNull!,
                    onAbrir: (c) => context.push(
                      AppRoutes.businessPath(c.id),
                      extra: c,
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 24)),
              ],
              SliverToBoxAdapter(
                child: _TituloSeccion(
                  texto: _filtro == null ? 'Cerca de ti' : _filtro!.label,
                  onQuitarFiltro:
                      _filtro == null ? null : () => setState(() => _filtro = null),
                ),
              ),
              comerciosAsync.when(
                loading: () => const SliverPadding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, 0),
                  sliver: SliverToBoxAdapter(child: EsqueletoFilas()),
                ),
                error: (_, __) => SliverToBoxAdapter(
                  child: BannerSinConexion(
                    onReintentar: () => ref.invalidate(businessesProvider),
                  ),
                ),
                data: _listaComercios,
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 110)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _listaComercios(List<BusinessEntity> todos) {
    final q = _busqueda.trim().toLowerCase();
    final filtrados = todos.where((b) {
      final porCategoria = _filtro == null || b.category == _filtro;
      final porTexto = q.isEmpty || b.name.toLowerCase().contains(q);
      return porCategoria && porTexto;
    }).toList();

    // Los CERRADOS bajan, pero no se van: quien mira a las 2 de la mañana
    // tiene derecho a saber qué existe en su barrio, y esconderlos hace pensar
    // que la app está rota o que el sitio cerró para siempre.
    filtrados.sort((a, b) {
      if (a.isOpen == b.isOpen) return 0;
      return a.isOpen ? -1 : 1;
    });

    if (filtrados.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: q.isNotEmpty || _filtro != null
            ? EstadoZipa(
                icono: ZipaIconName.sinResultados,
                titulo: 'Nada coincide con tu búsqueda',
                mensaje: 'Prueba con otra palabra, o mira todo lo que hay '
                    'cerca de ti.',
                accion: 'Ver todo',
                onAccion: () => setState(() {
                  _filtro = null;
                  _busqueda = '';
                }),
              )
            : SinComerciosCerca(
                onCambiarDireccion: () => context.push(AppRoutes.addresses),
              ),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      sliver: SliverList.separated(
        itemCount: filtrados.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) => FilaComercio(
          comercio: filtrados[i],
          onTap: () => context.push(
            AppRoutes.businessPath(filtrados[i].id),
            extra: filtrados[i],
          ),
        ),
      ),
    );
  }
}

// ── 1. Dónde entregar ────────────────────────────────────────────────────────

class _BarraDireccion extends StatelessWidget {
  const _BarraDireccion({
    required this.direccion,
    required this.onTap,
    required this.onCampana,
  });

  /// Null = todavía no eligió ninguna. No se inventa una: poner un texto de
  /// relleno con pinta de dirección hace que alguien pida a un sitio que no es
  /// el suyo.
  final String? direccion;
  final VoidCallback onTap;
  final VoidCallback onCampana;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 10),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(10),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Entregar en',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                        color: context.zTexto3,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            direccion ?? 'Elige tu dirección',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15.5,
                              fontWeight: FontWeight.w700,
                              color: context.zTexto,
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        const ZipaIcon(
                          ZipaIconName.chevron,
                          size: ZipaIconSize.inline,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onCampana,
            icon: const ZipaIcon(ZipaIconName.campana),
            tooltip: 'Tus pedidos',
          ),
        ],
      ),
    );
  }
}

// ── 2. Buscar ────────────────────────────────────────────────────────────────

class _Buscador extends StatelessWidget {
  const _Buscador({required this.onChanged});

  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          // Superficie HUNDIDA, no blanca, y borde de un pelo en vez de
          // sombra. Sobre un fondo casi blanco, una caja blanca con sombra no
          // se lee como un campo donde se escribe: se lee como una tarjeta.
          color: context.zHundida,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.zBorde),
        ),
        child: TextField(
          onChanged: onChanged,
          style: TextStyle(fontSize: 14.5, color: context.zTexto),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(vertical: 13),
            // Dice lo que BUSCA, ni una palabra más. Ponía «plato o destino» y
            // no busca ninguna de las dos: el filtro es `b.name.contains(q)`,
            // solo el nombre del comercio. Escribir un destino aquí devolvía
            // una lista vacía, que se lee como que la app está rota.
            //
            // Y un destino no se busca en el catálogo: se busca en Movilidad,
            // con su autocompletado de direcciones. Son dos buscadores
            // distintos y mezclarlos es lo que hacía que esto pareciera
            // improvisado.
            hintText: 'Buscar restaurantes y tiendas',
            hintStyle: TextStyle(color: context.zTexto3, fontSize: 14.5),
            prefixIcon: const Padding(
              padding: EdgeInsets.only(left: 13, right: 9),
              child: ZipaIcon(ZipaIconName.buscar),
            ),
            prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
          ),
        ),
      ),
    );
  }
}

// ── 3. Qué quieres hacer ─────────────────────────────────────────────────────

class _RejillaServicios extends ConsumerWidget {
  const _RejillaServicios({required this.onFiltrarRestaurantes});

  final VoidCallback onFiltrarRestaurantes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Rejilla de dos columnas con las CUATRO puertas. Antes había dos, y
    // Envíos e Intermunicipal vivían bajo el pliegue o en ninguna parte —
    // que es la razón por la que «no daba opción de reservar intermunicipal».
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TarjetaServicio(
                  icono: ZipaIconName.movilidad,
                  tinte: ZipaTokens.movilidad,
                  titulo: 'Movilidad',
                  subtitulo: 'Taxi, moto, carro',
                  onTap: () =>
                      ref.read(shellTabProvider.notifier).state = kTabMovilidad,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TarjetaServicio(
                  icono: ZipaIconName.restaurantes,
                  tinte: ZipaTokens.restaurantes,
                  titulo: 'Restaurantes',
                  subtitulo: 'Comida a domicilio',
                  onTap: onFiltrarRestaurantes,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TarjetaServicio(
                  icono: ZipaIconName.envios,
                  ilustracion: 'assets/servicios/repartidor.png',
                  tinte: ZipaTokens.envios,
                  titulo: 'Envíos',
                  subtitulo: 'Paquetes y mandados',
                  // Decía «Paquetes y mandados» y abría SOLO el formulario de
                  // paquetes: el botón prometía la mitad que no daba. Ahora
                  // pregunta cuál de los dos, que son flujos distintos.
                  onTap: () => mostrarHojaEnvios(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TarjetaServicio(
                  icono: ZipaIconName.intermunicipal,
                  tinte: ZipaTokens.intermunicipal,
                  titulo: 'Intermunicipal',
                  subtitulo: 'Viajes entre ciudades',
                  onTap: () => context.push(AppRoutes.intercityBooking),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── 5. Qué hay cerca ─────────────────────────────────────────────────────────

class _TituloSeccion extends StatelessWidget {
  const _TituloSeccion({required this.texto, this.onQuitarFiltro});

  final String texto;
  final VoidCallback? onQuitarFiltro;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 10, 10),
      child: Row(
        children: [
          Text(
            texto,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: context.zTexto,
            ),
          ),
          const Spacer(),
          // Un filtro sin forma de quitarlo deja al usuario encerrado viendo
          // una parte del catálogo sin saber por qué.
          if (onQuitarFiltro != null)
            TextButton.icon(
              onPressed: onQuitarFiltro,
              icon: const ZipaIcon(ZipaIconName.cerrar, size: ZipaIconSize.inline),
              label: const Text('Quitar filtro'),
            ),
        ],
      ),
    );
  }
}
