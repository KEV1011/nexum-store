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
            Tab(text: 'Preguntas frecuentes'),
            Tab(text: 'Chat de soporte'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _FaqTab(),
          _ChatTab(),
        ],
      ),
    );
  }
}

class _FaqTab extends StatefulWidget {
  const _FaqTab();

  @override
  State<_FaqTab> createState() => _FaqTabState();
}

class _FaqTabState extends State<_FaqTab> {
  int? _expanded;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppConstants.spacingM),
      children: [
        // Search
        TextField(
          decoration: InputDecoration(
            hintText: 'Buscar en FAQ...',
            prefixIcon: const Icon(Icons.search_rounded),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppConstants.radiusCircular),
            ),
          ),
          onChanged: (_) {},
        ),
        const SizedBox(height: AppConstants.spacingL),
        Text(
          'Preguntas más comunes',
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppConstants.spacingM),
        ..._faqs.asMap().entries.map(
          (e) => _FaqItem(
            faq: e.value,
            isExpanded: _expanded == e.key,
            onTap: () =>
                setState(() => _expanded = _expanded == e.key ? null : e.key),
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
              leading: Icon(faq.icon, color: AppColors.primary, size: 20),
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
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: AppColors.textSecondary, height: 1.5),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ChatTab extends StatefulWidget {
  const _ChatTab();

  @override
  State<_ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<_ChatTab> {
  final _controller = TextEditingController();
  final _messages = <_ChatMessage>[
    const _ChatMessage(
      text: 'Hola, soy el asistente virtual de Nexum. ¿En qué puedo ayudarte hoy?',
      isAgent: true,
      time: '09:00',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add(_ChatMessage(
        text: text,
        isAgent: false,
        time: _formatNow(),
      ));
      _controller.clear();
    });
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      setState(() {
        _messages.add(_ChatMessage(
          text: 'Gracias por tu mensaje. Un agente de soporte te responderá pronto. Tiempo estimado de respuesta: 5 minutos.',
          isAgent: true,
          time: _formatNow(),
        ));
      });
    });
  }

  String _formatNow() {
    final now = DateTime.now();
    return '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Status bar
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
            padding: const EdgeInsets.all(AppConstants.spacingM),
            itemCount: _messages.length,
            itemBuilder: (context, i) =>
                _ChatBubble(message: _messages[i]),
          ),
        ),
        _ChatInput(
          controller: _controller,
          onSend: _sendMessage,
        ),
      ],
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
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
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
            bottomLeft: Radius.circular(isAgent ? 0 : AppConstants.radiusLarge),
            bottomRight:
                Radius.circular(isAgent ? AppConstants.radiusLarge : 0),
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
  const _ChatInput({
    required this.controller,
    required this.onSend,
  });

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
        bottom: MediaQuery.of(context).padding.bottom + AppConstants.spacingS,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.outlineDark : AppColors.outlineLight,
          ),
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
                  horizontal: AppConstants.spacingS,
                ),
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
        'Una tasa de cancelación mayor al 5% puede afectar tu puntuación y acceso a incentivos. Si necesitas cancelar, hazlo antes de dirigirte al punto de recogida.',
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
        'Licencia de conducción vigente, SOAT al día, revisión técnico-mecánica (si aplica) y documentos del vehículo. Nexum puede solicitarte verificación en cualquier momento.',
  ),
  _Faq(
    icon: Icons.account_balance_rounded,
    question: '¿Cómo agrego mi cuenta bancaria?',
    answer:
        'Ve a Billetera → Cuenta bancaria → Agregar cuenta. Puedes vincular cuentas de Bancolombia, Nequi, Daviplata, entre otros.',
  ),
];
