import 'dart:async';

import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/shared/services/driver_ws_service.dart';

/// Chat en vivo del viaje normal (conductor ↔ pasajero) sobre el WS singleton
/// del conductor y el canal persistente `subscribe_trip_chat`.
class TripChatScreen extends StatefulWidget {
  const TripChatScreen({required this.tripId, required this.peerName, super.key});

  final String tripId;
  final String peerName;

  @override
  State<TripChatScreen> createState() => _TripChatScreenState();
}

class _TripMsg {
  const _TripMsg({required this.id, required this.mine, required this.body, required this.sentAt});
  final String id;
  final bool mine;
  final String body;
  final DateTime sentAt;

  factory _TripMsg.fromJson(Map<String, dynamic> j) => _TripMsg(
        id: (j['id'] as String?) ?? '',
        mine: (j['senderRole'] as String?) == 'driver',
        body: (j['body'] as String?) ?? '',
        sentAt: DateTime.tryParse((j['sentAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      );
}

class _TripChatScreenState extends State<TripChatScreen> {
  final _ws = DriverWsService();
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_TripMsg> _messages = [];
  StreamSubscription<Map<String, dynamic>>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = _ws.tripChatEvents.listen(_onEvent);
    _ws.subscribeTripChat(widget.tripId);
  }

  void _onEvent(Map<String, dynamic> e) {
    if (e['tripId'] != null && e['tripId'] != widget.tripId) return;
    final history = e['history'];
    final message = e['message'];
    if (history is List) {
      setState(() {
        _messages
          ..clear()
          ..addAll(history.whereType<Map<String, dynamic>>().map(_TripMsg.fromJson));
      });
      _scrollToBottom();
    } else if (message is Map<String, dynamic>) {
      final m = _TripMsg.fromJson(message);
      if (_messages.any((x) => x.id == m.id)) return;
      setState(() => _messages.add(m));
      _scrollToBottom();
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

  void _send() {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ws.sendTripChat(widget.tripId, text);
    _ctrl.clear();
  }

  @override
  void dispose() {
    _ws.unsubscribeTripChat(widget.tripId);
    _sub?.cancel();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.surfaceColor,
        foregroundColor: context.textPrimaryColor,
        elevation: 0,
        title: Text(widget.peerName),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Text('Escribe para coordinar con el pasajero.',
                        style: TextStyle(color: context.textSecondaryColor)),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) => _Bubble(msg: _messages[i]),
                  ),
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
                    hintText: 'Mensaje…',
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
                  icon: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
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
  final _TripMsg msg;

  @override
  Widget build(BuildContext context) {
    final mine = msg.mine;
    final time =
        '${msg.sentAt.hour.toString().padLeft(2, '0')}:${msg.sentAt.minute.toString().padLeft(2, '0')}';

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
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
