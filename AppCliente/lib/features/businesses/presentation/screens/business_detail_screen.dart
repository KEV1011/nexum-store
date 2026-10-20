import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/core/utils/safe_back.dart';
import 'package:nexum_client/shared/widgets/estados_zipa.dart';
import 'package:nexum_client/shared/widgets/foto_encuadrada.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/barra_secciones.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/providers/'
    'businesses_provider.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'product_tile.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'product_options_sheet.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'precio_producto.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/intercity/domain/entities/'
    'intercity_entity.dart';

/// Detalle del negocio: cabecera + menú agrupado por categoría.
class BusinessDetailScreen extends ConsumerWidget {
  const BusinessDetailScreen({
    required this.businessId,
    this.initialBusiness,
    this.antojoInicial,
    this.busquedaInicial,
    super.key,
  });

  final String businessId;
  final BusinessEntity? initialBusiness;

  /// Se llega desde «¿Qué se te antoja?»: la carta abre con ESE antojo a la
  /// vista. Sin esto, tocar «Hamburguesas» y caer en la carta entera obligaba
  /// a buscar otra vez lo que ya se había elegido.
  final String? antojoInicial;

  /// Se llega desde el buscador de la home con un plato escrito.
  final String? busquedaInicial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (initialBusiness != null) {
      return _DetailView(
        business: initialBusiness!,
        antojoInicial: antojoInicial,
        busquedaInicial: busquedaInicial,
      );
    }

    final async = ref.watch(businessByIdProvider(businessId));
    return async.when(
      // La silueta de la carta, no una ruedita sobre una pantalla en blanco:
      // esta es la pantalla donde se decide la compra, y se llega a ella
      // tocando un local — ver el hueco con su forma es ver que SÍ se abrió.
      // Con su botón de atrás, porque sin él una carga lenta deja encerrado a
      // quien solo quería volver a la lista.
      loading: () => Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            tooltip: 'Volver',
            onPressed: () => safeBack(context),
          ),
        ),
        extendBodyBehindAppBar: true,
        body: const EsqueletoCarta(),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('No se pudo cargar el negocio')),
      ),
      data: (business) => _DetailView(
        business: business,
        antojoInicial: antojoInicial,
        busquedaInicial: busquedaInicial,
      ),
    );
  }
}

class _DetailView extends ConsumerStatefulWidget {
  const _DetailView({
    required this.business,
    this.antojoInicial,
    this.busquedaInicial,
  });

  final BusinessEntity business;
  final String? antojoInicial;
  final String? busquedaInicial;

  @override
  ConsumerState<_DetailView> createState() => _DetailViewState();
}

class _DetailViewState extends ConsumerState<_DetailView> {
  /// Texto del buscador. Un supermercado tiene cientos de referencias y
  /// recorrer la lista entera no es viable; en un restaurante con pocos
  /// platos el buscador ni se muestra.
  String _query = '';

  /// El antojo con el que se llegó, mientras no se pida ver la carta entera.
  String? _antojo;

  /// El texto del buscador, para poder abrirlo ya escrito.
  late final TextEditingController _buscador;

  /// A partir de aquí la lista deja de poder recorrerse a ojo.
  static const _minParaBuscador = 12;

  /// Con una sola sección la barra no filtra ni ordena nada: sobra.
  static const _minSeccionesParaBarra = 2;

  final ScrollController _scroll = ScrollController();

  /// Una clave por encabezado de sección, para poder saltar a ella y para
  /// saber cuál está a la vista. Se reutilizan entre reconstrucciones: una
  /// clave nueva en cada `build` desmontaría y remontaría el encabezado.
  final Map<String, GlobalKey> _claves = {};

  /// La sección que está a la vista, o `null` mientras no se sepa.
  String? _seccionActiva;

  /// El orden en que se pintan las secciones, que es el de la barra.
  List<String> _orden = const [];

  GlobalKey _claveDe(String seccion) =>
      _claves.putIfAbsent(seccion, GlobalKey.new);

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_alDesplazar);
    _query = widget.busquedaInicial?.trim() ?? '';
    _buscador = TextEditingController(text: _query);
    // Solo si el local DE VERDAD tiene platos de ese antojo: un enlace viejo
    // o un antojo que el dueño acaba de retirar abriría una carta vacía.
    final a = widget.antojoInicial;
    if (a != null && platosDelAntojo(widget.business, a).isNotEmpty) {
      _antojo = a;
    }
  }

  @override
  void dispose() {
    _buscador.dispose();
    _scroll
      ..removeListener(_alDesplazar)
      ..dispose();
    super.dispose();
  }

  /// Marca como activa la última sección cuyo encabezado ya pasó por arriba.
  ///
  /// Solo mira las que están CONSTRUIDAS: las de más abajo no tienen contexto
  /// todavía, y eso está bien porque por definición no son la que se está
  /// mirando.
  void _alDesplazar() {
    if (!mounted) return;
    String? vista;
    for (final s in _orden) {
      final ctx = _claves[s]?.currentContext;
      if (ctx == null) continue;
      final caja = ctx.findRenderObject();
      if (caja is! RenderBox || !caja.attached) continue;
      // Un poco por debajo del borde: el encabezado se considera «alcanzado»
      // justo cuando se mete bajo la barra, no cuando asoma por abajo.
      final dy = caja.localToGlobal(Offset.zero).dy;
      if (dy <= kAltoBarraSecciones + kToolbarHeight + 8) vista = s;
    }
    if (vista != _seccionActiva) setState(() => _seccionActiva = vista);
  }

  /// Lleva la carta hasta una sección.
  ///
  /// En dos fases a propósito: lo que está lejos no está construido y su
  /// clave no tiene contexto, así que se avanza una pantalla en la dirección
  /// correcta —lo que obliga a construir lo siguiente— y se reintenta. El
  /// número de intentos está acotado: si no se llega, la carta se queda donde
  /// esté y se sigue pudiendo desplazar a mano, que es mucho mejor que un
  /// bucle sin final.
  Future<void> _irASeccion(String seccion) async {
    const maxIntentos = 8;
    final indiceDestino = _orden.indexOf(seccion);
    if (indiceDestino == -1) return;

    for (var intento = 0; intento < maxIntentos; intento++) {
      if (!mounted || !_scroll.hasClients) return;

      final ctx = _claves[seccion]?.currentContext;
      if (ctx != null) {
        await Scrollable.ensureVisible(
          ctx,
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          // Justo debajo de la barra fijada, no tapado por ella.
          alignment: 0,
          alignmentPolicy: ScrollPositionAlignmentPolicy.explicit,
        );
        return;
      }

      // No está construida. Hacia dónde: si la activa va antes en el orden,
      // la que falta está más abajo.
      final indiceActual = _seccionActiva == null ? -1 : _orden.indexOf(_seccionActiva!);
      final haciaAbajo = indiceDestino > indiceActual;
      final pos = _scroll.position;
      final salto = pos.viewportDimension * 0.9;
      final destino = (haciaAbajo ? pos.pixels + salto : pos.pixels - salto)
          .clamp(0.0, pos.maxScrollExtent);
      if (destino == pos.pixels) return;
      await _scroll.animateTo(
        destino,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final business = widget.business;
    final cart = ref.watch(cartProvider);
    final cartNotifier = ref.read(cartProvider.notifier);

    // Sin tildes ni mayúsculas, con el MISMO criterio que el buscador de la
    // home: si allá «salchipapa» encontró este local, aquí tiene que encontrar
    // el plato.
    final q = normalizarTexto(_query);
    final delAntojo = _antojo == null
        ? business.products
        : platosDelAntojo(business, _antojo!);
    final visibles = q.isEmpty
        ? delAntojo
        : delAntojo.where((p) {
            return normalizarTexto(p.name).contains(q) ||
                normalizarTexto(p.category).contains(q) ||
                normalizarTexto(p.description).contains(q);
          }).toList();
    final antojo = _antojo == null
        ? null
        : kAntojos.where((a) => a.clave == _antojo).firstOrNull;

    final grouped = <String, List<ProductEntity>>{};
    for (final product in visibles) {
      grouped.putIfAbsent(product.category, () => []).add(product);
    }

    // Dos secciones DERIVADAS que se arman solas con lo que el negocio ya
    // cargó: no hay que curar nada a mano. Van arriba porque es lo que la
    // gente busca primero, y solo aparecen si tienen contenido — una pestaña
    // «Populares» vacía en una tienda nueva es peor que no tenerla.
    final populares = visibles.where((p) => p.masPedidoPuesto != null).toList()
      ..sort((a, b) => a.masPedidoPuesto!.compareTo(b.masPedidoPuesto!));
    final enOferta = visibles.where((p) => p.enOferta).toList()
      ..sort((a, b) => b.descuentoPct!.compareTo(a.descuentoPct!));

    // El orden de la barra es EXACTAMENTE el orden en que se pintan las
    // secciones más abajo. Si fueran dos listas distintas, tocar un chip
    // llevaría a otra sección.
    _orden = [
      if (populares.isNotEmpty) 'Lo más pedido',
      if (enOferta.isNotEmpty) 'Descuentos',
      ...grouped.keys,
    ];
    // Con el buscador escrito la barra se retira: lo que hay debajo son
    // resultados, no la carta, y una barra de secciones sobre una lista
    // filtrada promete saltos que no existen.
    final conBarra =
        q.isEmpty && _antojo == null && _orden.length >= _minSeccionesParaBarra;

    return Scaffold(
      body: CustomScrollView(
        controller: _scroll,
        slivers: [
          _BusinessAppBar(business: business),
          // Nota, tiempo y envío DEBAJO de la cabecera, no encima de ella.
          // Iban en una píldora pegada al borde inferior de la foto, justo
          // donde se pinta el nombre del local: la píldora tapaba el nombre
          // («BETO» asomaba por debajo) y ocupaba todo el ancho.
          SliverToBoxAdapter(child: _InfoRow(business: business)),
          if (!business.isOpen || business.openingHours != null)
            SliverToBoxAdapter(
              child: _StatusBanner(business: business),
            ),
          // Los precios de esta carta salieron de una FOTO de su menú, no del
          // local. Decirlo ARRIBA y no en la caja: el cliente mira el precio
          // aquí, y enterarse al final de que no era firme es peor que no
          // haberlo sabido nunca.
          if (!business.claimed)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM, AppConstants.spacingM,
                  AppConstants.spacingM, 0,
                ),
                child: _PreciosDeReferencia(negocio: business.name),
              ),
            ),
          // Despacha a otras ciudades. Va ARRIBA del catálogo porque cambia a
          // qué distancia se puede comprar aquí, y quien no lo sabe ni entra:
          // hasta ahora el dato existía en la base y no lo veía nadie.
          if (business.despachaAOtrasCiudades)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM, AppConstants.spacingM,
                  AppConstants.spacingM, 0,
                ),
                child: _EnviaAOtrasCiudades(destinos: business.shipsTo),
              ),
            ),
          // La promoción de la tienda, con lo que lleva el carrito AHORA: el
          // mismo mínimo y el mismo descuento que aplicará el servidor.
          if (business.tienePromo)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM, AppConstants.spacingM, AppConstants.spacingM, 0,
                ),
                child: BannerPromoTienda(
                  minimo: business.promoMinAmount!,
                  descuento: business.promoDiscount!,
                  subtotal: cart.business?.id == business.id ? cart.subtotal : 0,
                ),
              ),
            ),
          // Llegando con un antojo, se dice cuál y se ofrece la carta entera:
          // un filtro que no se ve y no se puede quitar deja a la persona
          // creyendo que el local solo vende eso.
          if (antojo != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM, AppConstants.spacingM,
                  AppConstants.spacingM, 0,
                ),
                child: _FiltroAntojo(
                  antojo: antojo,
                  onQuitar: () => setState(() => _antojo = null),
                ),
              ),
            ),
          // También se enseña si se llegó con una búsqueda escrita, aunque la
          // carta sea corta: sin el campo no habría cómo borrarla.
          if (business.products.length >= _minParaBuscador ||
              (widget.busquedaInicial?.isNotEmpty ?? false))
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingM,
                  AppConstants.spacingM,
                  AppConstants.spacingM,
                  0,
                ),
                child: TextField(
                  controller: _buscador,
                  onChanged: (v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    hintText: 'Buscar en ${business.name}',
                    prefixIcon: const Icon(Icons.search_rounded, size: 20),
                    isDense: true,
                    filled: true,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            ),
          if (visibles.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(AppConstants.spacingXL),
                child: Center(
                  child: Text(
                    'Nada coincide con "$_query".',
                    style: const TextStyle(color: Colors.grey),
                  ),
                ),
              ),
            ),
          // La barra de secciones, fijada bajo la cabecera. Va DESPUÉS del
          // buscador para que al escribir siga a la vista el campo, y antes
          // de la primera sección porque es su índice.
          if (conBarra)
            SliverPersistentHeader(
              pinned: true,
              delegate: BarraSeccionesDelegate(
                secciones: _orden,
                activa: _seccionActiva,
                onSeleccion: (s) => unawaited(_irASeccion(s)),
              ),
            ),
          if (populares.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: 'Lo más pedido',
                anclaKey: _claveDe('Lo más pedido'),
              ),
            ),
            _RejillaProductos(
              productos: populares,
              cart: cart,
              cartNotifier: cartNotifier,
              business: business,
            ),
          ],
          if (enOferta.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: 'Descuentos',
                anclaKey: _claveDe('Descuentos'),
              ),
            ),
            _RejillaProductos(
              productos: enOferta,
              cart: cart,
              cartNotifier: cartNotifier,
              business: business,
            ),
          ],
          for (final entry in grouped.entries) ...[
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: entry.key,
                anclaKey: _claveDe(entry.key),
              ),
            ),
            _RejillaProductos(
              productos: entry.value,
              cart: cart,
              cartNotifier: cartNotifier,
              business: business,
            ),
          ],
          const SliverToBoxAdapter(
            child: SizedBox(height: 96),
          ),
        ],
      ),
      bottomNavigationBar: _CartBar(cart: cart),
    );
  }
}

/// «Mostrando: Hamburguesas · Ver toda la carta».
class _FiltroAntojo extends StatelessWidget {
  const _FiltroAntojo({required this.antojo, required this.onQuitar});

  final Antojo antojo;
  final VoidCallback onQuitar;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
        child: Row(
          children: [
            Image.asset(
              antojo.ilustracion,
              width: 32,
              height: 32,
              errorBuilder: (_, __, ___) => const SizedBox(width: 32),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Mostrando ${antojo.nombre.toLowerCase()}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimaryColor,
                ),
              ),
            ),
            TextButton(
              onPressed: onQuitar,
              child: const Text('Ver toda la carta'),
            ),
          ],
        ),
      ),
    );
  }
}

/// La lista de productos de una sección.
///
/// Se extrajo porque ahora hay TRES secciones que pintan lo mismo («Lo más
/// pedido», «Descuentos» y cada categoría del negocio). Duplicarla habría
/// hecho que el botón de agregar se comportara distinto según en qué sección
/// tocara el cliente el mismo plato.
class _RejillaProductos extends StatelessWidget {
  const _RejillaProductos({
    required this.productos,
    required this.cart,
    required this.cartNotifier,
    required this.business,
  });

  final List<ProductEntity> productos;
  final CartState cart;
  final CartNotifier cartNotifier;
  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
      sliver: SliverList.separated(
        itemCount: productos.length,
        separatorBuilder: (_, __) => const SizedBox(height: AppConstants.spacingS),
        itemBuilder: (context, i) {
          final product = productos[i];
          // Con opciones: el tile siempre muestra "Agregar" y abre la hoja de
          // selección (las variantes se gestionan en el carrito).
          final qty = (product.hasOptions || cart.business?.id != business.id)
              ? 0
              : cartNotifier.quantityOf(product.id);
          return ProductTile(
            product: product,
            quantity: qty,
            onAdd: () async {
              if (!business.isOpen) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('El negocio está cerrado ahora.')),
                );
                return;
              }
              // La hoja se abre también sin opciones: ahí es donde se elige la
              // cantidad y se escribe la nota para la cocina.
              final elegido = await showProductOptionsSheet(context, product);
              if (elegido != null) {
                cartNotifier.addProduct(
                  product,
                  business,
                  selectedOptions: elegido.options,
                  quantity: elegido.quantity,
                  notes: elegido.notes,
                );
              }
            },
            onRemove: () => cartNotifier.removeOne(product.id),
          );
        },
      ),
    );
  }
}

class _BusinessAppBar extends StatelessWidget {
  const _BusinessAppBar({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    final conFoto = business.imageUrl != null && business.imageUrl!.isNotEmpty;
    // Sin portada la cabecera se ENCOGE: 180 px de tinte liso con un cubierto
    // genérico no informan de nada y empujan la carta fuera de la pantalla.
    // Con foto sí valen, porque la foto es la que vende.
    final alto = conFoto ? 180.0 : 128.0;
    return SliverAppBar(
      pinned: true,
      expandedHeight: alto,
      flexibleSpace: LayoutBuilder(builder: (ctx, c) {
        // EL TÍTULO CAMBIA DE COLOR AL PLEGARSE. Sobre la foto va blanco
        // (lleva scrim), pero al plegar la cabecera la foto se desvanece y
        // queda la barra clara del tema: el nombre del local salía blanco
        // sobre gris claro, invisible («Mon Delice», «Mi cafetal»). Se pasa
        // del blanco al color del texto del tema según cuánto queda abierta.
        final arriba = MediaQuery.paddingOf(ctx).top;
        final minimo = kToolbarHeight + arriba;
        final abierta = ((c.maxHeight - minimo) / (alto + arriba - minimo))
            .clamp(0.0, 1.0);
        final colorTitulo = conFoto
            ? Color.lerp(context.textPrimaryColor, Colors.white, abierta)!
            : context.textPrimaryColor;
        return FlexibleSpaceBar(
        title: Text(
          business.name,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            // Sobre la foto va blanco (lleva scrim). Sin foto, el fondo pasó
            // a ser la superficie del TEMA, así que el texto también: en
            // oscuro, claro sobre oscuro; en claro, oscuro sobre claro.
            //
            // Antes el respaldo era el tinte claro FIJO de la categoría con
            // el texto del tema encima, y en modo oscuro el nombre del local
            // salía casi del color del fondo: «BETOS» ilegible, con la flecha
            // de atrás y la fila de info igual de tenues. Es la co-ocurrencia
            // que la regla de contraste prohíbe, y fijar SOLO el color del
            // título no bastaba — la flecha la pinta el `AppBarTheme`.
            color: colorTitulo,
          ),
        ),
        titlePadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingXL,
          vertical: AppConstants.spacingM,
        ),
        background: conFoto
            ? Stack(
                fit: StackFit.expand,
                children: [
                  // Foto de portada del local, ENTERA. Con `cover` a secas
                  // un logo cuadrado —que es lo que sube media ciudad— salía
                  // cortado por arriba y por abajo.
                  FotoEncuadrada(
                    url: ApiConfig.resolveUrl(business.imageUrl!),
                    fallback: ColoredBox(color: business.category.containerColor),
                  ),
                  // Scrim para legibilidad del título del SliverAppBar.
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.center,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black54],
                      ),
                    ),
                  ),
                ],
              )
            // Sin foto, la cabecera es del TEMA y no un tinte claro fijo: en
            // modo oscuro aquella era una isla crema encima de una app negra,
            // y todo lo que iba encima —nombre, flecha, info— se perdía.
            // El color de la categoría se queda donde sí se lee: el icono.
            : ColoredBox(
                color: context.surfaceColor,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: AppConstants.spacingL),
                    Icon(
                      business.category.icon,
                      size: 64,
                      color: business.category.color,
                    ),
                    const SizedBox(height: AppConstants.spacingXL),
                  ],
                ),
              ),
        );
      }),
    );
  }
}

/// «También envía a Cúcuta y Bucaramanga».
///
/// Lo que habilita esto es que las empresas intermunicipales de pasajeros ya
/// salen todos los días y ya tienen taquilla en cada terminal: el comercio
/// deja la caja y el cliente de otra ciudad la recoge allá. Aquí solo se
/// ANUNCIA; el precio y el plazo los pone el propio comercio y se enseñan al
/// confirmar, con la cifra que va a cobrar el servidor.
class _EnviaAOtrasCiudades extends StatelessWidget {
  const _EnviaAOtrasCiudades({required this.destinos});

  final List<DestinoEnvio> destinos;

  @override
  Widget build(BuildContext context) {
    final nombres = destinos
        .map((d) => IntercityCity.bySlug(d.city).displayName)
        .toList();
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.infoContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_shipping_rounded,
              color: AppColors.info, size: 20),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              'También envía a ${_enumerar(nombres)}. '
              'Elige la ciudad al confirmar el pedido.',
              // Color fijo porque el contenedor lo es: con el adaptativo, en
              // modo oscuro saldría casi blanco sobre azul claro.
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.35,
                color: AppColors.secondaryDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// «Cúcuta, Bucaramanga y Bogotá». Con más de tres se corta: la lista
  /// completa no cabe y el detalle está a un toque, al confirmar.
  static String _enumerar(List<String> n) {
    if (n.isEmpty) return 'otras ciudades';
    if (n.length == 1) return n.first;
    if (n.length > 3) return '${n.take(3).join(', ')} y ${n.length - 3} más';
    return '${n.take(n.length - 1).join(', ')} y ${n.last}';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    // Sin votos no hay estrella ni número: «Nuevo». La nota de fábrica que
    // enseñaba un 5,0 a todo el mundo se retiró a propósito.
    final nota = business.rating == null
        ? 'Nuevo'
        : business.ratingCount > 0
            ? '${business.rating!.toStringAsFixed(1)} (${business.ratingCount})'
            : business.rating!.toStringAsFixed(1);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM, AppConstants.spacingM, AppConstants.spacingM, 0,
      ),
      // `Wrap` y no `Row`: con una nota larga o letra grande del sistema las
      // pastillas bajan de renglón en vez de montarse unas sobre otras.
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          _Pastilla(
            icono: Icons.star_rounded,
            colorIcono: business.rating == null
                ? context.textSecondaryColor
                : AppColors.star,
            texto: nota,
          ),
          _Pastilla(
            icono: Icons.schedule_rounded,
            texto: '${business.etaMinutes} min',
          ),
          _Pastilla(
            icono: Icons.delivery_dining_rounded,
            texto: business.deliveryFee == 0
                ? 'Envío gratis'
                : 'Envío ${CurrencyFormatter.format(business.deliveryFee)}',
          ),
        ],
      ),
    );
  }
}

class _Pastilla extends StatelessWidget {
  const _Pastilla({required this.icono, required this.texto, this.colorIcono});

  final IconData icono;
  final String texto;
  final Color? colorIcono;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: context.cardColor2,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.outlineColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icono, size: 16, color: colorIcono ?? context.textSecondaryColor),
          const SizedBox(width: 6),
          Text(
            texto,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.textPrimaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.anclaKey});

  final String title;

  /// El ancla a la que salta la barra de secciones. Va en el `Padding` y no
  /// en el widget para que mida el bloque entero: si colgara del `Text`, el
  /// salto dejaría el título pegado al borde de arriba.
  final Key? anclaKey;

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: anclaKey,
      padding: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingL,
        AppConstants.spacingM,
        AppConstants.spacingS,
      ),
      child: Text(
        title,
        style: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// Aviso de estado del negocio: cerrado y/o su horario de atención.
class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.business});

  final BusinessEntity business;

  @override
  Widget build(BuildContext context) {
    final closed = !business.isOpen;
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppConstants.spacingM,
        AppConstants.spacingM,
        AppConstants.spacingM,
        0,
      ),
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: closed
            ? AppColors.error.withValues(alpha: 0.08)
            : AppColors.primaryContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Row(
        children: [
          Icon(
            closed ? Icons.lock_clock_rounded : Icons.schedule_rounded,
            size: 20,
            color: closed ? AppColors.error : AppColors.primaryDim,
          ),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Text(
              // `cerradoMotivo` dice CUÁNDO vuelve («Abre mañana a las 08:00»)
              // o que está en pausa. Es lo que el cliente necesita para saber
              // si volver en una hora o buscar otro sitio; un «Cerrado» a
              // secas no le dice nada.
              closed
                  ? 'Cerrado ahora. ${business.cerradoMotivo ?? business.openingHours ?? 'Vuelve más tarde.'}'
                  : 'Horario: ${business.openingHours}',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: closed ? AppColors.error : AppColors.primaryDim,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Barra inferior que aparece cuando hay ítems en el carrito.
class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart});

  final CartState cart;

  @override
  Widget build(BuildContext context) {
    if (cart.isEmpty) return const SizedBox.shrink();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: SizedBox(
          height: 54,
          child: ElevatedButton(
            onPressed: () => context.push(AppRoutes.cart),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${cart.totalItems}',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: AppConstants.spacingM),
                const Text('Ver carrito'),
                const Spacer(),
                Text(CurrencyFormatter.format(cart.subtotal)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// El local todavía no es cliente de ZIPA: su carta la publicamos nosotros.
///
/// Lo que esto tiene que dejar claro es UNA cosa —el precio puede no ser el
/// de hoy— porque es la queja más cara que existe: «pagué 18.000 y en el
/// local son 22.000». Y la paga la plataforma, no el restaurante, que ni sabe
/// que está aquí.
class _PreciosDeReferencia extends StatelessWidget {
  const _PreciosDeReferencia({required this.negocio});

  final String negocio;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded,
              color: AppColors.warning, size: 19),
          const SizedBox(width: AppConstants.spacingS),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Precios de referencia',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimaryColor,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Esta carta la tomamos del menú de $negocio. Un repartidor '
                  'de ZIPA va, lo compra y te lo lleva: se te cobra lo que '
                  'diga el recibo.',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 12.5,
                    height: 1.35,
                    color: context.textSecondaryColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
