import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/orders/domain/entities/order_chat_message_entity.dart';
import 'package:nexum_client/shared/services/order_ws_service.dart';

/// Chat del pedido de domicilio (cliente ↔ repartidor asignado).
///
/// Mismo patrón que el chat de rides: historial por REST + stream en vivo por
/// WebSocket. Usa [OrderWsService] (el mismo socket del tracking de pedidos)
/// para no abrir una segunda sesión `client_auth` que cerraría la primera.
class OrderChatScreen extends ConsumerStatefulWidget {
  const OrderChatScreen({
    required this.orderId,
    required this.peerName,
    super.key,
  });

  final String orderId;
  final String peerName;

  @override
  ConsumerState<OrderChatScreen> createState() => _OrderChatScreenState();
}

class _OrderChatScreenState extends ConsumerState<OrderChatScreen> {
  final _ws = OrderWsService();
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<OrderChatMessageEntity> _messages = [];
  StreamSubscription<OrderChatMessageEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _ws.chatMessages.listen((event) {
      final msg = OrderChatMessageEntity.fromJson(event.message);
      if (msg.orderId != widget.orderId) return;
      if (_messages.any((m) => m.id == msg.id)) return;
      setState(() => _messages.add(msg));
      _scrollToBottom();
    });
    _connectAndSubscribe();
    _loadHistory();
  }

  /// El socket de pedidos puede estar cerrado si el tracking se abrió desde el
  /// historial (sin pedido recién creado): conectar antes de suscribirse.
  Future<void> _connectAndSubscribe() async {
    final ok = await _ws.connect();
    if (!mounted || !ok) return;
    _ws.subscribeOrderChat(widget.orderId);
  }

  Future<void> _loadHistory() async {
    try {
      final dio = ref.read(apiClientProvider);
      final res = await dio.get<Map<String, dynamic>>(
        '/client/orders/${widget.orderId}/chat',
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(OrderChatMessageEntity.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(list);
      });
      _scrollToBottom();
    } catch (_) {
      // keep WS-delivered messages
    }
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
    _ws.sendOrderChat(widget.orderId, text);
    _ctrl.clear();
  }

  @override
  void dispose() {
    _ws.unsubscribeOrderChat(widget.orderId);
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
        title: Text(widget.peerName),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                      'Escribe para coordinar con tu repartidor.',
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(msg: _messages[i]),
                  ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _composer() => SafeArea(
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
                  controller: _ctrl,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => _send(),
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
                  onPressed: _send,
                ),
              ),
            ],
          ),
        ),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.msg});

  final OrderChatMessageEntity msg;

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
