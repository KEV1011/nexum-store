import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/support/data/support_api.dart';
import 'package:nexum_client/features/support/presentation/widgets/support_common.dart';

/// Hilo de un ticket: mensajes del usuario y del soporte + responder.
class SupportTicketDetailScreen extends ConsumerStatefulWidget {
  const SupportTicketDetailScreen({required this.ticketId, this.basePath = '/client', super.key});

  final String ticketId;
  final String basePath;

  @override
  ConsumerState<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends ConsumerState<SupportTicketDetailScreen> {
  late final SupportApi _api;
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  bool _loading = true;
  bool _sending = false;
  SupportTicket? _ticket;

  @override
  void initState() {
    super.initState();
    _api = SupportApi(ref.read(apiClientProvider), basePath: widget.basePath);
    _load();
  }

  Future<void> _load() async {
    try {
      final t = await _api.detail(widget.ticketId);
      if (!mounted) return;
      setState(() {
        _ticket = t;
        _loading = false;
      });
      _scrollToBottom();
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final t = await _api.reply(widget.ticketId, text);
      if (!mounted) return;
      _ctrl.clear();
      setState(() {
        _ticket = t;
        _sending = false;
      });
      _scrollToBottom();
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      AppSnackbar.showError(context, 'No se pudo enviar el mensaje.');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = _ticket;
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
        title: Text(t?.subject ?? 'Ticket', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          if (t != null)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(child: SupportStatusChip(status: t.status)),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : t == null
              ? Center(child: Text('No se pudo cargar el ticket.',
                  style: TextStyle(color: context.textSecondaryColor)))
              : Column(
                  children: [
                    Expanded(
                      child: ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: t.messages.length,
                        itemBuilder: (_, i) => _Bubble(msg: t.messages[i]),
                      ),
                    ),
                    if (t.status == 'CLOSED')
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text('Este ticket está cerrado. Escribe para reabrirlo.',
                            style: TextStyle(fontSize: 12.5, color: context.textTertiaryColor)),
                      ),
                    _composer(context),
                  ],
                ),
    );
  }

  Widget _composer(BuildContext context) => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            border: Border(top: BorderSide(color: context.outlineColor)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: 'Escribe tu mensaje…',
                    filled: true,
                    fillColor: context.surfaceVariantColor,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              CircleAvatar(
                backgroundColor: AppColors.primary,
                child: IconButton(
                  icon: _sending
                      ? const SizedBox(
                          width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  onPressed: _sending ? null : _send,
                ),
              ),
            ],
          ),
        ),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.msg});
  final SupportMessage msg;

  @override
  Widget build(BuildContext context) {
    final mine = msg.isMine;
    final time =
        '${msg.sentAt.hour.toString().padLeft(2, '0')}:${msg.sentAt.minute.toString().padLeft(2, '0')}';
    final label = msg.isSupport ? 'Soporte Nexum' : null;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary : context.surfaceColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: context.outlineColor),
        ),
        child: Column(
          crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (label != null) ...[
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
              const SizedBox(height: 2),
            ],
            Text(msg.body,
                style: TextStyle(
                    color: mine ? Colors.white : context.textPrimaryColor, fontSize: 14.5)),
            const SizedBox(height: 2),
            Text(time,
                style: TextStyle(
                    color: mine ? Colors.white70 : context.textTertiaryColor, fontSize: 10.5)),
          ],
        ),
      ),
    );
  }
}
