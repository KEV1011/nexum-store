import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'precio_producto.dart';
import 'package:nexum_client/features/moderacion/presentation/reportar_sheet.dart';
import 'package:nexum_client/app/theme/contraste.dart';
import 'package:nexum_client/shared/widgets/foto_encuadrada.dart';

/// Lo que el cliente armó en la hoja: qué eligió, cuántos quiere y qué le
/// quiere decir a la cocina.
class ProductChoice {
  const ProductChoice({
    required this.options,
    required this.quantity,
    this.notes,
  });

  final List<ProductOptionEntity> options;
  final int quantity;

  /// "Sin cebolla", "bien cocida". Lo que en el mostrador se dice de viva voz.
  final String? notes;
}

/// Abre la hoja para armar el producto antes de agregarlo al carrito.
/// Devuelve `null` si el cliente cerró sin confirmar.
Future<ProductChoice?> showProductOptionsSheet(
  BuildContext context,
  ProductEntity product,
) {
  return showModalBottomSheet<ProductChoice>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    // Con el teclado abierto para la nota, la hoja tiene que subir con él.
    //
    // El contexto tiene que ser el de la HOJA (`ctx`), no el de la pantalla que
    // la abre. Antes se leía `MediaQuery.of(context)` —el de fuera— y eso hacía
    // dos cosas mal: se medía una sola vez, con el teclado todavía cerrado
    // (siempre 0), y como la dependencia quedaba registrada en la pantalla de
    // abajo, abrir el teclado no repintaba la hoja. El resultado era que la
    // hoja no subía nunca y el campo de la nota quedaba tapado justo al ir a
    // escribir en él. `viewInsetsOf` se suscribe solo a los insets.
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
      child: _ProductOptionsSheet(product: product),
    ),
  );
}

class _ProductOptionsSheet extends StatefulWidget {
  const _ProductOptionsSheet({required this.product});

  final ProductEntity product;

  @override
  State<_ProductOptionsSheet> createState() => _ProductOptionsSheetState();
}

class _ProductOptionsSheetState extends State<_ProductOptionsSheet> {
  // Selección por grupo: conjunto de ids de opción elegidos.
  final Map<String, Set<String>> _selected = {};
  final _nota = TextEditingController();
  int _cantidad = 1;

  @override
  void dispose() {
    _nota.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    // Pre-selecciona la primera opción de los grupos obligatorios de selección
    // única (para que siempre haya una elección válida por defecto).
    for (final g in widget.product.optionGroups) {
      if (g.required && g.isSingle && g.options.isNotEmpty) {
        _selected[g.id] = {g.options.first.id};
      }
    }
  }

  void _toggle(OptionGroupEntity g, ProductOptionEntity o) {
    setState(() {
      final set = _selected.putIfAbsent(g.id, () => <String>{});
      if (g.isSingle) {
        set
          ..clear()
          ..add(o.id);
      } else {
        if (set.contains(o.id)) {
          set.remove(o.id);
        } else if (set.length < g.maxSelect) {
          set.add(o.id);
        }
      }
    });
  }

  List<ProductOptionEntity> get _chosen {
    final result = <ProductOptionEntity>[];
    for (final g in widget.product.optionGroups) {
      final ids = _selected[g.id] ?? const {};
      for (final o in g.options) {
        if (ids.contains(o.id)) result.add(o);
      }
    }
    return result;
  }

  /// El primer grupo obligatorio sin cumplir, o null si está todo listo.
  ///
  /// Devuelve el grupo y no un booleano a propósito: un botón apagado sin
  /// decir por qué deja al cliente adivinando, y ese es el momento en que
  /// abandona el pedido.
  OptionGroupEntity? get _faltaElegir {
    for (final g in widget.product.optionGroups) {
      final count = (_selected[g.id] ?? const {}).length;
      final min = g.required && g.minSelect < 1 ? 1 : g.minSelect;
      if (count < min) return g;
    }
    return null;
  }

  double get _unitario =>
      widget.product.price + _chosen.fold(0.0, (s, o) => s + o.priceDelta);

  double get _total => _unitario * _cantidad;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final falta = _faltaElegir;
    // El alto disponible descuenta el teclado: la hoja ya está desplazada
    // hacia arriba por ese mismo alto, así que medir contra la pantalla
    // completa la haría más alta que el hueco que le queda y el contenido se
    // desbordaría por abajo.
    final media = MediaQuery.of(context);
    final disponible = media.size.height - media.viewInsets.bottom;
    return Container(
      constraints: BoxConstraints(maxHeight: disponible * 0.9),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : context.surfaceColor,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppConstants.radiusLarge),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: context.outlineColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppConstants.spacingM),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.product.name,
                    // Tope de tres renglones. Lo normal es que el nombre
                    // quepa en uno —los ingredientes van en `description`,
                    // que se pinta debajo—, pero un dueño puede teclear a
                    // mano un nombre larguísimo y sin tope la cabecera se
                    // come media hoja antes de que se vea el precio. Con
                    // elipsis, porque el nombre completo está en la lista de
                    // la que se viene.
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                // Reportar el producto. Es la última superficie de contenido
                // de usuario que quedaba sin cablear: el nombre, la
                // descripción y la foto los publica el dueño del comercio, no
                // nosotros, y Apple 1.2 pide poder reportar todo lo que
                // publica un tercero.
                //
                // `Consumer` porque esta hoja es un StatefulWidget normal y
                // `mostrarReporte` necesita un `WidgetRef`.
                Consumer(
                  builder: (ctx, ref, _) => IconButton(
                    icon: const Icon(Icons.flag_outlined),
                    tooltip: 'Reportar este producto',
                    onPressed: () async {
                      final enviado = await mostrarReporte(
                        ctx,
                        ref,
                        tipo: 'product',
                        objetivoId: widget.product.id,
                        queSeReporta: 'este producto',
                        // Sin bloqueo: no se vuelve a coincidir con un
                        // producto, así que la casilla no evitaría nada.
                      );
                      if (enviado && ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Gracias. Lo revisa una persona del equipo.',
                            ),
                          ),
                        );
                      }
                    },
                  ),
                ),
                IconButton(
                  tooltip: 'Cerrar',
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(
                horizontal: AppConstants.spacingM,
              ),
              children: [
                // ── Lo que la hoja NO pintaba ─────────────────────────────
                //
                // Estos cuatro datos llegaban del servidor en cada carga del
                // catálogo y esta pantalla los ignoraba: foto, galería,
                // descripción y el precio rebajado. Por eso la hoja era un
                // título, una nota y un botón, mientras el LISTADO de la misma
                // carta sí pintaba el tachado y el porcentaje.
                _FotosDelPlato(fotos: widget.product.allPhotos),
                if (widget.product.masPedidoPuesto != null) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: InsigniaMasPedido(
                      puesto: widget.product.masPedidoPuesto!,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                // `grande: true` existía en `PrecioProducto` desde que se
                // escribió —su comentario dice «el detalle lo pinta grande»— y
                // nadie lo usaba. Es la misma función que la carta, así que el
                // «-46 %» del listado y el del detalle no pueden discrepar.
                Align(
                  alignment: Alignment.centerLeft,
                  child: PrecioProducto(product: widget.product, grande: true),
                ),
                if (widget.product.description.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _Descripcion(texto: widget.product.description.trim()),
                ],
                const SizedBox(height: 4),
                for (final g in widget.product.optionGroups)
                  _GroupSection(
                    group: g,
                    selected: _selected[g.id] ?? const {},
                    onTap: (o) => _toggle(g, o),
                  ),
                const SizedBox(height: 18),
                Text(
                  'Algo para la cocina',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimaryColor,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _nota,
                  maxLength: 140,
                  maxLines: 2,
                  minLines: 1,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    hintText: 'Sin cebolla, bien cocida…',
                    counterText: '',
                    filled: true,
                    fillColor: context.surfaceVariantColor,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: Row(
                children: [
                  _ContadorCantidad(
                    cantidad: _cantidad,
                    onCambio: (v) => setState(() => _cantidad = v),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: falta == null
                            ? () => Navigator.of(context).pop(
                                  ProductChoice(
                                    options: _chosen,
                                    quantity: _cantidad,
                                    notes: _nota.text.trim().isEmpty
                                        ? null
                                        : _nota.text.trim(),
                                  ),
                                )
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: colorDeTextoSobre(AppColors.primary),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          // Cuando falta algo, se dice QUÉ falta.
                          falta == null
                              ? 'Agregar · ${CurrencyFormatter.format(_total)}'
                              : 'Elige ${falta.name.toLowerCase()}',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupSection extends StatelessWidget {
  const _GroupSection({
    required this.group,
    required this.selected,
    required this.onTap,
  });

  final OptionGroupEntity group;
  final Set<String> selected;
  final void Function(ProductOptionEntity) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: AppConstants.spacingS),
        Row(
          children: [
            Text(
              group.name,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 8),
            // UNA sola frase, la que redacta el servidor: «Obligatorio · elige
            // 1», «Opcional · hasta 10». Antes eran dos insignias sueltas
            // —«Obligatorio» y «Hasta 3»— que no decían el mínimo, así que un
            // grupo de «elige entre 2 y 4» se leía como «hasta 4» y el pedido
            // se rechazaba en la caja sin que nada lo hubiera anunciado.
            if (group.label.isNotEmpty)
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: group.required
                        ? AppColors.primaryContainer
                        : context.zHundida,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    group.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: group.required
                          ? AppColors.primaryDim
                          : context.textSecondaryColor,
                    ),
                  ),
                ),
              )
            // Backend viejo: no manda `label`. Se cae a lo de siempre en vez
            // de dejar el hueco.
            else if (group.required)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'Obligatorio',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryDim,
                  ),
                ),
              ),
            const Spacer(),
            if (group.label.isEmpty && !group.isSingle)
              Text(
                'Hasta ${group.maxSelect}',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 12,
                  color: context.textSecondaryColor,
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        for (final o in group.options)
          _OptionRow(
            option: o,
            isSingle: group.isSingle,
            isSelected: selected.contains(o.id),
            onTap: o.isAvailable ? () => onTap(o) : null,
          ),
        const Divider(height: AppConstants.spacingL),
      ],
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.isSingle,
    required this.isSelected,
    required this.onTap,
  });

  final ProductOptionEntity option;
  final bool isSingle;
  final bool isSelected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(
              isSingle
                  ? (isSelected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded)
                  : (isSelected
                      ? Icons.check_box_rounded
                      : Icons.check_box_outline_blank_rounded),
              color: isSelected ? AppColors.primary : context.textTertiaryColor,
              size: 22,
            ),
            const SizedBox(width: AppConstants.spacingM),
            Expanded(
              child: Text(
                disabled ? '${option.name} (agotado)' : option.name,
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 14,
                  color: disabled ? context.textTertiaryColor : null,
                ),
              ),
            ),
            if (option.priceDelta > 0)
              Text(
                '+${CurrencyFormatter.format(option.priceDelta)}',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.textSecondaryColor,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Menos / cantidad / más. Pedir dos hamburguesas iguales con las mismas
/// opciones era, hasta ahora, armarlas dos veces desde cero.
class _ContadorCantidad extends StatelessWidget {
  const _ContadorCantidad({required this.cantidad, required this.onCambio});

  final int cantidad;
  final ValueChanged<int> onCambio;

  static const _max = 30;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Boton(
            icono: Icons.remove_rounded,
            // Bajar de uno no quita el producto: para eso está cerrar la hoja.
            onTap: cantidad > 1 ? () => onCambio(cantidad - 1) : null,
          ),
          SizedBox(
            width: 30,
            child: Text(
              '$cantidad',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: context.textPrimaryColor,
              ),
            ),
          ),
          _Boton(
            icono: Icons.add_rounded,
            onTap: cantidad < _max ? () => onCambio(cantidad + 1) : null,
          ),
        ],
      ),
    );
  }
}

class _Boton extends StatelessWidget {
  const _Boton({required this.icono, this.onTap});

  final IconData icono;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: SizedBox(
        width: 42,
        height: 52,
        child: Icon(
          icono,
          size: 20,
          color: onTap == null
              ? context.textSecondaryColor.withValues(alpha: .35)
              : context.textPrimaryColor,
        ),
      ),
    );
  }
}

/// Las fotos del plato, deslizables si hay más de una.
///
/// **Sin foto no se dibuja nada.** Un rectángulo gris de doscientos píxeles se
/// lee como «la app no cargó» y empuja la descripción fuera de la pantalla:
/// es peor que no tener foto. Mismo criterio que el carrusel del inicio, que
/// solo admite comercios con portada.
class _FotosDelPlato extends StatefulWidget {
  const _FotosDelPlato({required this.fotos});

  final List<String> fotos;

  @override
  State<_FotosDelPlato> createState() => _FotosDelPlatoState();
}

class _FotosDelPlatoState extends State<_FotosDelPlato> {
  int _actual = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.fotos.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          child: SizedBox(
            height: 190,
            width: double.infinity,
            child: PageView.builder(
              itemCount: widget.fotos.length,
              onPageChanged: (i) => setState(() => _actual = i),
              // La foto del plato, ENTERA. En el detalle es donde se mira
              // qué trae el plato, así que recortarla es justo lo que no se
              // puede hacer — es el mismo arreglo que ya se hizo en la carta
              // del QR, donde el listado se queda en `cover` y el detalle no.
              itemBuilder: (_, i) => FotoEncuadrada(
                url: ApiConfig.resolveUrl(widget.fotos[i]),
                // Una foto caída no deja un hueco roto: se retira el bloque y
                // la hoja sigue siendo legible. Pasa de verdad mientras las
                // fotos vivan en el disco efímero del servidor.
                fallback: const SizedBox.shrink(),
              ),
            ),
          ),
        ),
        if (widget.fotos.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < widget.fotos.length; i++)
                Container(
                  width: i == _actual ? 18 : 6,
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: i == _actual
                        ? AppColors.primary
                        : context.outlineColor,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// La descripción del plato, con «Ver más» cuando es larga.
///
/// Se recorta a tres renglones y no a un número de caracteres: lo que importa
/// es cuánto ocupa en la pantalla, que es distinto en cada teléfono.
class _Descripcion extends StatefulWidget {
  const _Descripcion({required this.texto});

  final String texto;

  @override
  State<_Descripcion> createState() => _DescripcionState();
}

class _DescripcionState extends State<_Descripcion> {
  bool _abierta = false;

  @override
  Widget build(BuildContext context) {
    final estilo = TextStyle(
      fontFamily: 'Inter',
      fontSize: 14,
      height: 1.4,
      color: context.textSecondaryColor,
    );
    return LayoutBuilder(
      builder: (ctx, c) {
        // ¿Cabe entera en tres renglones? Si cabe, no se ofrece «Ver más»:
        // un enlace que no despliega nada se toca una vez y no se vuelve a
        // creer.
        final tp = TextPainter(
          text: TextSpan(text: widget.texto, style: estilo),
          maxLines: 3,
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: c.maxWidth);
        final recortada = tp.didExceedMaxLines;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.texto,
              style: estilo,
              maxLines: _abierta ? null : 3,
              overflow: _abierta ? null : TextOverflow.ellipsis,
            ),
            if (recortada)
              GestureDetector(
                onTap: () => setState(() => _abierta = !_abierta),
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _abierta ? 'Ver menos' : 'Ver más',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
