/// Qué queda elegido en un grupo de opciones tras tocar la opción [id].
///
/// La regla que faltaba: en un grupo de UNA sola elección pero OPCIONAL
/// («Con combo · Opcional», «Adicionales · Opcional · elige 1») tocar la opción
/// ya marcada la DESMARCA. Antes se dibujaba como un radio y se comportaba como
/// uno —una vez elegida no había forma de volver a «sin combo»—, así que quien
/// la tocaba por error tenía que cerrar la hoja y empezar de cero, o pagar el
/// combo que no quería.
///
/// En un grupo OBLIGATORIO de una elección no se desmarca: siempre tiene que
/// quedar una (la caja rechaza el pedido sin ella). En los de varias, el
/// tope [maximo] no deja pasar de ahí.
Set<String> alternarOpcion(
  Set<String> actual, {
  required String id,
  required bool unica,
  required bool obligatoria,
  required int maximo,
}) {
  final siguiente = {...actual};
  if (unica) {
    if (siguiente.contains(id)) {
      if (!obligatoria) siguiente.clear();
      return siguiente;
    }
    return {id};
  }
  if (siguiente.contains(id)) {
    siguiente.remove(id);
  } else if (siguiente.length < maximo) {
    siguiente.add(id);
  }
  return siguiente;
}

/// Si la fila se dibuja como RADIO (círculo) o como casilla.
///
/// El círculo dice «escoge una y no hay vuelta atrás»; eso solo es verdad en
/// un grupo obligatorio de una elección. Un opcional de una sola elección se
/// dibuja como casilla porque se puede desmarcar, y el dibujo tiene que
/// prometer lo mismo que hace el toque.
bool pareceRadio({required bool unica, required bool obligatoria}) =>
    unica && obligatoria;
