/// El nombre de un plato, separado de lo que trae.
///
/// POR QUÉ. Las cartas leídas de una foto meten los ingredientes DENTRO del
/// nombre: «Pannecook de pochados y tocineta: (2) pochados + tocineta, queso
/// parmesano…». La fila lo cortaba a dos renglones y la hoja del producto a
/// tres, así que lo que el plato trae no se podía leer en ninguna parte — y es
/// justo lo que decide la compra. Partido en título y detalle, el título cabe
/// y el detalle se lee entero en la hoja (con «Ver más»).
///
/// Solo se parte cuando el dueño NO escribió descripción: si la escribió, el
/// nombre es suyo tal cual y no se toca.
library;

typedef NombrePlato = ({String titulo, String detalle});

NombrePlato partirNombrePlato(String nombre, String descripcion) {
  final n = nombre.trim();
  final d = descripcion.trim();
  if (d.isNotEmpty) return (titulo: n, detalle: d);

  // «Título: lo que trae». Los dos puntos tienen que dejar algo a cada lado;
  // «Combo:» a secas o «: algo» no se parten.
  final dosPuntos = n.indexOf(':');
  if (dosPuntos >= 3 && dosPuntos < n.length - 1) {
    final t = n.substring(0, dosPuntos).trim();
    final r = n.substring(dosPuntos + 1).trim();
    if (t.length >= 3 && r.isNotEmpty) return (titulo: t, detalle: r);
  }

  // «Choricarne (papa, carne, chorizo)». Solo si el paréntesis es una LISTA
  // (lleva coma) y deja un título detrás: «Empanadas (3)» dice cuántas trae y
  // es parte del nombre; partirlo cambiaría el producto.
  final abre = n.indexOf('(');
  if (abre >= 4) {
    final dentro = n.substring(abre + 1);
    final cierra = dentro.lastIndexOf(')');
    final contenido = (cierra == -1 ? dentro : dentro.substring(0, cierra)).trim();
    if (contenido.contains(',')) {
      return (titulo: n.substring(0, abre).trim(), detalle: contenido);
    }
  }

  return (titulo: n, detalle: '');
}
