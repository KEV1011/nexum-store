import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/master_product_entity.dart';
import 'package:nexum_driver/features/business_portal/presentation/providers/business_portal_provider.dart';

/// Flujo adaptativo para agregar productos:
/// - Restaurantes → entrada manual (plato único, sin código de barras).
/// - Farmacia / Supermercado → escáner de código de barras + catálogo maestro.
///   Al escanear, autocompleta nombre/categoría; el negocio solo pone precio
///   y stock. Si el EAN no existe, lo crea (y queda para todos los negocios).
class AddProductScreen extends ConsumerStatefulWidget {
  const AddProductScreen({super.key, this.businessId = 'default_business'});

  final String businessId;

  @override
  ConsumerState<AddProductScreen> createState() => _AddProductScreenState();
}

enum _Mode { scan, manual }

enum _Step { input, found, create }

class _AddProductScreenState extends ConsumerState<AddProductScreen> {
  late _Mode _mode;
  _Step _step = _Step.input;

  final _barcodeCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _stockCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _brandCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _category = 'General';

  MasterProductEntity? _foundMaster;
  bool _busy = false;
  bool _scannerActive = true;

  bool get _isFoodBusiness {
    final cat = ref
            .read(businessSettingsProvider)
            .valueOrNull
            ?.category
            .toLowerCase() ??
        '';
    return cat.contains('restaur') || cat.contains('comid');
  }

  @override
  void initState() {
    super.initState();
    // Decide el modo por defecto según el tipo de negocio.
    _mode = _Mode.scan; // ajustado en didChangeDependencies
  }

  bool _initialized = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      _mode = _isFoodBusiness ? _Mode.manual : _Mode.scan;
      setState(() {});
    }
  }

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    _priceCtrl.dispose();
    _stockCtrl.dispose();
    _nameCtrl.dispose();
    _brandCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  Future<void> _onBarcodeDetected(String code) async {
    if (_busy || _step != _Step.input) return;
    setState(() {
      _busy = true;
      _scannerActive = false;
    });
    unawaited(HapticFeedback.mediumImpact());

    final master = await ref
        .read(catalogDataSourceProvider)
        .lookupBarcode(code);

    if (!mounted) return;
    setState(() {
      _busy = false;
      _barcodeCtrl.text = code;
      if (master != null) {
        _foundMaster = master;
        _category = master.category;
        _step = _Step.found;
      } else {
        _step = _Step.create;
      }
    });
  }

  Future<void> _save({required bool fromMaster}) async {
    final price = double.tryParse(_priceCtrl.text.replaceAll(RegExp(r'[^\d]'), ''));
    if (price == null || price <= 0) {
      AppSnackbar.showError(context, 'Ingresa un precio válido');
      return;
    }
    final stock = int.tryParse(_stockCtrl.text.trim());

    if (!fromMaster && _mode == _Mode.manual && _nameCtrl.text.trim().isEmpty) {
      AppSnackbar.showError(context, 'Ingresa el nombre del producto');
      return;
    }
    if (_step == _Step.create && _nameCtrl.text.trim().isEmpty) {
      AppSnackbar.showError(context, 'Ingresa el nombre del producto');
      return;
    }

    setState(() => _busy = true);

    final product = await ref.read(catalogDataSourceProvider).addProduct(
          businessId: widget.businessId,
          price: price,
          stock: stock,
          barcode: fromMaster
              ? _foundMaster?.barcode
              : (_step == _Step.create ? _barcodeCtrl.text.trim() : null),
          name: fromMaster ? null : _nameCtrl.text.trim(),
          masterName: _step == _Step.create ? _nameCtrl.text.trim() : null,
          brand: _brandCtrl.text.trim().isEmpty ? null : _brandCtrl.text.trim(),
          description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
          category: _category,
        );

    if (!mounted) return;
    setState(() => _busy = false);

    if (product != null) {
      ref.read(businessProductsProvider.notifier).addLocal(product);
      AppSnackbar.showSuccess(context, '${product.name} agregado');
      Navigator.of(context).pop();
    } else {
      AppSnackbar.showError(context, 'No se pudo agregar el producto');
    }
  }

  void _reset() {
    setState(() {
      _step = _Step.input;
      _foundMaster = null;
      _scannerActive = true;
      _barcodeCtrl.clear();
      _priceCtrl.clear();
      _stockCtrl.clear();
      _nameCtrl.clear();
      _brandCtrl.clear();
      _descCtrl.clear();
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        title: Text(
          'Agregar producto',
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        actions: [
          if (_step != _Step.input)
            TextButton(onPressed: _reset, child: const Text('Otro')),
        ],
      ),
      body: switch (_step) {
        _Step.input => _buildInput(theme, isDark),
        _Step.found => _buildFound(theme, isDark),
        _Step.create => _buildCreate(theme, isDark),
      },
    );
  }

  // ── Step: input (scan o manual) ──────────────────────────────────────────────

  Widget _buildInput(ThemeData theme, bool isDark) {
    return Column(
      children: [
        // Mode toggle
        Padding(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          child: SegmentedButton<_Mode>(
            segments: const [
              ButtonSegment(value: _Mode.scan, icon: Icon(Icons.qr_code_scanner_rounded), label: Text('Escanear')),
              ButtonSegment(value: _Mode.manual, icon: Icon(Icons.edit_rounded), label: Text('Manual')),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() {
              _mode = s.first;
              _scannerActive = _mode == _Mode.scan;
            }),
          ),
        ),
        Expanded(
          child: _mode == _Mode.scan
              ? _buildScanner(theme, isDark)
              : _buildManualForm(theme, isDark),
        ),
      ],
    );
  }

  Widget _buildScanner(ThemeData theme, bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
      child: Column(
        children: [
          // Camera viewport
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (_scannerActive)
                    MobileScanner(
                      onDetect: (capture) {
                        final code = capture.barcodes
                            .map((b) => b.rawValue)
                            .firstWhere((v) => v != null && v.isNotEmpty, orElse: () => null);
                        if (code != null) _onBarcodeDetected(code);
                      },
                      errorBuilder: (context, error, _) =>
                          _scannerUnavailable(theme),
                    )
                  else
                    Container(color: Colors.black),
                  // Overlay marco
                  Center(
                    child: Container(
                      width: 240,
                      height: 140,
                      decoration: BoxDecoration(
                        border: Border.all(color: AppColors.serviceEnvios, width: 3),
                        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                      ),
                    ),
                  ),
                  if (_busy)
                    Container(
                      color: Colors.black54,
                      child: const Center(child: CircularProgressIndicator()),
                    ),
                  Positioned(
                    bottom: 12,
                    left: 0,
                    right: 0,
                    child: Text(
                      'Apunta al código de barras',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          // Manual barcode fallback (web / sin cámara)
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _barcodeCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'O escribe el código de barras',
                    prefixIcon: const Icon(Icons.numbers_rounded, size: 20),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _busy
                      ? null
                      : () {
                          final code = _barcodeCtrl.text.trim();
                          if (code.isNotEmpty) _onBarcodeDetected(code);
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.serviceEnvios,
                    foregroundColor: Colors.white,
                  ),
                  child: const Icon(Icons.search_rounded),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingM),
        ],
      ),
    );
  }

  Widget _scannerUnavailable(ThemeData theme) {
    return Container(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_rounded, color: Colors.white54, size: 40),
            const SizedBox(height: 8),
            Text(
              'Cámara no disponible aquí.\nEscribe el código abajo.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }

  // ── Step: found (autocompletado del maestro) ──────────────────────────────────

  Widget _buildFound(ThemeData theme, bool isDark) {
    final m = _foundMaster!;
    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            color: AppColors.successContainer.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
            border: Border.all(color: AppColors.success.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.serviceEnviosContainer,
                  borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
                ),
                child: const Icon(Icons.inventory_2_rounded, color: AppColors.serviceEnvios),
              ),
              const SizedBox(width: AppConstants.spacingM),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      const Icon(Icons.check_circle_rounded, size: 14, color: AppColors.success),
                      const SizedBox(width: 4),
                      Text('Encontrado en catálogo',
                          style: theme.textTheme.labelSmall?.copyWith(
                              color: AppColors.success, fontWeight: FontWeight.w700)),
                    ]),
                    Text(m.name, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                    Text('${m.brand ?? ''}${m.presentation != null ? ' · ${m.presentation}' : ''}',
                        style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary)),
                    Text('EAN: ${m.barcode}',
                        style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textTertiary)),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (m.requiresRx) ...[
          const SizedBox(height: AppConstants.spacingS),
          _RxWarning(theme: theme, invima: m.invimaCode),
        ],
        const SizedBox(height: AppConstants.spacingL),
        _priceStockFields(theme),
        const SizedBox(height: AppConstants.spacingL),
        _saveButton(theme, label: 'Agregar a mi catálogo', onTap: () => _save(fromMaster: true)),
      ],
    );
  }

  // ── Step: create (EAN nuevo) ─────────────────────────────────────────────────

  Widget _buildCreate(ThemeData theme, bool isDark) {
    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        Container(
          padding: const EdgeInsets.all(AppConstants.spacingM),
          decoration: BoxDecoration(
            color: AppColors.warningContainer.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          ),
          child: Row(children: [
            const Icon(Icons.add_box_rounded, color: AppColors.warning, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Código nuevo (${_barcodeCtrl.text}). Completa los datos — quedará '
                'disponible para todos los negocios.',
                style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
              ),
            ),
          ]),
        ),
        const SizedBox(height: AppConstants.spacingL),
        TextField(
          controller: _nameCtrl,
          decoration: _dec('Nombre del producto', Icons.label_rounded),
        ),
        const SizedBox(height: AppConstants.spacingS),
        TextField(
          controller: _brandCtrl,
          decoration: _dec('Marca (opcional)', Icons.business_rounded),
        ),
        const SizedBox(height: AppConstants.spacingS),
        _categoryDropdown(theme),
        const SizedBox(height: AppConstants.spacingL),
        _priceStockFields(theme),
        const SizedBox(height: AppConstants.spacingL),
        _saveButton(theme, label: 'Crear y agregar', onTap: () => _save(fromMaster: false)),
      ],
    );
  }

  // ── Manual form (restaurante) ─────────────────────────────────────────────────

  Widget _buildManualForm(ThemeData theme, bool isDark) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM),
      children: [
        TextField(controller: _nameCtrl, decoration: _dec('Nombre del producto', Icons.restaurant_menu_rounded)),
        const SizedBox(height: AppConstants.spacingS),
        TextField(
          controller: _descCtrl,
          maxLines: 2,
          decoration: _dec('Descripción (opcional)', Icons.notes_rounded),
        ),
        const SizedBox(height: AppConstants.spacingS),
        _categoryDropdown(theme),
        const SizedBox(height: AppConstants.spacingL),
        TextField(
          controller: _priceCtrl,
          keyboardType: TextInputType.number,
          decoration: _dec('Precio (COP)', Icons.attach_money_rounded),
        ),
        const SizedBox(height: AppConstants.spacingL),
        _saveButton(theme, label: 'Agregar al menú', onTap: () => _save(fromMaster: false)),
      ],
    );
  }

  // ── Shared widgets ────────────────────────────────────────────────────────────

  Widget _priceStockFields(ThemeData theme) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: TextField(
            controller: _priceCtrl,
            keyboardType: TextInputType.number,
            decoration: _dec('Precio (COP)', Icons.attach_money_rounded),
          ),
        ),
        const SizedBox(width: AppConstants.spacingS),
        Expanded(
          child: TextField(
            controller: _stockCtrl,
            keyboardType: TextInputType.number,
            decoration: _dec('Stock', Icons.inventory_rounded),
          ),
        ),
      ],
    );
  }

  Widget _categoryDropdown(ThemeData theme) {
    const cats = [
      'General', 'Bebidas', 'Granos', 'Aceites', 'Café', 'Aseo',
      'Medicamentos', 'Mecato', 'Platos fuertes', 'Sopas', 'Bebidas calientes',
      'Postres', 'Combos',
    ];
    final value = cats.contains(_category) ? _category : 'General';
    return DropdownButtonFormField<String>(
      value: value,
      decoration: _dec('Categoría', Icons.category_rounded),
      items: cats.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
      onChanged: (v) => setState(() => _category = v ?? 'General'),
    );
  }

  Widget _saveButton(ThemeData theme, {required String label, required VoidCallback onTap}) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: _busy ? null : onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.serviceEnvios,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppConstants.radiusMedium)),
        ),
        child: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(label),
      ),
    );
  }

  InputDecoration _dec(String label, IconData icon) => InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppConstants.radiusMedium)),
        contentPadding: const EdgeInsets.symmetric(horizontal: AppConstants.spacingM, vertical: 14),
      );
}

class _RxWarning extends StatelessWidget {
  const _RxWarning({required this.theme, this.invima});
  final ThemeData theme;
  final String? invima;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        decoration: BoxDecoration(
          color: AppColors.errorContainer.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
          border: Border.all(color: AppColors.error.withValues(alpha: 0.4)),
        ),
        child: Row(children: [
          const Icon(Icons.medical_information_rounded, color: AppColors.error, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Requiere fórmula médica',
                    style: theme.textTheme.labelMedium?.copyWith(color: AppColors.error, fontWeight: FontWeight.w700)),
                Text(
                  'El cliente deberá presentar fórmula al recibir.${invima != null ? ' $invima' : ''}',
                  style: theme.textTheme.bodySmall?.copyWith(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        ]),
      );
}
