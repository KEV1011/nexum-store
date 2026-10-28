/// Lo que el comensal va armando en la mesa, antes de mandarlo a la cocina.
///
/// Va APARTE del carrito de domicilios a propósito: si compartieran, un plato
/// del salón acabaría en un pedido a domicilio con su repartidor, o al revés.
/// Y es puro —sin Flutter— para poder probarlo.
///
/// El precio de aquí es una ESTIMACIÓN para enseñar el total: el que vale lo
/// pone el servidor con los precios de la base (la carta es pública y el
/// precio no puede venir del teléfono).
library;

class LineaMesa {
  const LineaMesa({
    required this.productId,
    required this.nombre,
    required this.precioUnitario,
    required this.cantidad,
    this.opcionIds = const [],
    this.resumen = '',
    this.nota,
  });

  final String productId;
  final String nombre;
  final double precioUnitario;
  final int cantidad;
  final List<String> opcionIds;

  /// «Grande, sin cebolla»: lo que eligió, para enseñarlo en la lista.
  final String resumen;
  final String? nota;

  double get subtotal => precioUnitario * cantidad;

  LineaMesa conCantidad(int n) => LineaMesa(
        productId: productId,
        nombre: nombre,
        precioUnitario: precioUnitario,
        cantidad: n,
        opcionIds: opcionIds,
        resumen: resumen,
        nota: nota,
      );

  /// Dos líneas son la misma si es el mismo plato con las mismas opciones y la
  /// misma nota: así «otra igual» suma en vez de abrir una fila nueva.
  bool mismoPlato(LineaMesa o) =>
      o.productId == productId &&
      o.nota == nota &&
      o.opcionIds.length == opcionIds.length &&
      (List.of(o.opcionIds)..sort()).join(',') ==
          (List.of(opcionIds)..sort()).join(',');

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'quantity': cantidad,
        if (opcionIds.isNotEmpty) 'optionIds': opcionIds,
        if (nota != null && nota!.trim().isNotEmpty) 'notes': nota!.trim(),
      };
}

/// Un plato no se pide más de esto de una vez: un 99 es un dedo resbalado.
const kMaxPorLinea = 30;

List<LineaMesa> agregarLinea(List<LineaMesa> lineas, LineaMesa nueva) {
  final i = lineas.indexWhere((l) => l.mismoPlato(nueva));
  if (i < 0) return [...lineas, nueva];
  final suma = (lineas[i].cantidad + nueva.cantidad).clamp(1, kMaxPorLinea);
  return [...lineas]..[i] = lineas[i].conCantidad(suma);
}

/// Quita UNA unidad del plato (de su última línea), o la línea si era la única.
List<LineaMesa> quitarUno(List<LineaMesa> lineas, String productId) {
  final i = lineas.lastIndexWhere((l) => l.productId == productId);
  if (i < 0) return lineas;
  final l = lineas[i];
  if (l.cantidad <= 1) return [...lineas]..removeAt(i);
  return [...lineas]..[i] = l.conCantidad(l.cantidad - 1);
}

int cantidadDe(List<LineaMesa> lineas, String productId) => lineas
    .where((l) => l.productId == productId)
    .fold(0, (s, l) => s + l.cantidad);

double totalEstimado(List<LineaMesa> lineas) =>
    lineas.fold(0, (s, l) => s + l.subtotal);
