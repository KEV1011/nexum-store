import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:qr_flutter/qr_flutter.dart';



const _kPortalBase = 'https://nexum.app/negocio';

// ── Registered business result ───────────────────────────────────────────────

class _RegisteredBusiness {
  const _RegisteredBusiness({
    required this.name,
    required this.ownerName,
    required this.accessToken,
    required this.portalUrl,
  });

  final String name;
  final String ownerName;
  final String accessToken;
  final String portalUrl;
}

// ── Screen ───────────────────────────────────────────────────────────────────

/// Pantalla para que el conductor registre un restaurante/local en Nexum.
///
/// Flujo:
///   1. Formulario → nombre, dueño, teléfono, dirección, categoría, WhatsApp
///   2. Confirmación → genera token único
///   3. QR + link → el dueño escanea y accede al portal en tiempo real
class BusinessRegistrationScreen extends StatefulWidget {
  const BusinessRegistrationScreen({super.key});

  @override
  State<BusinessRegistrationScreen> createState() =>
      _BusinessRegistrationScreenState();
}

class _BusinessRegistrationScreenState
    extends State<BusinessRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _ownerCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _whatsappCtrl = TextEditingController();

  String _category = 'restaurant';
  bool _loading = false;

  _RegisteredBusiness? _result;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void dispose() {
    _nameCtrl.dispose();
    _ownerCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _whatsappCtrl.dispose();
    super.dispose();
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  Future<void> _register() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _loading = true);

    // Simulamos llamada al backend — en producción: POST /business/register
    await Future<void>.delayed(const Duration(milliseconds: 800));

    // Token mock: se generaría en el backend con randomUUID().slice(0,12)
    final token = '${_nameCtrl.text.toLowerCase().replaceAll(' ', '-')}-'
        '${DateTime.now().millisecondsSinceEpoch % 10000}';
    final portalUrl = '$_kPortalBase/$token';

    final result = _RegisteredBusiness(
      name: _nameCtrl.text.trim(),
      ownerName: _ownerCtrl.text.trim(),
      accessToken: token,
      portalUrl: portalUrl,
    );

    if (!mounted) return;
    setState(() {
      _loading = false;
      _result = result;
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark
          ? AppColors.backgroundDark
          : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        title: Text(
          _result == null
              ? 'Registrar negocio'
              : 'Negocio registrado',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: _result == null
          ? _buildForm(theme, isDark)
          : _buildSuccess(theme, isDark, _result!),
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  Widget _buildForm(ThemeData theme, bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _InfoBanner(theme: theme, isDark: isDark),
            const SizedBox(height: AppConstants.spacingL),

            _SectionLabel(label: 'DATOS DEL NEGOCIO', theme: theme),
            const SizedBox(height: AppConstants.spacingS),

            _Field(
              controller: _nameCtrl,
              label: 'Nombre del negocio',
              hint: 'Restaurante El Sabor Pamplonés',
              icon: Icons.storefront_rounded,
              validator: (v) =>
                  (v?.isEmpty ?? true) ? 'Campo requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingS),

            _Field(
              controller: _ownerCtrl,
              label: 'Nombre del dueño',
              hint: 'Hernán Suárez',
              icon: Icons.person_rounded,
              validator: (v) =>
                  (v?.isEmpty ?? true) ? 'Campo requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingS),

            _Field(
              controller: _addressCtrl,
              label: 'Dirección',
              hint: 'Cra. 6 #8-45, Centro, Pamplona',
              icon: Icons.location_on_rounded,
              validator: (v) =>
                  (v?.isEmpty ?? true) ? 'Campo requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingS),

            _CategoryPicker(
              value: _category,
              theme: theme,
              isDark: isDark,
              onChanged: (v) => setState(() => _category = v),
            ),
            const SizedBox(height: AppConstants.spacingL),

            _SectionLabel(label: 'CONTACTO', theme: theme),
            const SizedBox(height: AppConstants.spacingS),

            _Field(
              controller: _phoneCtrl,
              label: 'Teléfono',
              hint: '+57 310 123 4567',
              icon: Icons.phone_rounded,
              keyboardType: TextInputType.phone,
              validator: (v) =>
                  (v?.isEmpty ?? true) ? 'Campo requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingS),

            _Field(
              controller: _whatsappCtrl,
              label: 'WhatsApp (notificaciones)',
              hint: '+57 310 123 4567 (opcional)',
              icon: Icons.chat_rounded,
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: AppConstants.spacingXL),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _register,
                icon: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.qr_code_rounded),
                label: Text(
                  _loading
                      ? 'Registrando...'
                      : 'Registrar y generar QR',
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.serviceEnvios,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(
                      AppConstants.radiusMedium,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Success / QR ───────────────────────────────────────────────────────────

  Widget _buildSuccess(
    ThemeData theme,
    bool isDark,
    _RegisteredBusiness biz,
  ) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      child: Column(
        children: [
          // ── Confirmation badge ─────────────────────────────────────────
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppColors.successContainer,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_circle_rounded,
              color: AppColors.success,
              size: 36,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Text(
            biz.name,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
            textAlign: TextAlign.center,
          ),
          Text(
            'registrado en Nexum Envíos',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.serviceEnvios,
            ),
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── QR card ────────────────────────────────────────────────────
          _QrCard(
            biz: biz,
            isDark: isDark,
            theme: theme,
            onCopy: () {
              Clipboard.setData(
                ClipboardData(text: biz.portalUrl),
              );
              AppSnackbar.showSuccess(
                context,
                'Link copiado al portapapeles',
              );
            },
          ),
          const SizedBox(height: AppConstants.spacingL),

          // ── Instructions card ──────────────────────────────────────────
          _InstructionsCard(theme: theme, isDark: isDark),
          const SizedBox(height: AppConstants.spacingL),

          // ── Register another ───────────────────────────────────────────
          OutlinedButton.icon(
            onPressed: () => setState(() => _result = null),
            icon: const Icon(Icons.add_business_rounded),
            label: const Text('Registrar otro negocio'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.serviceEnvios,
              side: const BorderSide(color: AppColors.serviceEnvios),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Info banner ──────────────────────────────────────────────────────────────

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({required this.theme, required this.isDark});

  final ThemeData theme;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.serviceEnviosContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.verified_user_rounded,
                color: AppColors.serviceEnvios,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                '¿Por qué registrar el negocio?',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppColors.serviceEnvios,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ..._reasons.map(
            (r) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '•  ',
                    style: TextStyle(color: AppColors.serviceEnvios),
                  ),
                  Expanded(
                    child: Text(
                      r,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: AppColors.serviceEnvios,
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

  static const _reasons = [
    'El dueño ve en tiempo real que cada pedido salió fotografiado',
    'Recibe notificaciones WhatsApp al recoger y al entregar',
    'Elimina disputas de "el pedido no llegó" — hay prueba completa',
    'Cadena de custodia verificada: diferenciador clave vs Rappi',
  ];
}

// ── QR card ──────────────────────────────────────────────────────────────────

class _QrCard extends StatelessWidget {
  const _QrCard({
    required this.biz,
    required this.isDark,
    required this.theme,
    required this.onCopy,
  });

  final _RegisteredBusiness biz;
  final bool isDark;
  final ThemeData theme;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: AppColors.serviceEnvios.withValues(alpha: 0.4),
          width: 1.5,
        ),
      ),
      child: Column(
        children: [
          Text(
            'Muestra este QR al dueño del negocio',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Al escanearlo accede al portal en tiempo real',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // QR code
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: QrImageView(
              data: biz.portalUrl,
              size: 200,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: AppColors.serviceEnvios,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: Color(0xFF1A1A2E),
              ),
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),

          // URL
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM,
              vertical: 10,
            ),
            decoration: BoxDecoration(
              color: isDark
                  ? AppColors.surfaceVariantDark
                  : AppColors.surfaceVariantLight,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    biz.portalUrl,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                      color: AppColors.serviceEnvios,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: onCopy,
                  child: const Icon(
                    Icons.copy_rounded,
                    size: 16,
                    color: AppColors.serviceEnvios,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Token: ${biz.accessToken}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Instructions card ────────────────────────────────────────────────────────

class _InstructionsCard extends StatelessWidget {
  const _InstructionsCard({required this.theme, required this.isDark});

  final ThemeData theme;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Cómo accede el negocio',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          ..._steps.asMap().entries.map(
            (e) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 20,
                    height: 20,
                    margin: const EdgeInsets.only(right: 10, top: 1),
                    decoration: BoxDecoration(
                      color: AppColors.serviceEnviosContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        '${e.key + 1}',
                        style: const TextStyle(
                          color: AppColors.serviceEnvios,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      e.value,
                      style: theme.textTheme.bodySmall,
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

  static const _steps = [
    'Escanea el QR con la cámara del teléfono o tablet del negocio',
    'Se abre el portal en el navegador — sin descargar ninguna app',
    'Guarda el link como acceso directo en pantalla para verlo siempre',
    'Cada vez que un conductor recoja o entregue, el portal se actualiza',
  ];
}

// ── Section label ────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.theme});

  final String label;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: theme.textTheme.labelSmall?.copyWith(
        color: AppColors.textTertiary,
        fontWeight: FontWeight.w700,
        letterSpacing: 1,
      ),
    );
  }
}

// ── Text field ───────────────────────────────────────────────────────────────

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 14,
        ),
      ),
    );
  }
}

// ── Category picker ──────────────────────────────────────────────────────────

class _CategoryPicker extends StatelessWidget {
  const _CategoryPicker({
    required this.value,
    required this.theme,
    required this.isDark,
    required this.onChanged,
  });

  final String value;
  final ThemeData theme;
  final bool isDark;
  final ValueChanged<String> onChanged;

  static const _categories = {
    'restaurant': ('Restaurante', Icons.restaurant_rounded),
    'supermarket': ('Supermercado', Icons.shopping_basket_rounded),
    'pharmacy': ('Droguería/Farmacia', Icons.local_pharmacy_rounded),
    'other': ('Otro negocio', Icons.store_rounded),
  };

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      value: value,
      onChanged: (v) => onChanged(v ?? 'restaurant'),
      decoration: InputDecoration(
        labelText: 'Tipo de negocio',
        prefixIcon: const Icon(Icons.category_rounded, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: 14,
        ),
      ),
      items: _categories.entries.map(
        (e) => DropdownMenuItem(
          value: e.key,
          child: Row(
            children: [
              Icon(e.value.$2, size: 16, color: AppColors.serviceEnvios),
              const SizedBox(width: 8),
              Text(e.value.$1),
            ],
          ),
        ),
      ).toList(),
    );
  }
}
