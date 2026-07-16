import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/support/data/support_api.dart';
import 'package:nexum_client/features/support/presentation/screens/support_ticket_detail_screen.dart';
import 'package:nexum_client/features/support/presentation/widgets/support_common.dart';

/// Centro de ayuda: lista de tickets del usuario + abrir uno nuevo.
/// Reutilizable por ambas apps vía [basePath] ('/client' o '/driver').
class SupportTicketsScreen extends ConsumerStatefulWidget {
  const SupportTicketsScreen({this.basePath = '/client', super.key});

  final String basePath;

  @override
  ConsumerState<SupportTicketsScreen> createState() => _SupportTicketsScreenState();
}

class _SupportTicketsScreenState extends ConsumerState<SupportTicketsScreen> {
  late final SupportApi _api;
  bool _loading = true;
  String? _error;
  List<SupportTicket> _tickets = [];

  @override
  void initState() {
    super.initState();
    _api = SupportApi(ref.read(apiClientProvider), basePath: widget.basePath);
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
      builder: (_) => SupportTicketDetailScreen(ticketId: t.id, basePath: widget.basePath),
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
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: const Text('Ayuda y soporte'),
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
      ),
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
          const SizedBox(height: 120),
          Icon(Icons.support_agent_rounded, size: 64, color: context.textTertiaryColor),
          const SizedBox(height: 16),
          Center(
            child: Text('Aún no tienes tickets.',
                style: TextStyle(fontSize: 15, color: context.textSecondaryColor)),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text('Toca "Nuevo ticket" si necesitas ayuda.',
                style: TextStyle(fontSize: 13, color: context.textTertiaryColor)),
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
          color: context.surfaceColor,
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
