import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/auth/domain/usecases/register_driver_usecase.dart';
import 'package:nexum_driver/features/auth/presentation/providers/auth_provider.dart';

// Bancos colombianos disponibles
const _banks = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco Popular',
  'Banco Agrario',
  'Nequi',
  'Daviplata',
  'Banco Caja Social',
  'Otro',
];

// Marcas de vehículos comunes en Colombia
const _vehicleBrands = [
  'Chevrolet',
  'Renault',
  'Kia',
  'Hyundai',
  'Toyota',
  'Mazda',
  'Nissan',
  'Volkswagen',
  'Ford',
  'Suzuki',
  'Otro',
];

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, required this.phone});
  final String phone;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _pageController = PageController();
  int _currentStep = 0;

  // Step 1 — Datos personales
  final _nameCtrl = TextEditingController();
  final _docNumberCtrl = TextEditingController();
  String _docType = 'CC';
  final _step1Key = GlobalKey<FormState>();

  // Step 2 — Vehículo
  String _vehicleBrand = _vehicleBrands.first;
  final _vehicleModelCtrl = TextEditingController();
  final _vehicleYearCtrl = TextEditingController();
  final _vehiclePlateCtrl = TextEditingController();
  final _vehicleColorCtrl = TextEditingController();
  String _vehicleType = 'particular';
  final _step2Key = GlobalKey<FormState>();

  // Step 3 — Cuenta bancaria
  String _bankName = _banks.first;
  String _bankAccountType = 'Ahorros';
  final _bankAccountNumberCtrl = TextEditingController();
  final _step3Key = GlobalKey<FormState>();

  @override
  void dispose() {
    _pageController.dispose();
    _nameCtrl.dispose();
    _docNumberCtrl.dispose();
    _vehicleModelCtrl.dispose();
    _vehicleYearCtrl.dispose();
    _vehiclePlateCtrl.dispose();
    _vehicleColorCtrl.dispose();
    _bankAccountNumberCtrl.dispose();
    super.dispose();
  }

  void _nextStep() {
    final isValid = switch (_currentStep) {
      0 => _step1Key.currentState?.validate() ?? false,
      1 => _step2Key.currentState?.validate() ?? false,
      _ => false,
    };
    if (!isValid) return;

    _pageController.nextPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _prevStep() {
    _pageController.previousPage(
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  Future<void> _submit() async {
    if (!(_step3Key.currentState?.validate() ?? false)) return;

    final year = int.tryParse(_vehicleYearCtrl.text.trim()) ?? 0;

    await ref.read(authProvider.notifier).registerDriver(
          RegisterDriverParams(
            phone: widget.phone,
            fullName: _nameCtrl.text.trim(),
            documentType: _docType,
            documentNumber: _docNumberCtrl.text.trim(),
            vehicleBrand: _vehicleBrand,
            vehicleModel: _vehicleModelCtrl.text.trim(),
            vehicleYear: year,
            vehiclePlate: _vehiclePlateCtrl.text.trim().toUpperCase(),
            vehicleColor: _vehicleColorCtrl.text.trim(),
            vehicleType: _vehicleType,
            bankName: _bankName,
            bankAccountType: _bankAccountType,
            bankAccountNumber: _bankAccountNumberCtrl.text.trim(),
          ),
        );
  }

  void _handleAuthState(AuthState? prev, AuthState curr) {
    if (!mounted) return;
    if (curr is AuthAuthenticated) {
      context.go(AppRoutes.home);
    } else if (curr is AuthError) {
      AppSnackbar.showError(context, curr.failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authProvider, _handleAuthState);

    final isLoading = ref.watch(authProvider) is AuthLoading;

    return Scaffold(
      backgroundColor: context.surfaceColor,
      appBar: AppBar(
        title: const Text('Registro de conductor'),
        backgroundColor: context.surfaceColor,
        leading: _currentStep > 0
            ? IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded),
                onPressed: isLoading ? null : _prevStep,
              )
            : null,
        automaticallyImplyLeading: false,
      ),
      body: Column(
        children: [
          _StepIndicator(currentStep: _currentStep),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              onPageChanged: (i) => setState(() => _currentStep = i),
              children: [
                _Step1Personal(
                  formKey: _step1Key,
                  nameCtrl: _nameCtrl,
                  docNumberCtrl: _docNumberCtrl,
                  docType: _docType,
                  onDocTypeChanged: (v) => setState(() => _docType = v ?? 'CC'),
                  onNext: _nextStep,
                ),
                _Step2Vehicle(
                  formKey: _step2Key,
                  brand: _vehicleBrand,
                  modelCtrl: _vehicleModelCtrl,
                  yearCtrl: _vehicleYearCtrl,
                  plateCtrl: _vehiclePlateCtrl,
                  colorCtrl: _vehicleColorCtrl,
                  vehicleType: _vehicleType,
                  onBrandChanged: (v) =>
                      setState(() => _vehicleBrand = v ?? _vehicleBrands.first),
                  onVehicleTypeChanged: (v) =>
                      setState(() => _vehicleType = v ?? 'particular'),
                  onNext: _nextStep,
                ),
                _Step3Bank(
                  formKey: _step3Key,
                  bankName: _bankName,
                  accountType: _bankAccountType,
                  accountNumberCtrl: _bankAccountNumberCtrl,
                  onBankChanged: (v) =>
                      setState(() => _bankName = v ?? _banks.first),
                  onAccountTypeChanged: (v) =>
                      setState(() => _bankAccountType = v ?? 'Ahorros'),
                  onSubmit: _submit,
                  isLoading: isLoading,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Step indicator ────────────────────────────────────────────────────────────

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.currentStep});
  final int currentStep;

  static const _labels = ['Datos personales', 'Vehículo', 'Cuenta bancaria'];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Row(
        children: List.generate(3, (i) {
          final isActive = i == currentStep;
          final isDone = i < currentStep;
          return Expanded(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        height: 4,
                        decoration: BoxDecoration(
                          color: isDone || isActive
                              ? AppColors.primary
                              : AppColors.divider,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _labels[i],
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: isActive
                              ? FontWeight.w600
                              : FontWeight.w400,
                          color: isActive
                              ? AppColors.primary
                              : context.textSecondaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
                if (i < 2) const SizedBox(width: 8),
              ],
            ),
          );
        }),
      ),
    );
  }
}

// ── Step 1: Datos personales ──────────────────────────────────────────────────

class _Step1Personal extends StatelessWidget {
  const _Step1Personal({
    required this.formKey,
    required this.nameCtrl,
    required this.docNumberCtrl,
    required this.docType,
    required this.onDocTypeChanged,
    required this.onNext,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController nameCtrl;
  final TextEditingController docNumberCtrl;
  final String docType;
  final ValueChanged<String?> onDocTypeChanged;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(
              icon: Icons.person_rounded,
              title: 'Datos personales',
              subtitle: 'Ingresa tu información como aparece en tu documento',
            ),
            const SizedBox(height: 24),
            _FormField(
              controller: nameCtrl,
              label: 'Nombre completo',
              hint: 'Ej. Juan Carlos Villamizar',
              textCapitalization: TextCapitalization.words,
              validator: (v) {
                if (v == null || v.trim().length < 5) {
                  return 'Ingresa tu nombre completo';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: docType,
              decoration: const InputDecoration(
                labelText: 'Tipo de documento',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'CC', child: Text('Cédula de Ciudadanía (CC)')),
                DropdownMenuItem(value: 'CE', child: Text('Cédula de Extranjería (CE)')),
                DropdownMenuItem(value: 'PA', child: Text('Pasaporte (PA)')),
              ],
              onChanged: onDocTypeChanged,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: docNumberCtrl,
              label: 'Número de documento',
              hint: 'Ej. 1090456789',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.trim().length < 6) {
                  return 'Ingresa un número de documento válido';
                }
                return null;
              },
            ),
            const SizedBox(height: 32),
            _PrimaryButton(
              label: 'Continuar',
              onPressed: onNext,
              icon: Icons.arrow_forward_rounded,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Step 2: Vehículo ──────────────────────────────────────────────────────────

class _Step2Vehicle extends StatelessWidget {
  const _Step2Vehicle({
    required this.formKey,
    required this.brand,
    required this.modelCtrl,
    required this.yearCtrl,
    required this.plateCtrl,
    required this.colorCtrl,
    required this.vehicleType,
    required this.onBrandChanged,
    required this.onVehicleTypeChanged,
    required this.onNext,
  });

  final GlobalKey<FormState> formKey;
  final String brand;
  final TextEditingController modelCtrl;
  final TextEditingController yearCtrl;
  final TextEditingController plateCtrl;
  final TextEditingController colorCtrl;
  final String vehicleType;
  final ValueChanged<String?> onBrandChanged;
  final ValueChanged<String?> onVehicleTypeChanged;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(
              icon: Icons.directions_car_rounded,
              title: 'Datos del vehículo',
              subtitle: 'Información del vehículo con el que prestarás el servicio',
            ),
            const SizedBox(height: 24),
            DropdownButtonFormField<String>(
              value: brand,
              decoration: const InputDecoration(
                labelText: 'Marca',
                border: OutlineInputBorder(),
              ),
              items: _vehicleBrands
                  .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                  .toList(),
              onChanged: onBrandChanged,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: modelCtrl,
              label: 'Modelo',
              hint: 'Ej. Spark GT, Logan, Picanto',
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Ingresa el modelo' : null,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _FormField(
                    controller: yearCtrl,
                    label: 'Año',
                    hint: 'Ej. 2020',
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4),
                    ],
                    validator: (v) {
                      final year = int.tryParse(v ?? '');
                      final currentYear = DateTime.now().year;
                      if (year == null || year < 2000 || year > currentYear) {
                        return 'Año inválido';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _FormField(
                    controller: colorCtrl,
                    label: 'Color',
                    hint: 'Ej. Blanco',
                    textCapitalization: TextCapitalization.sentences,
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Ingresa el color' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: plateCtrl,
              label: 'Placa',
              hint: 'Ej. ABC-123',
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
            const SizedBox(height: 16),
            _VehicleTypeSelector(
              selected: vehicleType,
              onChanged: onVehicleTypeChanged,
            ),
            const SizedBox(height: 32),
            _PrimaryButton(
              label: 'Continuar',
              onPressed: onNext,
              icon: Icons.arrow_forward_rounded,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Step 3: Cuenta bancaria ───────────────────────────────────────────────────

class _Step3Bank extends StatelessWidget {
  const _Step3Bank({
    required this.formKey,
    required this.bankName,
    required this.accountType,
    required this.accountNumberCtrl,
    required this.onBankChanged,
    required this.onAccountTypeChanged,
    required this.onSubmit,
    required this.isLoading,
  });

  final GlobalKey<FormState> formKey;
  final String bankName;
  final String accountType;
  final TextEditingController accountNumberCtrl;
  final ValueChanged<String?> onBankChanged;
  final ValueChanged<String?> onAccountTypeChanged;
  final VoidCallback onSubmit;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(
              icon: Icons.account_balance_rounded,
              title: 'Cuenta bancaria',
              subtitle: 'Para recibir el pago de tus viajes',
            ),
            const SizedBox(height: 24),
            DropdownButtonFormField<String>(
              value: bankName,
              decoration: const InputDecoration(
                labelText: 'Banco o billetera',
                border: OutlineInputBorder(),
              ),
              items: _banks
                  .map((b) => DropdownMenuItem(value: b, child: Text(b)))
                  .toList(),
              onChanged: onBankChanged,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: accountType,
              decoration: const InputDecoration(
                labelText: 'Tipo de cuenta',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'Ahorros', child: Text('Cuenta de Ahorros')),
                DropdownMenuItem(value: 'Corriente', child: Text('Cuenta Corriente')),
              ],
              onChanged: onAccountTypeChanged,
            ),
            const SizedBox(height: 16),
            _FormField(
              controller: accountNumberCtrl,
              label: 'Número de cuenta',
              hint: 'Ej. 12345678901',
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.trim().length < 6) {
                  return 'Ingresa el número de cuenta';
                }
                return null;
              },
            ),
            const SizedBox(height: 8),
            Text(
              'Tu información bancaria está segura y cifrada.',
              style: TextStyle(
                fontSize: 12,
                color: context.textSecondaryColor,
              ),
            ),
            const SizedBox(height: 32),
            _PrimaryButton(
              label: 'Completar registro',
              onPressed: isLoading ? null : onSubmit,
              icon: Icons.check_circle_rounded,
              isLoading: isLoading,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Vehicle type selector ────────────────────────────────────────────────────

class _VehicleTypeSelector extends StatelessWidget {
  const _VehicleTypeSelector({
    required this.selected,
    required this.onChanged,
  });

  final String selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Tipo de vehículo',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.textSecondaryColor,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            _TypeOption(
              label: 'Particular',
              icon: Icons.directions_car_rounded,
              isSelected: selected == 'particular',
              onTap: () => onChanged('particular'),
            ),
            const SizedBox(width: 12),
            _TypeOption(
              label: 'Taxi',
              icon: Icons.local_taxi_rounded,
              isSelected: selected == 'taxi',
              onTap: () => onChanged('taxi'),
            ),
          ],
        ),
      ],
    );
  }
}

class _TypeOption extends StatelessWidget {
  const _TypeOption({
    required this.label,
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(
              color: isSelected ? AppColors.primary : AppColors.divider,
              width: isSelected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(12),
            color: isSelected ? AppColors.primary.withValues(alpha: 0.06) : Colors.white,
          ),
          child: Column(
            children: [
              Icon(
                icon,
                color: isSelected ? AppColors.primary : context.textSecondaryColor,
                size: 28,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight:
                      isSelected ? FontWeight.w600 : FontWeight.w400,
                  color: isSelected ? AppColors.primary : context.textSecondaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Shared widgets ────────────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
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
            color: AppColors.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: AppColors.primary, size: 24),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.textSecondaryColor,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FormField extends StatelessWidget {
  const _FormField({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType,
    this.inputFormatters,
    this.textCapitalization = TextCapitalization.none,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextCapitalization textCapitalization;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        border: const OutlineInputBorder(),
      ),
      validator: validator,
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    required this.icon,
    this.onPressed,
    this.isLoading = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Icon(icon),
        label: Text(label),
      ),
    );
  }
}

// ── Plate text input formatter ────────────────────────────────────────────────

class _PlateFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final raw = newValue.text.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final buffer = StringBuffer();
    for (var i = 0; i < raw.length && i < 6; i++) {
      if (i == 3) buffer.write('-');
      buffer.write(raw[i]);
    }
    final result = buffer.toString();
    return TextEditingValue(
      text: result,
      selection: TextSelection.collapsed(offset: result.length),
    );
  }
}
