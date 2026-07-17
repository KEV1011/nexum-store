import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/safety/data/safety_api.dart';
import 'package:nexum_driver/shared/services/location_service.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';
import 'package:url_launcher/url_launcher.dart';

/// Línea única de emergencias en Colombia (no es 911).
const String kEmergencyNumber = '123';

class SafetyScreen extends StatefulWidget {
  const SafetyScreen({super.key});

  @override
  State<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends State<SafetyScreen> {
  final _contacts = <_Contact>[
    const _Contact(
      name: 'María García',
      relation: 'Familiar',
      phone: '+57 315 123 4567',
    ),
  ];

  bool _checklistExpanded = false;
  final _checklist = [
    _CheckItem(label: 'Vehículo en buen estado mecánico'),
    _CheckItem(label: 'Documentos vigentes a bordo'),
    _CheckItem(label: 'Teléfono cargado al 100%'),
    _CheckItem(label: 'Ruta planificada en la app'),
    _CheckItem(label: 'Contacto de emergencia registrado'),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Centro de seguridad')),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _buildSosCard(theme),
          const SizedBox(height: AppConstants.spacingL),
          _buildLocationCard(theme),
          const SizedBox(height: AppConstants.spacingL),
          _buildContactsSection(theme),
          const SizedBox(height: AppConstants.spacingL),
          _buildChecklist(theme),
          const SizedBox(height: AppConstants.spacingL),
          Text(
            'Consejos de seguridad',
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: AppConstants.spacingM),
          ..._safetyTips
              .map((t) => _SafetyTip(icon: t.$1, title: t.$2, body: t.$3)),
          const SizedBox(height: AppConstants.spacingL),
          _buildEmergencyCard(theme),
          const SizedBox(height: AppConstants.spacingL),
        ],
      ),
    );
  }

  Widget _buildSosCard(ThemeData theme) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.error,
        borderRadius: BorderRadius.circular(AppConstants.radiusXLarge),
      ),
      padding: const EdgeInsets.all(AppConstants.spacingL),
      child: Column(
        children: [
          const Icon(Icons.sos_rounded, color: Colors.white, size: 56),
          const SizedBox(height: AppConstants.spacingM),
          Text(
            'Botón de emergencia',
            style: theme.textTheme.titleLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Comparte tu ubicación con tu contacto de confianza y facilita la '
            'llamada al $kEmergencyNumber. No avisa automáticamente a la policía.',
            style:
                theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppConstants.spacingL),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _confirmSos,
              icon: const Icon(Icons.warning_amber_rounded),
              label: const Text('ACTIVAR SOS'),
              style: ElevatedButton.styleFrom(
                backgroundColor: context.surfaceColor,
                foregroundColor: AppColors.error,
                textStyle: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  letterSpacing: 1,
                ),
                minimumSize: const Size.fromHeight(52),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSos() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Activar SOS?'),
        content: const Text(
          'Compartiremos tu ubicación con tu contacto de confianza y te '
          'facilitaremos llamar al $kEmergencyNumber. Esto NO avisa '
          'automáticamente a la policía.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white),
            child: const Text('Activar SOS'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    HapticFeedback.heavyImpact();

    SosResult? result;
    try {
      final loc = await LocationService().getCurrentLocation();
      final tripId = DriverWsService().activeTripId;
      result = await SafetyApi().sendSos(
        tripId: (tripId == null || tripId.isEmpty) ? null : tripId,
        lat: loc.latitude,
        lng: loc.longitude,
      );
    } catch (_) {
      // Even if the backend/GPS fails, still let the driver call 123.
    }
    if (!mounted) return;
    await _showSosActions(result);
  }

  Future<void> _showSosActions(SosResult? result) async {
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(Icons.sos_rounded, color: AppColors.error, size: 26),
                SizedBox(width: 10),
                Text('SOS activado',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              result == null
                  ? 'No pudimos registrar el evento, pero puedes llamar al $kEmergencyNumber.'
                  : result.trustedContactNotified
                      ? 'Tu ubicación fue compartida con tu contacto de confianza.'
                      : 'Evento registrado. Configura un contacto de confianza '
                          'para avisarle automáticamente.',
              style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _callEmergency,
              icon: const Icon(Icons.phone_in_talk_rounded),
              label: const Text('Llamar al 123'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(50),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _callEmergency() async {
    final uri = Uri(scheme: 'tel', path: kEmergencyNumber);
    if (!await launchUrl(uri) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Marca el $kEmergencyNumber desde tu teléfono.')),
      );
    }
  }

  Widget _buildLocationCard(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark
            : AppColors.infoContainer,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border:
            Border.all(color: AppColors.info.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.info.withValues(alpha: 0.15),
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusMedium),
            ),
            child: const Icon(Icons.share_location_rounded,
                color: AppColors.info, size: 24),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Compartir ubicación',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  'Envía tus coordenadas actuales a un contacto',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _shareLocation,
            child: const Text('Compartir'),
          ),
        ],
      ),
    );
  }

  void _shareLocation() {
    const coords =
        '7.3756° N, 72.6494° O — Pamplona, Norte de Santander';
    Clipboard.setData(const ClipboardData(text: coords));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Ubicación copiada: $coords'),
        duration: Duration(seconds: 3),
      ),
    );
  }

  Widget _buildContactsSection(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Contactos de emergencia',
          style: theme.textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppConstants.spacingM),
        Card(
          margin: const EdgeInsets.only(bottom: AppConstants.spacingM),
          child: ListTile(
            leading: const Icon(Icons.shield_outlined, color: AppColors.primary),
            title: const Text('Contacto de confianza'),
            subtitle: const Text('Se le avisa con tu ubicación al activar SOS'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push(AppRoutes.trustedContact),
          ),
        ),
        ..._contacts.map(
          (c) => Padding(
            padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
            child: _ContactTile(
              contact: c,
              onCall: () => ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Llamando a ${c.name}…')),
              ),
            ),
          ),
        ),
        const SizedBox(height: AppConstants.spacingS),
        OutlinedButton.icon(
          onPressed: _showAddContactSheet,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Agregar contacto'),
        ),
      ],
    );
  }

  void _showAddContactSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppConstants.radiusXLarge)),
      ),
      builder: (ctx) => _AddContactSheet(
        onAdd: (contact) {
          setState(() => _contacts.add(contact));
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text(
                    '${contact.name} agregado como contacto de emergencia')),
          );
        },
      ),
    );
  }

  Widget _buildChecklist(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;
    final done = _checklist.where((c) => c.checked).length;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
            color: isDark ? AppColors.outlineDark : context.outlineColor),
      ),
      child: Column(
        children: [
          ListTile(
            leading: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.successContainer,
                borderRadius:
                    BorderRadius.circular(AppConstants.radiusSmall),
              ),
              child: const Icon(Icons.checklist_rounded,
                  color: AppColors.success, size: 20),
            ),
            title: Text(
              'Checklist pre-turno',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              '$done / ${_checklist.length} completados',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: context.textSecondaryColor),
            ),
            trailing: AnimatedRotation(
              turns: _checklistExpanded ? 0.5 : 0,
              duration: AppConstants.shortAnimation,
              child: Icon(Icons.expand_more_rounded,
                  color: context.textSecondaryColor),
            ),
            onTap: () =>
                setState(() => _checklistExpanded = !_checklistExpanded),
          ),
          if (_checklistExpanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppConstants.spacingM,
                0,
                AppConstants.spacingM,
                AppConstants.spacingM,
              ),
              child: Column(
                children: _checklist
                    .map(
                      (item) => CheckboxListTile(
                        value: item.checked,
                        onChanged: (v) =>
                            setState(() => item.checked = v ?? false),
                        title: Text(item.label,
                            style: theme.textTheme.bodySmall),
                        activeColor: AppColors.primary,
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                      ),
                    )
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmergencyCard(ThemeData theme) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.infoContainer,
                    borderRadius:
                        BorderRadius.circular(AppConstants.radiusMedium),
                  ),
                  child: const Icon(Icons.local_police_rounded,
                      color: AppColors.info, size: 24),
                ),
                const SizedBox(width: AppConstants.spacingM),
                Text(
                  'Líneas de emergencia',
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            ..._emergencyNumbers.map(
              (e) => _EmergencyRow(
                label: e.$1,
                number: e.$2,
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Marcando ${e.$2}…')),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Models ─────────────────────────────────────────────────────────────────────

class _CheckItem {
  _CheckItem({required this.label});
  final String label;
  bool checked = false;
}

class _Contact {
  const _Contact({
    required this.name,
    required this.relation,
    required this.phone,
  });
  final String name;
  final String relation;
  final String phone;
}

// ── Add Contact Sheet ──────────────────────────────────────────────────────────

class _AddContactSheet extends StatefulWidget {
  const _AddContactSheet({required this.onAdd});
  final ValueChanged<_Contact> onAdd;

  @override
  State<_AddContactSheet> createState() => _AddContactSheetState();
}

class _AddContactSheetState extends State<_AddContactSheet> {
  final _nameCtrl = TextEditingController();
  final _relationCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _relationCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onAdd(_Contact(
      name: _nameCtrl.text.trim(),
      relation: _relationCtrl.text.trim(),
      phone: _phoneCtrl.text.trim(),
    ));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppConstants.spacingL,
        AppConstants.spacingL,
        AppConstants.spacingL,
        MediaQuery.of(context).viewInsets.bottom + AppConstants.spacingL,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  'Agregar contacto',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Nombre completo',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _relationCtrl,
              decoration: const InputDecoration(
                labelText: 'Relación (ej. Familiar, Amigo)',
                prefixIcon: Icon(Icons.people_outline_rounded),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingM),
            TextFormField(
              controller: _phoneCtrl,
              decoration: const InputDecoration(
                labelText: 'Teléfono',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              keyboardType: TextInputType.phone,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Requerido' : null,
            ),
            const SizedBox(height: AppConstants.spacingL),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submit,
                child: const Text('Guardar contacto'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Reusable widgets ───────────────────────────────────────────────────────────

class _ContactTile extends StatelessWidget {
  const _ContactTile({required this.contact, required this.onCall});
  final _Contact contact;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
            color: isDark ? AppColors.outlineDark : context.outlineColor),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.errorContainer,
            child: Text(
              contact.name[0],
              style: const TextStyle(
                  color: AppColors.error, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  contact.name,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  '${contact.relation} · ${contact.phone}',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onCall,
            icon: const Icon(Icons.phone_rounded, color: AppColors.primary),
          ),
        ],
      ),
    );
  }
}

class _SafetyTip extends StatelessWidget {
  const _SafetyTip({
    required this.icon,
    required this.title,
    required this.body,
  });
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppConstants.spacingS),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.warningContainer,
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusSmall),
            ),
            child: Icon(icon, size: 16, color: AppColors.warning),
          ),
          const SizedBox(width: AppConstants.spacingM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  body,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: context.textSecondaryColor),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmergencyRow extends StatelessWidget {
  const _EmergencyRow({
    required this.label,
    required this.number,
    required this.onTap,
  });
  final String label;
  final String number;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppConstants.radiusSmall),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            const Icon(Icons.phone_rounded,
                size: 16, color: AppColors.info),
            const SizedBox(width: AppConstants.spacingS),
            Expanded(child: Text(label, style: theme.textTheme.bodySmall)),
            Text(
              number,
              style: theme.textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700, color: AppColors.info),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Static data ────────────────────────────────────────────────────────────────

const _safetyTips = [
  (
    Icons.verified_user_rounded,
    'Verifica al pasajero',
    'Confirma nombre y foto antes de iniciar el viaje.',
  ),
  (
    Icons.share_location_rounded,
    'Comparte tu ruta',
    'Activa la función de compartir ubicación con familiares.',
  ),
  (
    Icons.do_not_disturb_rounded,
    'No aceptes desvíos sospechosos',
    'Sigue siempre la ruta indicada en la app.',
  ),
  (
    Icons.brightness_1,
    'Confía en tu instinto',
    'Si algo no te parece bien, cancela el viaje con seguridad.',
  ),
];

const _emergencyNumbers = [
  ('Policía Nacional', '123'),
  ('Bomberos', '119'),
  ('Cruz Roja', '132'),
  ('Línea Nexum Emergencias', '01-800-090-0111'),
];
