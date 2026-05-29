/// Cliente autenticado en la app Nexum.
class ClientEntity {
  const ClientEntity({
    required this.id,
    required this.phone,
    required this.name,
  });

  final String id;
  final String phone;
  final String name;
}
