import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

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
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
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
                          foregroundColor: Colors.white,
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
            if (group.required)
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
            if (!group.isSingle)
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
