import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Un mensaje dentro de un ticket de soporte.
class SupportMessage {
  const SupportMessage({required this.id, required this.authorKind, required this.body, required this.sentAt});
  final String id;
  final String authorKind; // 'client' | 'driver' | 'admin'
  final String body;
  final DateTime sentAt;

  bool get isMine => authorKind == 'client';
  bool get isSupport => authorKind == 'admin';

  factory SupportMessage.fromJson(Map<String, dynamic> j) => SupportMessage(
        id: (j['id'] as String?) ?? '',
        authorKind: (j['authorKind'] as String?) ?? 'client',
        body: (j['body'] as String?) ?? '',
        sentAt: DateTime.tryParse((j['sentAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      );
}

/// Un ticket de soporte (con o sin mensajes cargados).
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.subject,
    required this.category,
    required this.status,
    this.lastMessage,
    required this.updatedAt,
    this.messages = const [],
  });

  final String id;
  final String subject;
  final String category;
  final String status; // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  final String? lastMessage;
  final DateTime updatedAt;
  final List<SupportMessage> messages;

  factory SupportTicket.fromJson(Map<String, dynamic> j) => SupportTicket(
        id: (j['id'] as String?) ?? '',
        subject: (j['subject'] as String?) ?? '',
        category: (j['category'] as String?) ?? 'general',
        status: (j['status'] as String?) ?? 'OPEN',
        lastMessage: j['lastMessage'] as String?,
        updatedAt: DateTime.tryParse((j['updatedAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
        messages: (j['messages'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(SupportMessage.fromJson)
            .toList(),
      );
}

/// Cliente REST del centro de ayuda. `basePath` = '/client' o '/driver'.
class SupportApi {
  SupportApi(this._dio, {this.basePath = '/client'});
  final Dio _dio;
  final String basePath;

  Future<List<SupportTicket>> list() async {
    final res = await _dio.get<Map<String, dynamic>>('$basePath/support/tickets');
    return (res.data?['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(SupportTicket.fromJson)
        .toList();
  }

  Future<SupportTicket> create({required String subject, required String body, String category = 'general'}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '$basePath/support/tickets',
      data: {'subject': subject, 'body': body, 'category': category},
    );
    return SupportTicket.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  Future<SupportTicket> detail(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('$basePath/support/tickets/$id');
    return SupportTicket.fromJson(res.data!['data'] as Map<String, dynamic>);
  }

  Future<SupportTicket> reply(String id, String body) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '$basePath/support/tickets/$id/messages',
      data: {'body': body},
    );
    return SupportTicket.fromJson(res.data!['data'] as Map<String, dynamic>);
  }
}

final supportApiProvider = Provider<SupportApi>((ref) {
  return SupportApi(ref.read(apiClientProvider));
});
