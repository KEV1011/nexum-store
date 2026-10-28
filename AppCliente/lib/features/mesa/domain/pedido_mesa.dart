/// Un pedido en el local (mesa o para llevar), visto por quien lo pidió.
///
/// Es el mismo DTO que ve el comensal en la carta web (`PedidoEnMesaDTO`):
/// la app no tiene un camino propio, consulta y califica por la misma API.
library;

class PasoMesa {
  const PasoMesa({required this.titulo, required this.estado, this.at});
  final String titulo;

  /// `cumplido` | `actual` | `pendiente` | `cancelado`, como lo arma el servidor.
  final String estado;
  final DateTime? at;

  bool get hecho => estado == 'cumplido';
  bool get actual => estado == 'actual';
}

class PedidoMesa {
  const PedidoMesa({
    required this.id,
    required this.orderRef,
    required this.mesa,
    required this.negocio,
    required this.estado,
    required this.total,
    this.codigo,
    this.prepMinutos,
    this.creado,
    this.calificacion,
    this.platos = const [],
    this.pasos = const [],
  });

  final String id;
  final String orderRef;

  /// La mesa, o vacío si fue para llevar.
  final String mesa;
  final String negocio;

  /// `pending` | `preparing` | `delivered` | `cancelled` | …
  final String estado;
  final double total;

  /// El código de la carta. Solo lo trae el historial; en la pantalla del
  /// pedido ya se sabe.
  final String? codigo;
  final int? prepMinutos;
  final DateTime? creado;
  final int? calificacion;
  final List<String> platos;
  final List<PasoMesa> pasos;

  bool get terminado => estado == 'delivered' || estado == 'cancelled';
  bool get paraLlevar => mesa.isEmpty;

  /// Lo que se le dice al comensal: las mismas palabras que la carta web.
  String get estadoTexto => switch (estado) {
        'pending' => 'Enviado a la cocina',
        'confirmed' => 'Recibido por la cocina',
        'preparing' => 'Preparándose',
        'delivered' => paraLlevar ? 'Entregado' : 'Servido',
        'cancelled' => 'Cancelado',
        _ => 'En curso',
      };

  static PedidoMesa fromJson(Map<String, dynamic> j) {
    final items = (j['items'] as List?) ?? const [];
    final timeline = (j['timeline'] as List?) ?? const [];
    return PedidoMesa(
      id: j['id'] as String,
      orderRef: j['orderRef'] as String? ?? '',
      mesa: j['tableLabel'] as String? ?? '',
      negocio: j['businessName'] as String? ?? '',
      estado: j['status'] as String? ?? '',
      total: (j['total'] as num?)?.toDouble() ?? 0,
      codigo: j['codigo'] as String?,
      prepMinutos: (j['prepMinutes'] as num?)?.toInt(),
      creado: DateTime.tryParse(j['createdAt'] as String? ?? '')?.toLocal(),
      calificacion: (j['rating'] as num?)?.toInt(),
      platos: [
        for (final i in items.whereType<Map<String, dynamic>>())
          '${(i['quantity'] as num?)?.toInt() ?? 1} × ${i['productName'] ?? ''}',
      ],
      pasos: [
        for (final p in timeline.whereType<Map<String, dynamic>>())
          PasoMesa(
            titulo: p['titulo'] as String? ?? '',
            estado: p['estado'] as String? ?? 'pendiente',
            at: DateTime.tryParse(p['at'] as String? ?? '')?.toLocal(),
          ),
      ],
    );
  }
}
