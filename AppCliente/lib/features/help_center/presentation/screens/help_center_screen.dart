import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/constants/app_constants.dart';

const _whatsappNumber = '573000000000'; // Demo number — replace with real support number
const _supportEmail = 'soporte@nexum.com.co';

class HelpCenterScreen extends StatelessWidget {
  const HelpCenterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Ayuda y soporte'),
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppConstants.spacingM),
        children: [
          _ContactBanner(
            onWhatsApp: () => _launchWhatsApp(context),
            onEmail: () => _launchEmail(context),
          ),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionLabel('Preguntas frecuentes'),
          const SizedBox(height: AppConstants.spacingS),
          ..._faqs.map((faq) => _FaqTile(faq: faq)),
          const SizedBox(height: AppConstants.spacingL),
          const _SectionLabel('Reportar un problema'),
          const SizedBox(height: AppConstants.spacingS),
          const _ReportForm(),
          const SizedBox(height: _spacingXL),
        ],
      ),
    );
  }

  Future<void> _launchWhatsApp(BuildContext context) async {
    final uri = Uri.parse(
        'https://wa.me/$_whatsappNumber?text=Hola, necesito ayuda con Nexum');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir WhatsApp')),
        );
      }
    }
  }

  Future<void> _launchEmail(BuildContext context) async {
    final uri = Uri(
      scheme: 'mailto',
      path: _supportEmail,
      queryParameters: {'subject': 'Soporte Nexum'},
    );
    if (!await launchUrl(uri)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir el correo')),
        );
      }
    }
  }
}

// ── Contact banner ────────────────────────────────────────────────────────────

class _ContactBanner extends StatelessWidget {
  const _ContactBanner({required this.onWhatsApp, required this.onEmail});

  final VoidCallback onWhatsApp;
  final VoidCallback onEmail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingL),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDim],
        ),
        borderRadius: BorderRadius.circular(AppConstants.radiusLarge),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.support_agent_rounded, color: Colors.white, size: 28),
              SizedBox(width: AppConstants.spacingS),
              Text(
                'Soporte Nexum',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppConstants.spacingS),
          Text(
            'Respondemos en menos de 5 minutos por WhatsApp.',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: AppConstants.spacingM),
          Row(
            children: [
              Expanded(
                child: _ContactButton(
                  icon: Icons.chat_rounded,
                  label: 'WhatsApp',
                  onTap: onWhatsApp,
                  bgColor: Colors.white,
                  fgColor: AppColors.primaryDim,
                ),
              ),
              const SizedBox(width: AppConstants.spacingS),
              Expanded(
                child: _ContactButton(
                  icon: Icons.email_rounded,
                  label: 'Correo',
                  onTap: onEmail,
                  bgColor: Colors.white.withValues(alpha: 0.2),
                  fgColor: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ContactButton extends StatelessWidget {
  const _ContactButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.bgColor,
    required this.fgColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color bgColor;
  final Color fgColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: bgColor,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: fgColor, size: 18),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: fgColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

class _FaqItem {
  const _FaqItem(this.question, this.answer);
  final String question;
  final String answer;
}

const _faqs = [
  _FaqItem(
    '¿Cómo funciona la cadena de custodia?',
    'El conductor toma una foto de tu pedido al recogerlo en el negocio y otra foto al entregártelo. '
        'Ambas fotos quedan guardadas en tu historial para que puedas verificar que todo llegó completo.',
  ),
  _FaqItem(
    '¿Cuánto tarda mi pedido en llegar?',
    'El tiempo estimado se muestra en la pantalla de seguimiento. '
        'Generalmente entre 20 y 45 minutos dependiendo de la distancia y el tráfico.',
  ),
  _FaqItem(
    '¿Puedo cancelar mi pedido?',
    'Puedes cancelar mientras el estado sea "Confirmado". '
        'Una vez el conductor esté en camino al negocio, la cancelación puede tener cargos.',
  ),
  _FaqItem(
    '¿Cómo pago mi pedido?',
    'Aceptamos efectivo al recibir, tarjeta débito/crédito y Nequi. '
        'Puedes administrar tus métodos de pago desde tu perfil.',
  ),
  _FaqItem(
    '¿Qué hago si mi pedido llegó incompleto o equivocado?',
    'Repórtalo usando el formulario de abajo o contáctanos por WhatsApp con el número de pedido. '
        'Investigamos cada caso con las fotos de la cadena de custodia.',
  ),
  _FaqItem(
    '¿Cómo calificar al conductor?',
    'Al finalizar la entrega te aparece una pantalla de calificación con estrellas y comentario opcional. '
        'También puedes calificar desde el historial de pedidos.',
  ),
];

class _FaqTile extends StatefulWidget {
  const _FaqTile({required this.faq});
  final _FaqItem faq;

  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: AppColors.outlineLight),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(
              horizontal: AppConstants.spacingM, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(
              AppConstants.spacingM, 0, AppConstants.spacingM, AppConstants.spacingM),
          leading: const Icon(Icons.help_outline_rounded,
              color: AppColors.primary, size: 20),
          title: Text(
            widget.faq.question,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          trailing: AnimatedRotation(
            turns: _expanded ? 0.5 : 0,
            duration: const Duration(milliseconds: 200),
            child: const Icon(Icons.keyboard_arrow_down_rounded,
                color: AppColors.textSecondary),
          ),
          onExpansionChanged: (v) => setState(() => _expanded = v),
          children: [
            Text(
              widget.faq.answer,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Report form ───────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.textSecondary,
          letterSpacing: 0.4,
        ),
      );
}

const _spacingXL = 32.0;

class _ReportForm extends StatefulWidget {
  const _ReportForm();

  @override
  State<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<_ReportForm> {
  final _orderCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  String _category = 'Pedido incompleto';
  bool _sent = false;

  static const _categories = [
    'Pedido incompleto',
    'Pedido equivocado',
    'Conductor no llegó',
    'Conductor no tomó foto',
    'Cobro incorrecto',
    'Otro',
  ];

  @override
  void dispose() {
    _orderCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (_descCtrl.text.trim().isEmpty) return;
    setState(() => _sent = true);
  }

  @override
  Widget build(BuildContext context) {
    if (_sent) {
      return Container(
        padding: const EdgeInsets.all(AppConstants.spacingL),
        decoration: BoxDecoration(
          color: AppColors.primaryContainer,
          borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        ),
        child: const Column(
          children: [
            Icon(Icons.check_circle_rounded,
                color: AppColors.primary, size: 40),
            SizedBox(height: AppConstants.spacingS),
            Text(
              'Reporte enviado',
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: AppColors.primaryDim),
            ),
            SizedBox(height: 4),
            Text(
              'Recibirás respuesta en máximo 24 horas.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 13, color: AppColors.primaryDim),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(color: AppColors.outlineLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _orderCtrl,
            decoration: const InputDecoration(
              labelText: 'Número de pedido (opcional)',
              hintText: 'P-2025-0001',
            ),
            keyboardType: TextInputType.text,
          ),
          const SizedBox(height: AppConstants.spacingM),
          DropdownButtonFormField<String>(
            value: _category,
            decoration: const InputDecoration(labelText: 'Tipo de problema'),
            items: _categories
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (v) => setState(() => _category = v!),
          ),
          const SizedBox(height: AppConstants.spacingM),
          TextField(
            controller: _descCtrl,
            decoration: const InputDecoration(
              labelText: 'Descripción',
              hintText: '¿Qué ocurrió exactamente?',
              alignLabelWithHint: true,
            ),
            maxLines: 4,
            maxLength: 500,
          ),
          const SizedBox(height: AppConstants.spacingM),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _submit,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('Enviar reporte'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
