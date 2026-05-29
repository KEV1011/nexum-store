import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

/// Fuente de datos mock de negocios aliados en Pamplona.
///
/// En producción consultaría el backend: GET /businesses?city=pamplona
class BusinessesDataSource {
  Future<List<BusinessEntity>> fetchBusinesses() async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return _mockBusinesses;
  }

  Future<BusinessEntity> fetchBusinessById(String id) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    return _mockBusinesses.firstWhere((b) => b.id == id);
  }

  static final List<BusinessEntity> _mockBusinesses = [
    const BusinessEntity(
      id: 'biz-001',
      name: 'Restaurante El Sabor Pamplonés',
      category: BusinessCategory.restaurant,
      rating: 4.8,
      etaMinutes: 25,
      deliveryFee: 3500,
      address: 'Cra. 6 #8-45, Centro',
      products: [
        ProductEntity(
          id: 'p-101',
          name: 'Bandeja Paisa',
          description: 'Frijoles, arroz, carne molida, chicharrón, huevo',
          price: 18000,
          category: 'Almuerzos',
        ),
        ProductEntity(
          id: 'p-102',
          name: 'Mute Santandereano',
          description: 'Sopa típica con maíz pelao y carnes',
          price: 15000,
          category: 'Almuerzos',
        ),
        ProductEntity(
          id: 'p-103',
          name: 'Pechuga a la plancha',
          description: 'Con ensalada y papas a la francesa',
          price: 16000,
          category: 'Almuerzos',
        ),
        ProductEntity(
          id: 'p-104',
          name: 'Jugo natural',
          description: 'Mora, lulo, maracuyá o guanábana',
          price: 5000,
          category: 'Bebidas',
        ),
      ],
    ),
    const BusinessEntity(
      id: 'biz-002',
      name: 'Droguería San Juan',
      category: BusinessCategory.pharmacy,
      rating: 4.6,
      etaMinutes: 18,
      deliveryFee: 3000,
      address: 'Calle 7 #5-12, Centro',
      products: [
        ProductEntity(
          id: 'p-201',
          name: 'Acetaminofén 500mg x10',
          description: 'Caja de 10 tabletas',
          price: 4500,
          category: 'Medicamentos',
        ),
        ProductEntity(
          id: 'p-202',
          name: 'Alcohol antiséptico 700ml',
          description: 'Frasco familiar',
          price: 8000,
          category: 'Cuidado',
        ),
        ProductEntity(
          id: 'p-203',
          name: 'Termómetro digital',
          description: 'Lectura rápida en 10 segundos',
          price: 22000,
          category: 'Dispositivos',
        ),
      ],
    ),
    const BusinessEntity(
      id: 'biz-003',
      name: 'Supermercado La Económica',
      category: BusinessCategory.supermarket,
      rating: 4.5,
      etaMinutes: 35,
      deliveryFee: 4000,
      address: 'Av. Santander #14-30',
      products: [
        ProductEntity(
          id: 'p-301',
          name: 'Canasta básica',
          description: 'Arroz, aceite, panela, huevos, pasta',
          price: 45000,
          category: 'Mercado',
        ),
        ProductEntity(
          id: 'p-302',
          name: 'Leche entera 1L x6',
          description: 'Six pack',
          price: 21000,
          category: 'Lácteos',
        ),
        ProductEntity(
          id: 'p-303',
          name: 'Pan tajado integral',
          description: 'Bolsa de 500g',
          price: 6500,
          category: 'Panadería',
        ),
      ],
    ),
    const BusinessEntity(
      id: 'biz-004',
      name: 'Pizzería Don Lucho',
      category: BusinessCategory.restaurant,
      rating: 4.7,
      etaMinutes: 30,
      deliveryFee: 3500,
      address: 'Cra. 5 #9-18, Centro',
      products: [
        ProductEntity(
          id: 'p-401',
          name: 'Pizza familiar mixta',
          description: 'Pollo, carne, champiñones, extra queso',
          price: 38000,
          category: 'Pizzas',
        ),
        ProductEntity(
          id: 'p-402',
          name: 'Pizza personal hawaiana',
          description: 'Jamón y piña',
          price: 14000,
          category: 'Pizzas',
        ),
        ProductEntity(
          id: 'p-403',
          name: 'Gaseosa 1.5L',
          description: 'Surtida',
          price: 6000,
          category: 'Bebidas',
        ),
      ],
    ),
  ];
}
