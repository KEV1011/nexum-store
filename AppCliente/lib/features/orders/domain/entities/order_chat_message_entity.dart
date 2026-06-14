/// Mensaje del chat de un pedido de domicilio (cliente ↔ repartidor).
///
/// Mismo contrato que el chat de rides, pero anclado al `orderId` del pedido.
class OrderChatMessageEntity {
  const OrderChatMessageEntity({
    required this.id,
    required this.orderId,
    required this.fromRole,
    required this.text,
    required this.sentAt,
  });

  final String id;
  final String orderId;
  final String fromRole;
  final String text;
  final DateTime sentAt;

  bool get isFromClient => fromRole == 'client';

  factory OrderChatMessageEntity.fromJson(Map<String, dynamic> j) =>
      OrderChatMessageEntity(
        id: j['id'] as String? ?? '',
        orderId: j['orderId'] as String? ?? '',
        fromRole: j['fromRole'] as String? ?? 'driver',
        text: j['text'] as String? ?? '',
        sentAt:
            DateTime.tryParse(j['sentAt'] as String? ?? '') ?? DateTime.now(),
      );
}
