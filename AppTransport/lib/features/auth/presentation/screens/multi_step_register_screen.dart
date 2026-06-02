import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/domain/entities/user_account_entity.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

// ── Colombian banks & vehicle brands ─────────────────────────────────────────

const _banks = [
  'Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA Colombia',
  'Banco Popular', 'Banco Agrario', 'Nequi', 'Daviplata',
  'Banco Caja Social', 'Otro',
];

const _carBrands = [
  'Chevrolet', 'Renault', 'Kia', 'Hyundai', 'Toyota',
  'Mazda', 'Nissan', 'Volkswagen', 'Ford', 'Suzuki', 'Otro',
];

const _motoBrands = [
  'Honda', 'Yamaha', 'Suzuki', 'AKT', 'Bera', 'Auteco',
  'Royal Enfield', 'KTM', 'Kawasaki', 'TVS', 'Otro',
];

// ── Screen ────────────────────────────────────────────────────────────────────

class MultiStepRegisterScreen extends ConsumerStatefulWidget {
  const MultiStepRegisterScreen({
    super.key,
    required this.identifier,
    required this.roleValue,
  });

  final String identifier;
  final String roleValue; // driver_car | driver_moto | business

  @override
  ConsumerState<MultiStepRegisterScreen> createState() =>
      _MultiStepRegisterScreenState();
}

class _MultiStepRegisterScreenState
    extends ConsumerState<MultiStepRegisterScreen> {
  final _pageCtrl = PageController();
  int _step = 0;

  UserRole get _role => UserRole.fromApi(widget.roleValue);

  // Step 0 — Password
  final _pwCtrl = TextEditingController();
  final _pw2Ctrl = TextEditingController();
  bool _obscurePw = true;
  final _step0Key = GlobalKey<FormState>();

  // Step 1 — Personal / Company
  final _nameCtrl = TextEditingController();
  final _docNumberCtrl = TextEditingController();
  String _docType = 'CC';
  // Business only
  final _nitCtrl = TextEditingController();
  final _legalRepCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _step1Key = GlobalKey<FormState>();

  // Step 2 — Vehicle / Contact
  String _vehicleBrand = _carBrands.first;
  final _vehicleModelCtrl = TextEditingController();
  final _vehicleYearCtrl = TextEditingController();
  final _vehiclePlateCtrl = TextEditingController();
  final _vehicleColorCtrl = TextEditingController();
  String _vehicleType = 'particular';
  final _ccCtrl = TextEditingController(); // moto only
  // Business contact
  final _contactEmailCtrl = TextEditingController();
  final _contactPhoneCtrl = TextEditingController();
  final _step2Key = GlobalKey<FormState>();

  // Step 3 — Bank
  String _bankName = _banks.first;
  String _bankAccountType = 'Ahorros';
  final _bankNumCtrl = TextEditingController();
  final _step3Key = GlobalKey<FormState>();

  static const _stepTitles = ['Contraseña', 'Datos', 'Vehículo', 'Banco'];
  static const _stepTitlesBusiness = ['Contraseña', 'Empresa', 'Contacto', 'Banco'];

  List<String> get _titles =>
      _role == UserRole.business ? _stepTitlesBusiness : _stepTitles;

  @override
  void dispose() {
    _pageCtrl.dispose();
    _pwCtrl.dispose(); _pw2Ctrl.dispose();
    _nameCtrl.dispose(); _docNumberCtrl.dispose();
    _nitCtrl.dispose(); _legalRepCtrl.dispose(); _addressCtrl.dispose();
    _vehicleModelCtrl.dispose(); _vehicleYearCtrl.dispose();
    _vehiclePlateCtrl.dispose(); _vehicleColorCtrl.dispose(); _ccCtrl.dispose();
    _contactEmailCtrl.dispose(); _contactPhoneCtrl.dispose();
    _bankNumCtrl.dispose();
    super.dispose();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  void _next() {
    final valid = switch (_step) {
      0 => _step0Key.currentState?.validate() ?? false,
      1 => _step1Key.currentState?.validate() ?? false,
      2 => _step2Key.currentState?.validate() ?? false,
      _ => false,
    };
    if (!valid) return;

    _pageCtrl.nextPage(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeInOutCubic,
    );
  }

  void _prev() {
    _pageCtrl.previousPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOutCubic,
    );
  }

  Future<void> _submit() async {
    if (!(_step3Key.currentState?.validate() ?? false)) return;
    unawaited(HapticFeedback.mediumImpact());

    final profileData = <String, dynamic>{
      if (_role != UserRole.business) ...{
        'fullName': _nameCtrl.text.trim(),
        'documentType': _docType,
        'documentNumber': _docNumberCtrl.text.trim(),
        'vehicleBrand': _vehicleBrand,
        'vehicleModel': _vehicleModelCtrl.text.trim(),
        'vehicleYear': int.tryParse(_vehicleYearCtrl.text.trim()) ?? 0,
        'vehiclePlate': _vehiclePlateCtrl.text.trim().toUpperCase(),
        'vehicleColor': _vehicleColorCtrl.text.trim(),
        'vehicleType':
            _role == UserRole.driverMoto ? 'moto' : _vehicleType,
        if (_role == UserRole.driverMoto)
          'cylinderCc': int.tryParse(_ccCtrl.text.trim()) ?? 0,
      } else ...{
        'companyName': _nameCtrl.text.trim(),
        'nit': _nitCtrl.text.trim(),
        'legalRep': _legalRepCtrl.text.trim(),
        'address': _addressCtrl.text.trim(),
        'contactEmail': _contactEmailCtrl.text.trim(),
        'contactPhone': _contactPhoneCtrl.text.trim(),
      },
      'bankName': _bankName,
      'bankAccountType': _bankAccountType,
      'bankAccountNumber': _bankNumCtrl.text.trim(),
    };

    await ref.read(authProvider.notifier).registerWithRole(
          identifier: widget.identifier,
          password: _pwCtrl.text,
          role: widget.roleValue,
          profileData: profileData,
        );
  }

  void _handleAuthState(AuthState? _, AuthState current) {
    if (!mounted) return;
    if (current is AuthAuthenticated) {
      context.go('/home');
      return;
    }
    if (current is AuthError) {
      AppSnackbar.showError(context, current.failure.message);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, _handleAuthState);
    final isLoading = ref.watch(authProvider) is AuthLoading;

    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: _step > 0
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded,
                    size: 18, color: AppColors.textPrimary),
                onPressed: isLoading ? null : _prev,
              )
            : IconButton(
                icon: const Icon(Icons.close_rounded,
                    size: 22, color: AppColors.textPrimary),
                onPressed: () => context.pop(),
              ),
        title: Text(
          _role.displayName,
          style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary),
        ),
        centerTitle: true,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: _ProgressBar(step: _step, titles: _titles),
        ),
      ),
      body: PageView(
        controller: _pageCtrl,
        physics: const NeverScrollableScrollPhysics(),
        onPageChanged: (i) => setState(() => _step = i),
        children: [
          _step0Password(isLoading: isLoading),
          if (_role == UserRole.business)
            _step1Business(isLoading: isLoading)
          else
            _step1Personal(isLoading: isLoading),
          if (_role == UserRole.business)
            _step2Contact(isLoading: isLoading)
          else
            _step2Vehicle(isLoading: isLoading),
          _step3Bank(isLoading: isLoading),
        ],
      ),
    );
  }

  // ── Step 0: Password ───────────────────────────────────────────────────────

  Widget _step0Password({required bool isLoading}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step0Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.lock_rounded,
              title: 'Crea tu contraseña',
              subtitle: 'Mínimo 8 caracteres con letras y números.',
            ),
            const SizedBox(height: 24),
            _FormField(
              controller: _pwCtrl,
              label: 'Contraseña',
              hint: 'Mínimo 8 caracteres',
              obscure: _obscurePw,
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePw
                      ? Icons.visibility_off_rounded
                      : Icons.visibility_rounded,
                  color: AppColors.inputBorder,
                  size: 20,
                ),
                onPressed: () => setState(() => _obscurePw = !_obscurePw),
              ),
              validator: (v) {
                if (v == null || v.length < 8) return 'Mínimo 8 caracteres';
                if (!RegExp(r'[0-9]').hasMatch(v)) {
                  return 'Incluye al menos un número';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _pw2Ctrl,
              label: 'Confirmar contraseña',
              hint: 'Repite la contraseña',
              obscure: _obscurePw,
              validator: (v) {
                if (v != _pwCtrl.text) return 'Las contraseñas no coinciden';
                return null;
              },
            ),
            const SizedBox(height: 32),
            _NextButton(label: 'Continuar', onPressed: _next),
          ],
        ),
      ),
    );
  }

  // ── Step 1: Personal (driver) ──────────────────────────────────────────────

  Widget _step1Personal({required bool isLoading}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step1Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.person_rounded,
              title: 'Datos personales',
              subtitle: 'Como aparecen en tu documento de identidad.',
            ),
            const SizedBox(height: 24),
            _FormField(
              controller: _nameCtrl,
              label: 'Nombre completo',
              hint: 'Ej. Juan Carlos Villamizar',
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().length < 5)
                  ? 'Ingresa tu nombre completo'
                  : null,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: _docType,
              decoration: _inputDecoration('Tipo de documento'),
              items: const [
                DropdownMenuItem(value: 'CC', child: Text('Cédula (CC)')),
                DropdownMenuItem(value: 'CE', child: Text('Cédula Extranjería (CE)')),
                DropdownMenuItem(value: 'PA', child: Text('Pasaporte (PA)')),
              ],
              onChanged: (v) => setState(() => _docType = v ?? 'CC'),
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _docNumberCtrl,
              label: 'Número de documento',
              hint: 'Ej. 1090456789',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) => (v == null || v.trim().length < 6)
                  ? 'Número de documento inválido'
                  : null,
            ),
            const SizedBox(height: 32),
            _NextButton(label: 'Continuar', onPressed: _next),
          ],
        ),
      ),
    );
  }

  // ── Step 1: Business ───────────────────────────────────────────────────────

  Widget _step1Business({required bool isLoading}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step1Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.business_rounded,
              title: 'Datos de la empresa',
              subtitle: 'Información del negocio registrado ante la DIAN.',
            ),
            const SizedBox(height: 24),
            _FormField(
              controller: _nameCtrl,
              label: 'Razón social',
              hint: 'Ej. Transportes Nexum S.A.S.',
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().length < 3)
                  ? 'Ingresa la razón social'
                  : null,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _nitCtrl,
              label: 'NIT',
              hint: 'Ej. 900123456-1',
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9\-]'))
              ],
              validator: (v) => (v == null || v.trim().length < 8)
                  ? 'NIT inválido'
                  : null,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _legalRepCtrl,
              label: 'Representante legal',
              hint: 'Ej. Carlos Eduardo Mora',
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().length < 5)
                  ? 'Ingresa el nombre del representante'
                  : null,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _addressCtrl,
              label: 'Dirección',
              hint: 'Ej. Calle 7 # 5-32, Pamplona',
              textCapitalization: TextCapitalization.sentences,
              validator: (v) => (v == null || v.trim().length < 5)
                  ? 'Ingresa la dirección'
                  : null,
            ),
            const SizedBox(height: 32),
            _NextButton(label: 'Continuar', onPressed: _next),
          ],
        ),
      ),
    );
  }

  // ── Step 2: Vehicle (driver) ───────────────────────────────────────────────

  Widget _step2Vehicle({required bool isLoading}) {
    final brands = _role == UserRole.driverMoto ? _motoBrands : _carBrands;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step2Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: _role == UserRole.driverMoto
                  ? Icons.two_wheeler_rounded
                  : Icons.directions_car_rounded,
              title: 'Datos del vehículo',
              subtitle: 'Ingresa la información del vehículo con el que operarás.',
            ),
            const SizedBox(height: 24),
            DropdownButtonFormField<String>(
              value: _vehicleBrand,
              decoration: _inputDecoration('Marca'),
              items: brands
                  .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                  .toList(),
              onChanged: (v) =>
                  setState(() => _vehicleBrand = v ?? brands.first),
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _vehicleModelCtrl,
              label: 'Modelo',
              hint: _role == UserRole.driverMoto ? 'Ej. CB 190R' : 'Ej. Spark GT',
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Ingresa el modelo' : null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _FormField(
                    controller: _vehicleYearCtrl,
                    label: 'Año',
                    hint: '2020',
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4),
                    ],
                    validator: (v) {
                      final y = int.tryParse(v ?? '');
                      final cur = DateTime.now().year;
                      if (y == null || y < 2000 || y > cur) {
                        return 'Año inválido';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _FormField(
                    controller: _vehicleColorCtrl,
                    label: 'Color',
                    hint: 'Ej. Rojo',
                    textCapitalization: TextCapitalization.sentences,
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Ingresa el color'
                        : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _vehiclePlateCtrl,
              label: 'Placa',
              hint: 'ABC-123',
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9\-]')),
                LengthLimitingTextInputFormatter(7),
                _PlateFormatter(),
              ],
              validator: (v) {
                final plate = v?.toUpperCase().trim() ?? '';
                if (!RegExp(r'^[A-Z]{3}-[0-9]{3}$').hasMatch(plate)) {
                  return 'Formato: ABC-123';
                }
                return null;
              },
            ),
            if (_role == UserRole.driverMoto) ...[
              const SizedBox(height: 16),
              _FormField(
                controller: _ccCtrl,
                label: 'Cilindraje (cc)',
                hint: 'Ej. 190',
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Ingresa el cilindraje'
                    : null,
              ),
            ],
            if (_role == UserRole.driverCar) ...[
              const SizedBox(height: 16),
              _VehicleTypeSelector(
                selected: _vehicleType,
                onChanged: (v) => setState(() => _vehicleType = v ?? 'particular'),
              ),
            ],
            const SizedBox(height: 32),
            _NextButton(label: 'Continuar', onPressed: _next),
          ],
        ),
      ),
    );
  }

  // ── Step 2: Contact (business) ─────────────────────────────────────────────

  Widget _step2Contact({required bool isLoading}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step2Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.contact_phone_rounded,
              title: 'Datos de contacto',
              subtitle: 'Información para comunicarnos con la empresa.',
            ),
            const SizedBox(height: 24),
            _FormField(
              controller: _contactEmailCtrl,
              label: 'Correo corporativo',
              hint: 'empresa@ejemplo.com',
              keyboardType: TextInputType.emailAddress,
              validator: (v) {
                if (v == null || !v.contains('@')) return 'Correo inválido';
                return null;
              },
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _contactPhoneCtrl,
              label: 'Teléfono de contacto',
              hint: '+57 300 000 0000',
              keyboardType: TextInputType.phone,
              validator: (v) {
                final digits = v?.replaceAll(RegExp(r'\D'), '') ?? '';
                if (digits.length < 7) return 'Teléfono inválido';
                return null;
              },
            ),
            const SizedBox(height: 32),
            _NextButton(label: 'Continuar', onPressed: _next),
          ],
        ),
      ),
    );
  }

  // ── Step 3: Bank ───────────────────────────────────────────────────────────

  Widget _step3Bank({required bool isLoading}) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _step3Key,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionHeader(
              icon: Icons.account_balance_rounded,
              title: 'Cuenta bancaria',
              subtitle: 'Para recibir los pagos de la plataforma.',
            ),
            const SizedBox(height: 24),
            DropdownButtonFormField<String>(
              value: _bankName,
              decoration: _inputDecoration('Banco o billetera'),
              items: _banks
                  .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                  .toList(),
              onChanged: (v) => setState(() => _bankName = v ?? _banks.first),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: _bankAccountType,
              decoration: _inputDecoration('Tipo de cuenta'),
              items: const [
                DropdownMenuItem(value: 'Ahorros', child: Text('Cuenta de Ahorros')),
                DropdownMenuItem(value: 'Corriente', child: Text('Cuenta Corriente')),
              ],
              onChanged: (v) =>
                  setState(() => _bankAccountType = v ?? 'Ahorros'),
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: _bankNumCtrl,
              label: 'Número de cuenta',
              hint: 'Ej. 12345678901',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) => (v == null || v.trim().length < 6)
                  ? 'Número de cuenta inválido'
                  : null,
            ),
            const SizedBox(height: 8),
            Text(
              'Tu información bancaria está protegida con cifrado.',
              style: TextStyle(fontSize: 12, color: AppColors.inputHint),
            ),
            const SizedBox(height: 32),
            _SubmitButton(
              isLoading: isLoading,
              onPressed: isLoading ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.step, required this.titles});

  final int step;
  final List<String> titles;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(
        children: List.generate(titles.length, (i) {
          final isDone = i < step;
          final isActive = i == step;
          return Expanded(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        height: 4,
                        decoration: BoxDecoration(
                          color: isDone || isActive
                              ? AppColors.primary
                              : AppColors.divider,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        titles[i],
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: isActive ? FontWeight.w700 : FontWeight.w400,
                          color: isActive
                              ? AppColors.primary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (i < titles.length - 1) const SizedBox(width: 6),
              ],
            ),
          );
        }),
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: AppColors.primary, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 3),
              Text(subtitle,
                  style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.textSecondary,
                      height: 1.35)),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Form field ────────────────────────────────────────────────────────────────

InputDecoration _inputDecoration(String label) {
  return InputDecoration(
    labelText: label,
    labelStyle: const TextStyle(color: AppColors.inputLabel),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.inputBorder),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.inputBorder),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide:
          const BorderSide(color: AppColors.inputBorderFocused, width: 2),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.inputBorderError),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide:
          const BorderSide(color: AppColors.inputBorderError, width: 2),
    ),
    filled: true,
    fillColor: AppColors.inputBackground,
  );
}

class _FormField extends StatelessWidget {
  const _FormField({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.obscure = false,
    this.suffixIcon,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final bool obscure;
  final Widget? suffixIcon;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      obscureText: obscure,
      style: const TextStyle(fontSize: 15, color: AppColors.textPrimary),
      decoration: _inputDecoration(label).copyWith(
        hintText: hint,
        hintStyle:
            const TextStyle(color: AppColors.inputHint, fontSize: 14),
        suffixIcon: suffixIcon,
      ),
      validator: validator,
    );
  }
}

// ── Buttons ───────────────────────────────────────────────────────────────────

class _NextButton extends StatelessWidget {
  const _NextButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: 0,
        ),
        child: Text(label,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({required this.isLoading, required this.onPressed});

  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                    color: Colors.white, strokeWidth: 2.5),
              )
            : const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle_rounded, size: 20),
                  SizedBox(width: 8),
                  Text('Completar registro',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w700)),
                ],
              ),
      ),
    );
  }
}

// ── Vehicle type selector ─────────────────────────────────────────────────────

class _VehicleTypeSelector extends StatelessWidget {
  const _VehicleTypeSelector(
      {required this.selected, required this.onChanged});

  final String selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Tipo de servicio',
            style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.inputLabel)),
        const SizedBox(height: 8),
        Row(
          children: [
            _TypeChip(
              label: 'Particular',
              icon: Icons.directions_car_rounded,
              selected: selected == 'particular',
              onTap: () => onChanged('particular'),
            ),
            const SizedBox(width: 12),
            _TypeChip(
              label: 'Taxi',
              icon: Icons.local_taxi_rounded,
              selected: selected == 'taxi',
              onTap: () => onChanged('taxi'),
            ),
          ],
        ),
      ],
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.inputBorder,
              width: selected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: selected
                ? AppColors.primary.withValues(alpha: 0.07)
                : AppColors.inputBackground,
          ),
          child: Column(
            children: [
              Icon(icon,
                  color: selected ? AppColors.primary : AppColors.textSecondary,
                  size: 26),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight:
                      selected ? FontWeight.w700 : FontWeight.w400,
                  color: selected
                      ? AppColors.primary
                      : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Plate formatter ───────────────────────────────────────────────────────────

class _PlateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    final raw =
        newValue.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final buf = StringBuffer();
    for (var i = 0; i < raw.length && i < 6; i++) {
      if (i == 3) buf.write('-');
      buf.write(raw[i]);
    }
    final result = buf.toString();
    return TextEditingValue(
      text: result,
      selection: TextSelection.collapsed(offset: result.length),
    );
  }
}
