import 'dart:async';

import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
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
  const _TripMsg({
    required this.id,
    required this.mine,
    required this.body,
    required this.imageUrl,
    required this.sentAt,
  });
  final String id;
  final bool mine;
  final String body;
  final String? imageUrl;
  final DateTime sentAt;

  factory _TripMsg.fromJson(Map<String, dynamic> j) => _TripMsg(
        id: (j['id'] as String?) ?? '',
        mine: (j['senderRole'] as String?) == 'driver',
        body: (j['body'] as String?) ?? '',
        imageUrl: j['imageUrl'] as String?,
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

  bool _uploading = false;

  Future<void> _sendPhoto() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final bytes = await picked.readAsBytes();
      final form = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: picked.name,
          contentType: DioMediaType('image', 'jpeg'),
        ),
      });
      await DioClient().dio.post<Map<String, dynamic>>(
            '/driver/trips/${widget.tripId}/chat/photo',
            data: form,
          );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo enviar la foto.')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _viewImage(String url) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            InteractiveViewer(
              child: Center(child: Image.network(ApiConfig.resolveUrl(url))),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                icon: const Icon(Icons.close_rounded, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ),
    );
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
                    itemBuilder: (_, i) => _Bubble(msg: _messages[i], onTapImage: _viewImage),
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
              IconButton(
                onPressed: _uploading ? null : _sendPhoto,
                icon: _uploading
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                    : const Icon(Icons.photo_camera_rounded, color: AppColors.primary),
                tooltip: 'Enviar foto',
              ),
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
  const _Bubble({required this.msg, required this.onTapImage});
  final _TripMsg msg;
  final void Function(String url) onTapImage;

  @override
  Widget build(BuildContext context) {
    final mine = msg.mine;
    final time =
        '${msg.sentAt.hour.toString().padLeft(2, '0')}:${msg.sentAt.minute.toString().padLeft(2, '0')}';
    final hasImage = msg.imageUrl != null && msg.imageUrl!.isNotEmpty;

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: hasImage
            ? const EdgeInsets.all(4)
            : const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
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
            if (hasImage)
              GestureDetector(
                onTap: () => onTapImage(msg.imageUrl!),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    ApiConfig.resolveUrl(msg.imageUrl!),
                    width: 200,
                    height: 200,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 200,
                      height: 120,
                      color: Colors.black12,
                      child: const Icon(Icons.broken_image_outlined, color: Colors.white70),
                    ),
                  ),
                ),
              )
            else
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
