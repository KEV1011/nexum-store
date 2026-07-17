import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Abre la hoja para elegir las opciones/variantes de un producto antes de
/// agregarlo al carrito. Devuelve la lista de opciones elegidas, o `null` si el
/// cliente cerró sin confirmar.
Future<List<ProductOptionEntity>?> showProductOptionsSheet(
  BuildContext context,
  ProductEntity product,
) {
  return showModalBottomSheet<List<ProductOptionEntity>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ProductOptionsSheet(product: product),
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

  /// Todos los grupos obligatorios cumplen su mínimo de selecciones.
  bool get _isValid {
    for (final g in widget.product.optionGroups) {
      final count = (_selected[g.id] ?? const {}).length;
      final min = g.required && g.minSelect < 1 ? 1 : g.minSelect;
      if (count < min) return false;
    }
    return true;
  }

  double get _total =>
      widget.product.price + _chosen.fold(0.0, (s, o) => s + o.priceDelta);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
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
                const SizedBox(height: 8),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppConstants.spacingM),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isValid
                      ? () => Navigator.of(context).pop(_chosen)
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    _isValid
                        ? 'Agregar · ${CurrencyFormatter.format(_total)}'
                        : 'Elige las opciones requeridas',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ),
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
