import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/ride_negotiation/domain/entities/ride_entities.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';

/// Chat en tiempo real entre cliente y conductor durante un pedido activo.
class OrderChatScreen extends ConsumerStatefulWidget {
  const OrderChatScreen({
    required this.orderId,
    required this.driverName,
    super.key,
  });

  final String orderId;
  final String driverName;

  @override
  ConsumerState<OrderChatScreen> createState() => _OrderChatScreenState();
}

class _OrderChatScreenState extends ConsumerState<OrderChatScreen> {
  final _ws = TransportWsService();
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<ChatMessageEntity> _messages = [];
  StreamSubscription<ChatMessageEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _ws.subscribeChat(widget.orderId);
    _sub = _ws.chatMessages.listen((event) {
      final msg = ChatMessageEntity.fromJson(event.message);
      if (msg.rideId != widget.orderId) return;
      if (_messages.any((m) => m.id == msg.id)) return;
      setState(() => _messages.add(msg));
      _scrollToBottom();
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _send() {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ws.sendChat(widget.orderId, text);
    // Optimistically add the message locally
    setState(() {
      _messages.add(ChatMessageEntity(
        id: DateTime.now().toIso8601String(),
        rideId: widget.orderId,
        fromRole: 'client',
        text: text,
        sentAt: DateTime.now(),
      ));
    });
    _ctrl.clear();
    _scrollToBottom();
  }

  @override
  void dispose() {
    _ws.unsubscribeChat(widget.orderId);
    _sub?.cancel();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceLight,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.driverName,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const Text(
              'Tu repartidor',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.outlineLight),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 32),
                      child: Text(
                        'Escribe para coordinar la entrega con tu conductor.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(msg: _messages[i]),
                  ),
          ),
          _Composer(ctrl: _ctrl, onSend: _send),
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.ctrl, required this.onSend});

  final TextEditingController ctrl;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) => SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: const BoxDecoration(
            color: AppColors.surfaceLight,
            border: Border(top: BorderSide(color: AppColors.outlineLight)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: ctrl,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSend(),
                  decoration: InputDecoration(
                    hintText: 'Mensaje…',
                    filled: true,
                    fillColor: AppColors.surfaceVariantLight,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
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
                  icon: const Icon(Icons.send_rounded,
                      color: Colors.white, size: 20),
                  onPressed: onSend,
                ),
              ),
            ],
          ),
        ),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.msg});

  final ChatMessageEntity msg;

  @override
  Widget build(BuildContext context) {
    final mine = msg.isFromClient;
    final time =
        '${msg.sentAt.hour.toString().padLeft(2, '0')}:${msg.sentAt.minute.toString().padLeft(2, '0')}';

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.74,
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary : AppColors.surfaceLight,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: AppColors.outlineLight),
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              msg.text,
              style: TextStyle(
                color: mine ? Colors.white : AppColors.textPrimary,
                fontSize: 14.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              time,
              style: TextStyle(
                color: mine ? Colors.white70 : AppColors.textTertiary,
                fontSize: 10.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
