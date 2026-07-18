import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/widgets/app_snackbar.dart';
import 'package:nexum_driver/features/support/data/support_api.dart';
import 'package:nexum_driver/features/support/presentation/screens/support_ticket_detail_screen.dart';
import 'package:nexum_driver/features/support/presentation/widgets/support_common.dart';

class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Soporte'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'FAQ'),
            Tab(text: 'Mis tickets'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _FaqTab(),
          _TicketsTab(),
        ],
      ),
    );
  }
}

// ── FAQ tab ────────────────────────────────────────────────────────────────────

class _FaqTab extends StatefulWidget {
  const _FaqTab();

  @override
  State<_FaqTab> createState() => _FaqTabState();
}

class _FaqTabState extends State<_FaqTab> {
  int? _expanded;
  String _query = '';

  List<_Faq> get _filtered {
    if (_query.isEmpty) return _faqs;
    final q = _query.toLowerCase();
    return _faqs
        .where((f) =>
            f.question.toLowerCase().contains(q) ||
            f.answer.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: 'Buscar en FAQ...',
            prefixIcon: const Icon(Icons.search_rounded),
            border: OutlineInputBorder(
              borderRadius:
                  BorderRadius.circular(AppConstants.radiusCircular),
            ),
          ),
          onChanged: (v) => setState(() {
            _query = v;
            _expanded = null;
          }),
        ),
        const SizedBox(height: AppConstants.spacingL),
        Text(
          _query.isEmpty
              ? 'Preguntas más comunes'
              : '${filtered.length} resultado${filtered.length == 1 ? '' : 's'}',
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppConstants.spacingM),
        if (filtered.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.only(top: AppConstants.spacingXL),
              child: Column(
                children: [
                  Icon(Icons.search_off_rounded,
                      size: 48, color: context.textTertiaryColor),
                  const SizedBox(height: AppConstants.spacingM),
                  Text(
                    'Sin resultados para "$_query"',
                    style: TextStyle(color: context.textSecondaryColor),
                  ),
                ],
              ),
            ),
          )
        else
          ...filtered.asMap().entries.map(
                (e) => _FaqItem(
                  faq: e.value,
                  isExpanded: _expanded == e.key,
                  onTap: () => setState(
                      () => _expanded = _expanded == e.key ? null : e.key),
                ),
              ),
      ],
    );
  }
}

class _FaqItem extends StatelessWidget {
  const _FaqItem({
    required this.faq,
    required this.isExpanded,
    required this.onTap,
  });

  final _Faq faq;
  final bool isExpanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : context.surfaceColor,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isExpanded
              ? AppColors.primary
              : (isDark ? AppColors.outlineDark : context.outlineColor),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Column(
          children: [
            ListTile(
              leading:
                  Icon(faq.icon, color: AppColors.primary, size: 20),
              title: Text(
                faq.question,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
              ),
              trailing: AnimatedRotation(
                turns: isExpanded ? 0.5 : 0,
                duration: AppConstants.shortAnimation,
                child: Icon(Icons.expand_more_rounded,
                    color: context.textSecondaryColor),
              ),
              onTap: onTap,
            ),
            if (isExpanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingL + 4,
                  0,
                  AppConstants.spacingM,
                  AppConstants.spacingM,
                ),
                child: Text(
                  faq.answer,
                  style: theme.textTheme.bodySmall?.copyWith(
                      color: context.textSecondaryColor, height: 1.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Tickets tab (real, backend) ────────────────────────────────────────────────

class _TicketsTab extends StatefulWidget {
  const _TicketsTab();

  @override
  State<_TicketsTab> createState() => _TicketsTabState();
}

class _TicketsTabState extends State<_TicketsTab> {
  final _api = SupportApi();
  bool _loading = true;
  String? _error;
  List<SupportTicket> _tickets = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _api.list();
      if (!mounted) return;
      setState(() {
        _tickets = list;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'No se pudo cargar tus tickets.';
        _loading = false;
      });
    }
  }

  Future<void> _openDetail(SupportTicket t) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => SupportTicketDetailScreen(ticketId: t.id),
    ));
    _load();
  }

  Future<void> _newTicket() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _NewTicketSheet(api: _api),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newTicket,
        backgroundColor: AppColors.primary,
        icon: const Icon(Icons.add_comment_rounded, color: Colors.white),
        label: const Text('Nuevo ticket', style: TextStyle(color: Colors.white)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? Center(child: Text(_error!, style: TextStyle(color: context.textSecondaryColor)))
              : _tickets.isEmpty
                  ? _empty(context)
                  : RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                        itemCount: _tickets.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) =>
                            _TicketTile(ticket: _tickets[i], onTap: () => _openDetail(_tickets[i])),
                      ),
                    ),
    );
  }

  Widget _empty(BuildContext context) => ListView(
        children: [
          const SizedBox(height: 100),
          Icon(Icons.confirmation_number_outlined, size: 48, color: context.textTertiaryColor),
          const SizedBox(height: 12),
          Center(
            child: Text('No tienes tickets abiertos',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 6),
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Si tienes un problema con un viaje, un pago o tus documentos, '
                'abre un ticket y le haremos seguimiento.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
              ),
            ),
          ),
        ],
      );
}

class _TicketTile extends StatelessWidget {
  const _TicketTile({required this.ticket, required this.onTap});

  final SupportTicket ticket;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.cardColor2,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.outlineColor),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(ticket.subject,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  if (ticket.lastMessage != null) ...[
                    const SizedBox(height: 3),
                    Text(ticket.lastMessage!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: context.textSecondaryColor)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            SupportStatusChip(status: ticket.status),
          ],
        ),
      ),
    );
  }
}

class _NewTicketSheet extends StatefulWidget {
  const _NewTicketSheet({required this.api});
  final SupportApi api;

  @override
  State<_NewTicketSheet> createState() => _NewTicketSheetState();
}

class _NewTicketSheetState extends State<_NewTicketSheet> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _category = 'general';
  bool _sending = false;

  static const _categories = {
    'general': 'General',
    'pago': 'Pagos',
    'viaje': 'Viajes',
    'cuenta': 'Cuenta',
    'seguridad': 'Seguridad',
    'otro': 'Otro',
  };

  Future<void> _submit() async {
    final subject = _subject.text.trim();
    final body = _body.text.trim();
    if (subject.isEmpty || body.isEmpty) {
      AppSnackbar.showError(context, 'Completa el asunto y la descripción.');
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.api.create(subject: subject, body: body, category: _category);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      AppSnackbar.showError(context, 'No se pudo crear el ticket.');
    }
  }

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Nuevo ticket de soporte',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            children: _categories.entries
                .map((e) => ChoiceChip(
                      label: Text(e.value),
                      selected: _category == e.key,
                      onSelected: (_) => setState(() => _category = e.key),
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _subject,
            decoration: const InputDecoration(labelText: 'Asunto'),
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _body,
            decoration: const InputDecoration(labelText: 'Describe tu problema'),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: _sending ? null : _submit,
              child: _sending
                  ? const SizedBox(
                      width: 18, height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Enviar', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Faq {
  const _Faq({
    required this.icon,
    required this.question,
    required this.answer,
  });
  final IconData icon;
  final String question;
  final String answer;
}

const _faqs = [
  _Faq(
    icon: Icons.payments_outlined,
    question: '¿Cuándo recibo mis pagos?',
    answer:
        'Los pagos se acreditan automáticamente en tu billetera ZIPA al finalizar cada viaje. Puedes solicitar retiros a tu cuenta bancaria en cualquier momento desde la sección Billetera.',
  ),
  _Faq(
    icon: Icons.cancel_outlined,
    question: '¿Qué pasa si cancelo muchos viajes?',
    answer:
        'Una tasa de cancelación mayor al 5% puede afectar tu puntuación y acceso a incentivos. Si necesitas cancelar, hazlo antes de dirigirte al punto de recogida para minimizar el impacto.',
  ),
  _Faq(
    icon: Icons.star_outline_rounded,
    question: '¿Cómo mejorar mi calificación?',
    answer:
        'Mantén el vehículo limpio, sé puntual, confirma los datos del pasajero al subir y ofrece un trato amable. Las calificaciones de 5 estrellas mejoran tu posición para recibir viajes premium.',
  ),
  _Faq(
    icon: Icons.local_taxi_rounded,
    question: '¿Puedo cambiar mi tipo de servicio?',
    answer:
        'Sí, puedes cambiar entre Moto, Particular, Taxi, Moto-carro y Envíos desde la pantalla principal. Asegúrate de que tu vehículo cumpla los requisitos del tipo seleccionado.',
  ),
  _Faq(
    icon: Icons.document_scanner_rounded,
    question: '¿Qué documentos necesito tener al día?',
    answer:
        'Licencia de conducción vigente, SOAT al día, revisión técnico-mecánica (si aplica) y tarjeta de operación. ZIPA puede solicitarte verificación en cualquier momento.',
  ),
  _Faq(
    icon: Icons.account_balance_rounded,
    question: '¿Cómo agrego mi cuenta bancaria?',
    answer:
        'Ve a Billetera → Cuenta bancaria → Agregar cuenta. Puedes vincular cuentas de Bancolombia, Nequi, Daviplata, BBVA y otros bancos del sistema financiero colombiano.',
  ),
  _Faq(
    icon: Icons.card_giftcard_rounded,
    question: '¿Cómo funcionan los bonos e incentivos?',
    answer:
        'ZIPA ofrece bonos por metas de viajes semanales, zonas de alta demanda (surge) y calificación perfecta. Los bonos se acreditan automáticamente en tu billetera al cumplir los requisitos.',
  ),
  _Faq(
    icon: Icons.block_rounded,
    question: '¿Por qué puede bloquearse mi cuenta?',
    answer:
        'Las causas más comunes son: tasa de cancelación alta (>5%), reportes de pasajeros, documentos vencidos o comportamiento contrario a las políticas de ZIPA. Contacta soporte para apelar una suspensión.',
  ),
];

