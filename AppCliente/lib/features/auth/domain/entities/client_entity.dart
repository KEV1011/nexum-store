/// Cliente autenticado en la app ZIPA.
class ClientEntity {
  const ClientEntity({
    required this.id,
    required this.phone,
    required this.name,
    this.needsName = false,
  });

  final String id;
  final String phone;
  final String name;

  /// El pasajero todavía no ha dicho cómo se llama y `name` es de relleno.
  ///
  /// Importa porque ese nombre es el que ve el conductor al aceptar y al
  /// llegar a recoger: sin preguntarlo, todos los pasajeros se llaman igual y
  /// el taxista no puede llamar a nadie.
  final bool needsName;
}
