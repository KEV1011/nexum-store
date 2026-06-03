import { prisma } from './prisma';
import { BusinessCategory } from '@prisma/client';
import { logger } from '../utils/logger';

const CATEGORY_MAP: Record<string, BusinessCategory> = {
  restaurant: BusinessCategory.RESTAURANT,
  pharmacy: BusinessCategory.PHARMACY,
  supermarket: BusinessCategory.SUPERMARKET,
  other: BusinessCategory.OTHER,
};

const MOCK_BUSINESSES = [
  {
    id: 'biz-001', name: 'Restaurante El Sabor Pamplonés', category: 'restaurant',
    address: 'Cra. 6 #8-45, Centro, Pamplona', lat: 7.3754, lng: -72.6464,
    phone: '+573101234567', rating: 4.8, etaMinutes: 25, deliveryFee: 3500,
    token: 'sabor-pamp-2024',
    products: [
      { id: 'p-101', name: 'Bandeja Paisa', description: 'Frijoles, arroz, carne molida, chicharrón, huevo', price: 18000, category: 'Almuerzos' },
      { id: 'p-102', name: 'Mute Santandereano', description: 'Sopa típica con maíz pelao y carnes', price: 15000, category: 'Almuerzos' },
      { id: 'p-103', name: 'Pechuga a la plancha', description: 'Con ensalada y papas a la francesa', price: 16000, category: 'Almuerzos' },
      { id: 'p-104', name: 'Jugo natural', description: 'Mora, lulo, maracuyá o guanábana', price: 5000, category: 'Bebidas' },
    ],
  },
  {
    id: 'biz-002', name: 'Droguería San Juan', category: 'pharmacy',
    address: 'Calle 7 #5-12, Centro, Pamplona', lat: 7.3741, lng: -72.6471,
    phone: '+573119876543', rating: 4.6, etaMinutes: 18, deliveryFee: 3000,
    token: 'drogueria-sj-2024',
    products: [
      { id: 'p-201', name: 'Acetaminofén 500mg x10', description: 'Caja de 10 tabletas', price: 4500, category: 'Medicamentos' },
      { id: 'p-202', name: 'Alcohol antiséptico 700ml', description: 'Frasco familiar', price: 8000, category: 'Cuidado' },
      { id: 'p-203', name: 'Termómetro digital', description: 'Lectura rápida en 10 segundos', price: 22000, category: 'Dispositivos' },
    ],
  },
  {
    id: 'biz-003', name: 'Supermercado La Económica', category: 'supermarket',
    address: 'Av. Santander #14-30, Pamplona', lat: 7.3762, lng: -72.6455,
    phone: '+573121111111', rating: 4.5, etaMinutes: 35, deliveryFee: 4000,
    token: 'la-economica-2024',
    products: [
      { id: 'p-301', name: 'Canasta básica', description: 'Arroz, aceite, panela, huevos, pasta', price: 45000, category: 'Mercado' },
      { id: 'p-302', name: 'Leche entera 1L x6', description: 'Six pack', price: 21000, category: 'Lácteos' },
      { id: 'p-303', name: 'Pan tajado integral', description: 'Bolsa de 500g', price: 6500, category: 'Panadería' },
    ],
  },
  {
    id: 'biz-004', name: 'Pizzería Don Lucho', category: 'restaurant',
    address: 'Cra. 5 #9-18, Centro, Pamplona', lat: 7.3748, lng: -72.6468,
    phone: '+573122222222', rating: 4.7, etaMinutes: 30, deliveryFee: 3500,
    token: 'pizzeria-lucho-2024',
    products: [
      { id: 'p-401', name: 'Pizza familiar mixta', description: 'Pollo, carne, champiñones, extra queso', price: 38000, category: 'Pizzas' },
      { id: 'p-402', name: 'Pizza personal hawaiana', description: 'Jamón y piña', price: 14000, category: 'Pizzas' },
      { id: 'p-403', name: 'Gaseosa 1.5L', description: 'Surtida', price: 6000, category: 'Bebidas' },
    ],
  },
];

export async function seedDatabase(): Promise<void> {
  for (const biz of MOCK_BUSINESSES) {
    await prisma.business.upsert({
      where: { id: biz.id },
      create: {
        id: biz.id,
        name: biz.name,
        category: CATEGORY_MAP[biz.category] ?? BusinessCategory.OTHER,
        address: biz.address,
        lat: biz.lat,
        lng: biz.lng,
        phone: biz.phone,
        rating: biz.rating,
        etaMinutes: biz.etaMinutes,
        deliveryFee: biz.deliveryFee,
        token: biz.token,
        products: {
          createMany: {
            data: biz.products.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              price: p.price,
              category: p.category,
            })),
            skipDuplicates: true,
          },
        },
      },
      update: {},
    });
  }
  logger.info('[seed] Database seeded with mock businesses and products');
}
