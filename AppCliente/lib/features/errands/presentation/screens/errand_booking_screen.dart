import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/errands/presentation/providers/errand_provider.dart';

/// Tarifa base del servicio de mandado (lo que cobra el mensajero).
const double _kBaseServiceFee = 6000;

class ErrandBookingScreen extends ConsumerStatefulWidget {
  const ErrandBookingScreen({super.key});

  @override
  ConsumerState<ErrandBookingScreen> createState() =>
      _ErrandBookingScreenState();
}

class _ErrandBookingScreenState extends ConsumerState<ErrandBookingScreen> {
  ErrandCategory _category = ErrandCategory.pharmacy;
  final _descCtrl = TextEditingController();
  final _pickupCtrl = TextEditingController();
  final _dropoffCtrl = TextEditingController();
  final _budgetCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _isSubmitting = false;

  double get _budget {
    final cleaned = _budgetCtrl.text.replaceAll(RegExp(r'[^\d]'), '');
    return double.tryParse(cleaned) ?? 0;
  }

  double get _estimatedTotal => _kBaseServiceFee + _budget;

  @override
  void dispose() {
    _descCtrl.dispose();
    _pickupCtrl.dispose();
    _dropoffCtrl.dispose();
    _budgetCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_descCtrl.text.trim().length < 5) {
      _showError('Describe el mandado con más detalle.');
      return;
    }
    if (_dropoffCtrl.text.trim().isEmpty) {
      _showError('Indica a dónde quieres que te lo lleven.');
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() => _isSubmitting = true);

    final errand = ErrandEntity(
      id: 'ER_${DateTime.now().millisecondsSinceEpoch}',
      category: _category,
      description: _descCtrl.text.trim(),
      pickupAddress: _pickupCtrl.text.trim().isEmpty
          ? 'A criterio del mensajero'
          : _pickupCtrl.text.trim(),
      dropoffAddress: _dropoffCtrl.text.trim(),
      serviceFee: _kBaseServiceFee,
      purchaseBudget: _budget > 0 ? _budget : null,
      status: ErrandStatus.searching,
      createdAt: DateTime.now(),
      notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
    );

    // `active` se fija de forma síncrona en el provider antes de la llamada
    // de red; navegamos de inmediato y dejamos la solicitud en segundo plano
    // para no bloquear el botón con el timeout cuando el backend no responde.
    unawaited(ref.read(errandProvider.notifier).createErrand(errand));
    if (!mounted) return;
    context.go('/errand/status');
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = _category.color;

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text(
          'Pedir un mandado',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        centerTitle: false,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
        children: [
          // ── Intro ─────────────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: accent.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                Icon(Icons.bolt_rounded, color: accent, size: 22),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Dinos qué necesitas y un mensajero lo hace por ti. '
                    'Farmacia, mercado, pagos, recoger algo... lo que sea.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: AppColors.textSecondary,
                      height: 1.3,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // ── Categoría ─────────────────────────────────────────────────────
          _Label('¿Qué tipo de mandado?'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: ErrandCategory.values.map((c) {
              final selected = c == _category;
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _category = c);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(
                    color: selected ? c.color : AppColors.surfaceLight,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected
                          ? c.color
                          : AppColors.outlineLight,
                    ),
                    boxShadow: selected
                        ? [
                            BoxShadow(
                              color: c.color.withValues(alpha: 0.35),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        c.icon,
                        size: 16,
                        color: selected ? Colors.white : c.color,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        c.label,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: selected
                              ? Colors.white
                              : AppColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 18),

          // ── Descripción ───────────────────────────────────────────────────
          _Label('Describe el mandado'),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.outlineLight),
            ),
            child: TextField(
              controller: _descCtrl,
              maxLines: 4,
              maxLength: 280,
              textCapitalization: TextCapitalization.sentences,
              style: const TextStyle(fontSize: 14, height: 1.4),
              decoration: InputDecoration(
                hintText: _category.hint,
                hintStyle: const TextStyle(
                  color: AppColors.textTertiary,
                  fontSize: 13,
                  height: 1.4,
                ),
                contentPadding: const EdgeInsets.all(14),
                border: InputBorder.none,
                counterStyle: const TextStyle(
                    fontSize: 10, color: AppColors.textTertiary),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // ── Direcciones ───────────────────────────────────────────────────
          _Label('Recogida y entrega'),
          const SizedBox(height: 8),
          _AddressField(
            controller: _pickupCtrl,
            hint: 'Dónde se hace el mandado (opcional)',
            icon: Icons.store_mall_directory_rounded,
            iconColor: accent,
          ),
          const SizedBox(height: 8),
          _AddressField(
            controller: _dropoffCtrl,
            hint: 'Tu dirección de entrega',
            icon: Icons.home_rounded,
            iconColor: AppColors.primary,
          ),
          const SizedBox(height: 18),

          // ── Presupuesto (si la categoría implica comprar) ──────────────────
          if (_category.usuallyBuys) ...[
            _Label('Presupuesto para compras'),
            const SizedBox(height: 4),
            const Text(
              'Cuánto autorizas gastar. Te devolvemos lo que sobre y '
              'verás el costo real al final.',
              style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.outlineLight),
              ),
              child: TextField(
                controller: _budgetCtrl,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
                decoration: const InputDecoration(
                  prefixText: '\$ ',
                  prefixStyle: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textSecondary,
                  ),
                  hintText: '0',
                  hintStyle: TextStyle(color: AppColors.textTertiary),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  border: InputBorder.none,
                ),
              ),
            ),
            const SizedBox(height: 18),
          ],

          // ── Notas ─────────────────────────────────────────────────────────
          _AddressField(
            controller: _notesCtrl,
            hint: 'Notas extra para el mensajero (opcional)',
            icon: Icons.sticky_note_2_rounded,
            iconColor: AppColors.textTertiary,
            maxLines: 2,
          ),
          const SizedBox(height: 18),

          // ── Resumen de costos ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.outlineLight),
            ),
            child: Column(
              children: [
                _CostRow(
                  label: 'Servicio del mensajero',
                  value: CurrencyFormatter.format(_kBaseServiceFee),
                ),
                if (_budget > 0) ...[
                  const SizedBox(height: 6),
                  _CostRow(
                    label: 'Presupuesto de compras',
                    value: CurrencyFormatter.format(_budget),
                  ),
                ],
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Divider(height: 1),
                ),
                _CostRow(
                  label: 'Total estimado',
                  value: CurrencyFormatter.format(_estimatedTotal),
                  isBold: true,
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          MediaQuery.of(context).padding.bottom + 12,
        ),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          boxShadow: const [
            BoxShadow(
              color: AppColors.shadow,
              blurRadius: 12,
              offset: Offset(0, -3),
            ),
          ],
        ),
        child: SizedBox(
          height: 52,
          child: ElevatedButton(
            onPressed: _isSubmitting ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: accent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _isSubmitting
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.send_rounded, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Pedir mandado · ${CurrencyFormatter.format(_estimatedTotal)}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _AddressField extends StatelessWidget {
  const _AddressField({
    required this.controller,
    required this.hint,
    required this.icon,
    required this.iconColor,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final Color iconColor;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.outlineLight),
      ),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        textCapitalization: TextCapitalization.sentences,
        style: const TextStyle(fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(
            color: AppColors.textTertiary,
            fontSize: 13,
          ),
          prefixIcon: Icon(icon, size: 20, color: iconColor),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: InputBorder.none,
        ),
      ),
    );
  }
}

class _CostRow extends StatelessWidget {
  const _CostRow({
    required this.label,
    required this.value,
    this.isBold = false,
  });

  final String label;
  final String value;
  final bool isBold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isBold ? 15 : 13,
            fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
            color:
                isBold ? AppColors.textPrimary : AppColors.textSecondary,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 17 : 13,
            fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
            color: isBold ? AppColors.primary : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
