/// Producto del catálogo maestro compartido, identificado por código de barras.
///
/// Estandarizado entre todos los negocios: una farmacia y un supermercado que
/// venden el mismo EAN-13 referencian este mismo registro. Al escanear, el
/// negocio solo define precio y stock.
class MasterProductEntity {
  const MasterProductEntity({
    required this.id,
    required this.barcode,
    required this.name,
    required this.category,
    required this.requiresRx,
    this.brand,
    this.imageUrl,
    this.presentation,
    this.invimaCode,
  });

  final String id;
  final String barcode;
  final String name;
  final String category;

  /// Requiere fórmula médica (cumplimiento INVIMA en farmacias).
  final bool requiresRx;

  final String? brand;
  final String? imageUrl;
  final String? presentation;
  final String? invimaCode;

  factory MasterProductEntity.fromJson(Map<String, dynamic> j) =>
      MasterProductEntity(
        id: j['id'] as String? ?? '',
        barcode: j['barcode'] as String? ?? '',
        name: j['name'] as String? ?? '',
        category: j['category'] as String? ?? 'General',
        requiresRx: j['requiresRx'] as bool? ?? false,
        brand: j['brand'] as String?,
        imageUrl: j['imageUrl'] as String?,
        presentation: j['presentation'] as String?,
        invimaCode: j['invimaCode'] as String?,
      );
}
