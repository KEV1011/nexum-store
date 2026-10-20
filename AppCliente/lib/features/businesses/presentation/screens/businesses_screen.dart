import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'carrusel_destacados.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'comercio_con_platos.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_antojos.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_categorias_comercio.dart';
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

  /// El antojo elegido en «¿Qué se te antoja?» (su clave), o null.
  String? _antojo;

  /// Cómo se ordenan los resultados de un antojo o de una búsqueda.
  OrdenResultados _orden = OrdenResultados.recomendados;

  /// El campo de búsqueda, controlado: «Ver todo» tiene que poder BORRAR lo
  /// escrito. Antes limpiaba el filtro pero el texto seguía en el campo, así
  /// que la pantalla decía una cosa y el buscador otra.
  final _buscador = TextEditingController();

  @override
  void dispose() {
    _buscador.dispose();
    super.dispose();
  }

  void _verTodo() {
    _buscador.clear();
    setState(() {
      _filtro = null;
      _busqueda = '';
      _antojo = null;
      _orden = OrdenResultados.recomendados;
    });
  }

  @override
  Widget build(BuildContext context) {
    final comerciosAsync = ref.watch(businessesProvider);
    final direccion = ref.watch(defaultAddressProvider);
    // Sin filtro, antojo ni búsqueda la pantalla es una vitrina; con
    // cualquiera de los tres pasa a ser una lista de resultados.
    final explorando =
        _filtro == null && _busqueda.trim().isEmpty && _antojo == null;
    final comercios = comerciosAsync.valueOrNull;
    final antojos =
        comercios == null ? const <Antojo>[] : antojosPresentes(comercios);
    final filaAntojos = SliverToBoxAdapter(
      child: FilaAntojos(
        antojos: antojos,
        seleccionado: _antojo,
        onSeleccionar: (clave) => setState(() {
          _antojo = clave;
          // Un antojo es comida: con «Supermercados» puesto la lista saldría
          // vacía sin que se entienda por qué.
          _filtro = null;
          _orden = OrdenResultados.recomendados;
        }),
      ),
    );

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
                  controller: _buscador,
                  onChanged: (v) => setState(() => _busqueda = v),
                ),
              ),
              // Las puertas, los mandados, el sello y el carrusel son para
              // EXPLORAR. Con un filtro puesto o una búsqueda escrita estorban:
              // empujan la lista de resultados fuera de la pantalla y hacen
              // creer que el botón no hizo nada — que es justo lo que pasaba al
              // tocar «Restaurantes», que sí filtraba, pero varios cientos de
              // píxeles más abajo, sin que se moviera nada a la vista.
              if (explorando) ...[
                const SliverToBoxAdapter(child: SizedBox(height: 18)),
                SliverToBoxAdapter(
                  child: _RejillaServicios(
                    onFiltrarRestaurantes: () => setState(
                      () => _filtro = BusinessCategory.restaurant,
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 22)),
                // Justo debajo de las puertas: es lo primero que se mira con
                // hambre, y «Restaurantes» de arriba lleva a la lista entera.
                if (antojos.isNotEmpty) ...[
                  filaAntojos,
                  const SliverToBoxAdapter(child: SizedBox(height: 22)),
                ],
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
              ] else ...[
                const SliverToBoxAdapter(child: SizedBox(height: 14)),
                // Fuera de la vitrina se queda ARRIBA: con un antojo elegido es
                // la forma de saltar a otro sin quitar el primero.
                if (antojos.isNotEmpty) ...[
                  filaAntojos,
                  const SliverToBoxAdapter(child: SizedBox(height: 14)),
                ],
              ],
              // Las píldoras de categoría van FUERA del bloque de explorar, al
              // revés que las puertas: con un filtro puesto son la única forma
              // de saltar a otro rubro sin quitarlo primero. Y se arman con lo
              // que de verdad llegó, así que en una plaza sin droguerías no
              // hay píldora «Droguerías» que lleve a una lista vacía.
              if (comerciosAsync.valueOrNull != null) ...[
                SliverToBoxAdapter(
                  child: FilaCategoriasComercio(
                    categorias:
                        categoriasPresentes(comerciosAsync.valueOrNull!),
                    seleccionada: _filtro,
                    onSeleccionar: (c) => setState(() {
                      _filtro = c;
                      _antojo = null;
                    }),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 6)),
              ],
              SliverToBoxAdapter(
                child: _TituloSeccion(
                  texto: _tituloLista(),
                  onQuitarFiltro: _filtro == null && _antojo == null
                      ? null
                      : () => setState(() {
                            _filtro = null;
                            _antojo = null;
                          }),
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

  String _tituloLista() {
    if (_antojo != null) {
      return kAntojos.where((a) => a.clave == _antojo).firstOrNull?.nombre ??
          'Cerca de ti';
    }
    if (normalizarTexto(_busqueda).length >= kMinLetrasBusqueda) {
      return 'Resultados';
    }
    return _filtro == null ? 'Cerca de ti' : _filtro!.plural;
  }

  /// Cada local con los platos que casaron (vacío si no se busca plato).
  List<MapEntry<BusinessEntity, List<ProductEntity>>> _resultados(
    List<BusinessEntity> todos,
  ) {
    final q = _busqueda.trim();
    final buscaPlato = normalizarTexto(q).length >= kMinLetrasBusqueda;
    final porNombre = <MapEntry<BusinessEntity, List<ProductEntity>>>[];
    final porPlato = <MapEntry<BusinessEntity, List<ProductEntity>>>[];

    for (final b in todos) {
      if (_filtro != null && b.category != _filtro) continue;
      var platos = _antojo == null
          ? <ProductEntity>[]
          : platosDelAntojo(b, _antojo!);
      if (_antojo != null && platos.isEmpty) continue;

      if (buscaPlato) {
        final c = buscarEnComercio(b, q);
        if (_antojo != null) {
          // Antojo Y búsqueda: dentro de las hamburguesas, la que diga
          // «doble». Si lo escrito es el nombre del local, valen todas.
          if (!c.porNombre) {
            final ids = {for (final p in c.platos) p.id};
            platos = platos.where((p) => ids.contains(p.id)).toList();
            if (platos.isEmpty) continue;
          }
        } else {
          if (!c.algo) continue;
          platos = c.platos;
        }
        // El local que se LLAMA como lo buscado va antes: quien escribe
        // «betos» busca a Betos, no a la hamburguesa que lo menciona.
        (c.porNombre ? porNombre : porPlato).add(MapEntry(b, platos));
        continue;
      }
      if (q.isNotEmpty &&
          !normalizarTexto(b.name).contains(normalizarTexto(q))) {
        continue;
      }
      porNombre.add(MapEntry(b, platos));
    }
    return ordenarResultados([...porNombre, ...porPlato], _orden);
  }

  Widget _listaComercios(List<BusinessEntity> todos) {
    final filas = _resultados(todos);
    final conPlatos = _antojo != null ||
        normalizarTexto(_busqueda).length >= kMinLetrasBusqueda;

    if (filas.isEmpty) {
      final hayCriterio =
          _busqueda.trim().isNotEmpty || _filtro != null || _antojo != null;
      return SliverFillRemaining(
        hasScrollBody: false,
        child: hayCriterio
            ? EstadoZipa(
                icono: ZipaIconName.sinResultados,
                titulo: 'Nada coincide con tu búsqueda',
                mensaje: 'Prueba con otra palabra, o mira todo lo que hay '
                    'cerca de ti.',
                accion: 'Ver todo',
                onAccion: _verTodo,
              )
            : SinComerciosCerca(
                onCambiarDireccion: () => context.push(AppRoutes.addresses),
              ),
      );
    }

    void abrir(BusinessEntity b) => context.push(
          AppRoutes.businessPath(
            b.id,
            antojo: _antojo,
            busqueda: conPlatos && _antojo == null ? _busqueda : null,
          ),
          extra: b,
        );

    return SliverMainAxisGroup(
      slivers: [
        // Ordenar solo tiene sentido comparando platos, y con al menos dos
        // locales: con uno, los botones no cambiarían nada.
        if (conPlatos && filas.length >= 2)
          SliverToBoxAdapter(
            child: _OrdenResultados(
              orden: _orden,
              onCambiar: (o) => setState(() => _orden = o),
            ),
          ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          sliver: SliverList.separated(
            itemCount: filas.length,
            separatorBuilder: (_, __) => SizedBox(height: conPlatos ? 14 : 10),
            itemBuilder: (context, i) {
              final f = filas[i];
              return conPlatos
                  ? ComercioConPlatos(
                      comercio: f.key,
                      platos: f.value,
                      onTap: () => abrir(f.key),
                    )
                  : FilaComercio(comercio: f.key, onTap: () => abrir(f.key));
            },
          ),
        ),
      ],
    );
  }
}

/// «Recomendados · Más barato · Mejor calificado». No hay «Más cerca»: la
/// lista no trae la distancia de cada local, y ordenar por un dato que no se
/// tiene sería inventar el orden.
class _OrdenResultados extends StatelessWidget {
  const _OrdenResultados({required this.orden, required this.onCambiar});

  final OrdenResultados orden;
  final ValueChanged<OrdenResultados> onCambiar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
        children: [
          for (final o in OrdenResultados.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(o.etiqueta),
                selected: o == orden,
                onSelected: (_) => onCambiar(o),
              ),
            ),
        ],
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
  const _Buscador({required this.controller, required this.onChanged});

  final TextEditingController controller;
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
          controller: controller,
          onChanged: onChanged,
          style: TextStyle(fontSize: 14.5, color: context.zTexto),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(vertical: 13),
            // Dice lo que BUSCA, ni una palabra más. Ahora busca de verdad
            // platos —nombre, sección e ingredientes, sin tildes— además del
            // nombre del local (`buscarEnComercio`), así que el texto lo dice.
            //
            // Y un destino no se busca en el catálogo: se busca en Movilidad,
            // con su autocompletado de direcciones. Son dos buscadores
            // distintos y mezclarlos es lo que hacía que esto pareciera
            // improvisado.
            hintText: 'Busca un plato o un local',
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
    // Rejilla de dos por dos. Antes había dos puertas, y Envíos e
    // Intermunicipal vivían bajo el pliegue o en ninguna parte — que es la
    // razón por la que «no daba opción de reservar intermunicipal».
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TarjetaServicio(
                  icono: ZipaIconName.movilidad,
                  ilustracion: 'assets/categorias/taxi.png',
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
                  ilustracion: 'assets/servicios/restaurantes.png',
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
              // TIENDAS RETIRADA mientras se rehace la parte de ropa, tecnología
              // y hogar (decisión del dueño). Los comercios de esa categoría
              // siguen en la lista y en su píldora: lo que se quita es la
              // puerta, no los negocios. Para volver a ponerla, su ilustración
              // y su tinte siguen en `assets/servicios/tiendas.png` y
              // `ZipaTokens.tiendas`.
              Expanded(
                child: TarjetaServicio(
                  proximamente: true,
                  icono: ZipaIconName.intermunicipal,
                  ilustracion: 'assets/categorias/bus.png',
                  tinte: ZipaTokens.intermunicipal,
                  titulo: 'Intermunicipal',
                  subtitulo: 'Pronto: entre ciudades',
                  // APLAZADO. La puerta se queda y EXPLICA por qué no se puede
                  // todavía, en vez de llevar a un formulario que nadie
                  // atiende: el intermunicipal exige empresas de transporte
                  // habilitadas y verificadas. Para rehabilitarlo basta quitar
                  // `proximamente` y devolver el `push` a
                  // `AppRoutes.intercityBooking`.
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'El servicio intermunicipal abre pronto: estamos '
                        'habilitando las empresas de transporte de la región.',
                      ),
                    ),
                  ),
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
