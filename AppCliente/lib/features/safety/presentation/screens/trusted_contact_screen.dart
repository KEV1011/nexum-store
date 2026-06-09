import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/safety/presentation/providers/safety_provider.dart';

/// Configure the trusted contact notified when SOS is activated.
class TrustedContactScreen extends ConsumerStatefulWidget {
  const TrustedContactScreen({super.key});

  @override
  ConsumerState<TrustedContactScreen> createState() =>
      _TrustedContactScreenState();
}

class _TrustedContactScreenState extends ConsumerState<TrustedContactScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _saving = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(safetyServiceProvider).setTrustedContact(
            name: _nameCtrl.text.trim(),
            phone: _phoneCtrl.text.trim(),
          );
      ref.invalidate(trustedContactProvider);
      if (mounted) {
        AppSnackbar.showInfo(context, 'Contacto de confianza guardado.');
        Navigator.of(context).pop();
      }
    } catch (_) {
      if (mounted) AppSnackbar.showInfo(context, 'No se pudo guardar el contacto.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactAsync = ref.watch(trustedContactProvider);

    // Prefill once when the current contact loads.
    contactAsync.whenData((c) {
      if (!_prefilled && c.isConfigured) {
        _nameCtrl.text = c.name ?? '';
        _phoneCtrl.text = c.phone ?? '';
        _prefilled = true;
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('Contacto de confianza')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(Icons.shield_outlined, color: AppColors.primary),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Avisaremos a esta persona con tu ubicación cuando '
                      'actives el botón SOS durante un viaje.',
                      style: TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Nombre',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Ingresa un nombre' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
              ],
              decoration: const InputDecoration(
                labelText: 'Teléfono',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().length < 7) ? 'Teléfono inválido' : null,
            ),
            const SizedBox(height: 28),
            FilledButton(
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Guardar contacto'),
            ),
          ],
        ),
      ),
    );
  }
}
