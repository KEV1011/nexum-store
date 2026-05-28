import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';

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
    _tabController = TabController(length: 3, vsync: this);
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
            Tab(text: 'Chat'),
            Tab(text: 'Mis tickets'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _FaqTab(),
          _ChatTab(),
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
                  const Icon(Icons.search_off_rounded,
                      size: 48, color: AppColors.textTertiary),
                  const SizedBox(height: AppConstants.spacingM),
                  Text(
                    'Sin resultados para "$_query"',
                    style: const TextStyle(color: AppColors.textSecondary),
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
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isExpanded
              ? AppColors.primary
              : (isDark ? AppColors.outlineDark : AppColors.outlineLight),
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
                child: const Icon(Icons.expand_more_rounded,
                    color: AppColors.textSecondary),
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
                      color: AppColors.textSecondary, height: 1.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Chat tab ───────────────────────────────────────────────────────────────────

class _ChatTab extends StatefulWidget {
  const _ChatTab();

  @override
  State<_ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<_ChatTab> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  bool _isTyping = false;

  final _messages = <_ChatMessage>[
    const _ChatMessage(
      text:
          'Hola, soy el asistente virtual de Nexum. ¿En qué puedo ayudarte hoy?',
      isAgent: true,
      time: '09:00',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add(
          _ChatMessage(text: text, isAgent: false, time: _formatNow()));
      _controller.clear();
      _isTyping = true;
    });
    _scrollToBottom();
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (!mounted) return;
      setState(() {
        _isTyping = false;
        _messages.add(_ChatMessage(
          text: _autoReply(text),
          isAgent: true,
          time: _formatNow(),
        ));
      });
      _scrollToBottom();
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: AppConstants.shortAnimation,
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _autoReply(String text) {
    final lower = text.toLowerCase();
    if (lower.contains('pago') ||
        lower.contains('cobro') ||
        lower.contains('ganancia')) {
      return 'Los pagos se acreditan en tu billetera Nexum al finalizar cada viaje. Puedes solicitar retiros a tu cuenta bancaria en cualquier momento desde la sección Billetera.';
    }
    if (lower.contains('cancel')) {
      return 'Una tasa de cancelación mayor al 5% puede afectar tu puntuación y acceso a incentivos. Te recomendamos cancelar antes de dirigirte al punto de recogida si es necesario.';
    }
    if (lower.contains('calificaci') ||
        lower.contains('estrell') ||
        lower.contains('rating') ||
        lower.contains('punt')) {
      return 'Para mejorar tu calificación mantén el vehículo limpio, sé puntual y ofrece un trato amable. Las 5 estrellas te dan acceso a viajes premium y bonos adicionales.';
    }
    if (lower.contains('document') ||
        lower.contains('soat') ||
        lower.contains('licencia')) {
      return 'Debes tener vigentes: licencia de conducción, SOAT, revisión técnico-mecánica y tarjeta de operación. Puedes revisar su estado en tu perfil de conductor.';
    }
    if (lower.contains('banco') ||
        lower.contains('cuenta') ||
        lower.contains('retiro') ||
        lower.contains('nequi') ||
        lower.contains('daviplata')) {
      return 'Puedes gestionar tu cuenta bancaria en Billetera → Cuenta bancaria. Aceptamos Bancolombia, Nequi, Daviplata, BBVA y más entidades.';
    }
    if (lower.contains('servicio') ||
        lower.contains('moto') ||
        lower.contains('taxi') ||
        lower.contains('particular')) {
      return 'Puedes cambiar tu tipo de servicio desde la pantalla principal. Asegúrate de que tu vehículo cumpla los requisitos del tipo seleccionado.';
    }
    if (lower.contains('bono') ||
        lower.contains('incentivo') ||
        lower.contains('meta')) {
      return 'Los bonos se acreditan automáticamente al cumplir las metas semanales de viajes o calificación. Revisa las promociones activas en la sección Ganancias.';
    }
    if (lower.contains('bloqu') || lower.contains('suspend')) {
      return 'Los bloqueos de cuenta pueden deberse a cancelaciones frecuentes, reportes de pasajeros o documentos vencidos. Abre un ticket de soporte para revisar tu caso.';
    }
    if (lower.contains('hola') ||
        lower.contains('buenas') ||
        lower.contains('buenos') ||
        lower.contains('salud')) {
      return '¡Hola! ¿En qué puedo ayudarte hoy? Puedo orientarte sobre pagos, documentos, calificaciones, tipos de servicio y más.';
    }
    if (lower.contains('gracias') || lower.contains('ok') || lower.contains('listo')) {
      return '¡Con gusto! Si tienes otra pregunta no dudes en escribirme. ¡Buen turno!';
    }
    return 'Gracias por tu mensaje. Un agente de soporte te responderá pronto. Tiempo estimado de respuesta: 5 minutos.';
  }

  String _formatNow() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppConstants.spacingM,
            vertical: AppConstants.spacingXS,
          ),
          color: AppColors.successContainer,
          child: const Row(
            children: [
              Icon(Icons.circle, size: 8, color: AppColors.success),
              SizedBox(width: AppConstants.spacingS),
              Text(
                'Soporte disponible · Tiempo de respuesta: ~5 min',
                style: TextStyle(
                  fontSize: 12,
                  color: AppColors.primaryDim,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.all(AppConstants.spacingM),
            itemCount: _messages.length + (_isTyping ? 1 : 0),
            itemBuilder: (context, i) {
              if (_isTyping && i == _messages.length) {
                return const _TypingIndicator();
              }
              return _ChatBubble(message: _messages[i]);
            },
          ),
        ),
        _ChatInput(controller: _controller, onSend: _sendMessage),
      ],
    );
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isDark
              ? AppColors.surfaceVariantDark
              : AppColors.surfaceVariantLight,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(AppConstants.radiusLarge),
            topRight: Radius.circular(AppConstants.radiusLarge),
            bottomRight: Radius.circular(AppConstants.radiusLarge),
          ),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Dot(delay: 0),
            SizedBox(width: 4),
            _Dot(delay: 150),
            SizedBox(width: 4),
            _Dot(delay: 300),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  const _Dot({required this.delay});
  final int delay;

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _ac;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _anim = Tween<double>(begin: 0, end: -6).animate(
      CurvedAnimation(parent: _ac, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ac.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) => Transform.translate(
        offset: Offset(0, _anim.value),
        child: Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: AppColors.textTertiary,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  const _ChatBubble({required this.message});
  final _ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAgent = message.isAgent;

    return Align(
      alignment: isAgent ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        padding: const EdgeInsets.symmetric(
          horizontal: AppConstants.spacingM,
          vertical: AppConstants.spacingS,
        ),
        decoration: BoxDecoration(
          color: isAgent
              ? (theme.brightness == Brightness.dark
                  ? AppColors.surfaceVariantDark
                  : AppColors.surfaceVariantLight)
              : AppColors.primary,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppConstants.radiusLarge),
            topRight: const Radius.circular(AppConstants.radiusLarge),
            bottomLeft: Radius.circular(
                isAgent ? 0 : AppConstants.radiusLarge),
            bottomRight: Radius.circular(
                isAgent ? AppConstants.radiusLarge : 0),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              isAgent ? CrossAxisAlignment.start : CrossAxisAlignment.end,
          children: [
            Text(
              message.text,
              style: theme.textTheme.bodySmall?.copyWith(
                color: isAgent ? null : Colors.white,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              message.time,
              style: TextStyle(
                fontSize: 10,
                color: isAgent ? AppColors.textTertiary : Colors.white70,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatInput extends StatelessWidget {
  const _ChatInput({required this.controller, required this.onSend});
  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: EdgeInsets.only(
        left: AppConstants.spacingM,
        right: AppConstants.spacingS,
        top: AppConstants.spacingS,
        bottom:
            MediaQuery.of(context).padding.bottom + AppConstants.spacingS,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        border: Border(
          top: BorderSide(
              color:
                  isDark ? AppColors.outlineDark : AppColors.outlineLight),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Escribe un mensaje...',
                border: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.symmetric(
                    horizontal: AppConstants.spacingS),
              ),
              maxLines: null,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
            ),
          ),
          IconButton(
            onPressed: onSend,
            icon: const Icon(Icons.send_rounded),
            color: AppColors.primary,
          ),
        ],
      ),
    );
  }
}

// ── Tickets tab ────────────────────────────────────────────────────────────────

class _TicketsTab extends StatefulWidget {
  const _TicketsTab();

  @override
  State<_TicketsTab> createState() => _TicketsTabState();
}

class _TicketsTabState extends State<_TicketsTab> {
  String? _expandedId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Mis tickets de soporte',
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            OutlinedButton.icon(
              onPressed: () =>
                  ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content:
                        Text('Formulario de nuevo ticket próximamente')),
              ),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Nuevo'),
            ),
          ],
        ),
        const SizedBox(height: AppConstants.spacingM),
        ..._mockTickets.map(
          (t) => _TicketCard(
            ticket: t,
            isExpanded: _expandedId == t.id,
            onTap: () => setState(
              () => _expandedId = _expandedId == t.id ? null : t.id,
            ),
          ),
        ),
      ],
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({
    required this.ticket,
    required this.isExpanded,
    required this.onTap,
  });
  final _Ticket ticket;
  final bool isExpanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final (statusLabel, statusColor, statusBg) = _statusStyle(ticket.status);

    return Container(
      margin: const EdgeInsets.only(bottom: AppConstants.spacingS),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        border: Border.all(
          color: isExpanded
              ? AppColors.primary
              : (isDark ? AppColors.outlineDark : AppColors.outlineLight),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppConstants.radiusMedium),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius:
                      BorderRadius.circular(AppConstants.radiusSmall),
                ),
                child: Icon(_statusIcon(ticket.status),
                    size: 18, color: statusColor),
              ),
              title: Text(
                ticket.subject,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${ticket.id} · ${ticket.date}',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: AppColors.textSecondary),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusBg,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: statusColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  AnimatedRotation(
                    turns: isExpanded ? 0.5 : 0,
                    duration: AppConstants.shortAnimation,
                    child: const Icon(Icons.expand_more_rounded,
                        color: AppColors.textSecondary),
                  ),
                ],
              ),
              onTap: onTap,
            ),
            if (isExpanded)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppConstants.spacingL,
                  0,
                  AppConstants.spacingM,
                  AppConstants.spacingM,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Divider(),
                    const SizedBox(height: AppConstants.spacingS),
                    Text(
                      'Descripción',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppColors.textTertiary,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      ticket.description,
                      style: theme.textTheme.bodySmall?.copyWith(
                          color: AppColors.textSecondary, height: 1.5),
                    ),
                    if (ticket.status == _TicketStatus.resolved) ...[
                      const SizedBox(height: AppConstants.spacingM),
                      Container(
                        padding: const EdgeInsets.all(AppConstants.spacingS),
                        decoration: BoxDecoration(
                          color: AppColors.successContainer,
                          borderRadius: BorderRadius.circular(
                              AppConstants.radiusSmall),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.check_circle_rounded,
                                size: 16, color: AppColors.success),
                            SizedBox(width: 6),
                            Text(
                              'Ticket resuelto. ¿Necesitas ayuda adicional? Abre un nuevo ticket.',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.primaryDim,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  (String, Color, Color) _statusStyle(_TicketStatus s) => switch (s) {
        _TicketStatus.open => (
            'Abierto',
            AppColors.warning,
            AppColors.warningContainer
          ),
        _TicketStatus.inProgress => (
            'En proceso',
            AppColors.info,
            AppColors.infoContainer
          ),
        _TicketStatus.resolved => (
            'Resuelto',
            AppColors.success,
            AppColors.successContainer
          ),
      };

  IconData _statusIcon(_TicketStatus s) => switch (s) {
        _TicketStatus.open => Icons.pending_outlined,
        _TicketStatus.inProgress => Icons.sync_rounded,
        _TicketStatus.resolved => Icons.check_circle_outline_rounded,
      };
}

// ── Models ─────────────────────────────────────────────────────────────────────

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

class _ChatMessage {
  const _ChatMessage({
    required this.text,
    required this.isAgent,
    required this.time,
  });
  final String text;
  final bool isAgent;
  final String time;
}

enum _TicketStatus { open, inProgress, resolved }

class _Ticket {
  const _Ticket({
    required this.id,
    required this.subject,
    required this.description,
    required this.date,
    required this.status,
  });
  final String id;
  final String subject;
  final String description;
  final String date;
  final _TicketStatus status;
}

// ── Static data ────────────────────────────────────────────────────────────────

const _faqs = [
  _Faq(
    icon: Icons.payments_outlined,
    question: '¿Cuándo recibo mis pagos?',
    answer:
        'Los pagos se acreditan automáticamente en tu billetera Nexum al finalizar cada viaje. Puedes solicitar retiros a tu cuenta bancaria en cualquier momento desde la sección Billetera.',
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
        'Licencia de conducción vigente, SOAT al día, revisión técnico-mecánica (si aplica) y tarjeta de operación. Nexum puede solicitarte verificación en cualquier momento.',
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
        'Nexum ofrece bonos por metas de viajes semanales, zonas de alta demanda (surge) y calificación perfecta. Los bonos se acreditan automáticamente en tu billetera al cumplir los requisitos.',
  ),
  _Faq(
    icon: Icons.block_rounded,
    question: '¿Por qué puede bloquearse mi cuenta?',
    answer:
        'Las causas más comunes son: tasa de cancelación alta (>5%), reportes de pasajeros, documentos vencidos o comportamiento contrario a las políticas de Nexum. Contacta soporte para apelar una suspensión.',
  ),
];

const _mockTickets = [
  _Ticket(
    id: '#10342',
    subject: 'Cobro incorrecto en viaje del 15 de mayo',
    description:
        'El monto cobrado fue mayor al acordado con el pasajero. Solicito revisión del viaje #VJ-20250515-001. La tarifa aplicada fue \$18.500 pero el valor acordado era \$14.000.',
    date: '15 may 2025',
    status: _TicketStatus.inProgress,
  ),
  _Ticket(
    id: '#10198',
    subject: 'Actualización de cuenta bancaria a Nequi',
    description:
        'Solicité el cambio de mi cuenta bancaria de Bancolombia a Nequi el 2 de mayo. El proceso fue exitoso y mi información bancaria está actualizada.',
    date: '2 may 2025',
    status: _TicketStatus.resolved,
  ),
  _Ticket(
    id: '#9847',
    subject: 'Problema con verificación de SOAT',
    description:
        'Mi SOAT fue rechazado por error del sistema. El documento está vigente hasta diciembre de 2025. Adjunté la póliza digital para revisión.',
    date: '18 abr 2025',
    status: _TicketStatus.resolved,
  ),
];
