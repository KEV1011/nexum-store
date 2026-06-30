import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Carga backend/.env aunque el seed se ejecute con `ts-node` directo (sin pasar
// por el CLI de prisma). Ruta explícita relativa a este archivo (backend/prisma)
// para que funcione tanto desde backend/ como desde la raíz del repo.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  // ─── Demo driver ─────────────────────────────────────────────────────────────
  // Sin espacios: la app envía '+57' + dígitos (replaceAll(' ', '')). El seed
  // debe coincidir EXACTO o el conductor demo no se reconocería al loguear.
  const driver = await prisma.driver.upsert({
    where: { phone: '+573124567890' },
    update: { isVerified: true },
    create: {
      phone: '+573124567890',
      name: 'Juan Carlos Villamizar Contreras',
      documentType: 'CC',
      documentNumber: '1090512345',
      bankName: 'Bancolombia',
      bankAccountType: 'Ahorros',
      bankAccountNumber: '****4521',
      rating: 4.87,
      totalTrips: 312,
      status: 'OFFLINE',
      // Verificado para que el conductor demo pueda ponerse en línea y probar el
      // flujo completo sin pasar por la aprobación de documentos.
      isVerified: true,
    },
  });

  await prisma.vehicle.upsert({
    where: { plate: 'KGB-742' },
    update: { driverId: driver.id },
    create: {
      driverId: driver.id,
      type: 'PARTICULAR',
      brand: 'Chevrolet',
      model: 'Spark GT',
      year: 2020,
      plate: 'KGB-742',
      color: 'Blanco perla',
      isActive: true,
    },
  });

  console.log(`Driver seeded: ${driver.id} (${driver.phone})`);

  // ─── Demo operator (empresa de transporte) ────────────────────────────────────
  // Empresa verificada para probar el portal de empresa: login con el teléfono
  // del miembro OWNER (+573150000020) y el OTP de dev (123456). El conductor y el
  // vehículo demo quedan afiliados a ella.
  const operator = await prisma.operator.upsert({
    where: { nit: '900123456-7' },
    update: { isVerified: true, status: 'ACTIVE' },
    create: {
      legalName: 'Cooperativa de Transporte de Pamplona',
      nit: '900123456-7',
      tradeName: 'Trans-Pamplona',
      type: 'MIXED',
      status: 'ACTIVE',
      isVerified: true,
      contactName: 'Operador Demo',
      contactPhone: '+573150000020',
      contactEmail: 'operador@nexum.demo',
      city: 'Pamplona',
    },
  });

  await prisma.operatorMember.upsert({
    where: { operatorId_phone: { operatorId: operator.id, phone: '+573150000020' } },
    update: {},
    create: {
      operatorId: operator.id,
      phone: '+573150000020',
      name: 'Operador Demo',
      role: 'OWNER',
    },
  });

  // Afilia el conductor y su vehículo demo a la empresa.
  await prisma.driver.update({
    where: { id: driver.id },
    data: { operatorId: operator.id, employmentType: 'AFFILIATED' },
  });
  await prisma.vehicle.updateMany({
    where: { driverId: driver.id },
    data: { operatorId: operator.id },
  });

  console.log(`Operator seeded: ${operator.id} (${operator.legalName})`);

  // ─── Demo user (for client-side testing) ─────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { phone: '+573150000001' },
    update: {},
    create: {
      phone: '+573150000001',
      name: 'Usuario Demo',
    },
  });

  console.log(`User seeded: ${user.id} (${user.phone})`);

  // ─── Demo businesses ──────────────────────────────────────────────────────────
  const restaurante = await prisma.business.upsert({
    where: { token: 'biz-token-restaurante-demo' },
    update: {},
    create: {
      name: 'Restaurante El Buen Sabor',
      token: 'biz-token-restaurante-demo',
      category: 'RESTAURANT',
      address: 'Calle 5 #4-32, Centro, Pamplona',
      phone: '+57 312 111 2222',
      isOpen: true,
      deliveryFee: 3500,
      etaMinutes: 25,
    },
  });

  await seedProducts(restaurante.id, [
    { name: 'Almuerzo ejecutivo', price: 15000, category: 'Almuerzos', description: 'Sopa, seco, jugo y postre' },
    { name: 'Bandeja paisa', price: 22000, category: 'Especiales', description: 'Frijoles, arroz, chicharrón, carne, huevo y maduro' },
    { name: 'Caldo de costilla', price: 8000, category: 'Sopas', description: 'Con papa criolla y cilantro' },
    { name: 'Jugo natural', price: 4000, category: 'Bebidas', description: 'Maracuyá, mora o guanábana' },
  ]);

  console.log(`Business seeded: ${restaurante.id} (${restaurante.name})`);

  const farmacia = await prisma.business.upsert({
    where: { token: 'biz-token-farmacia-demo' },
    update: {},
    create: {
      name: 'Farmacia La Salud',
      token: 'biz-token-farmacia-demo',
      category: 'PHARMACY',
      address: 'Carrera 6 #5-18, Centro, Pamplona',
      phone: '+57 313 333 4444',
      isOpen: true,
      deliveryFee: 2500,
      etaMinutes: 20,
    },
  });

  await seedProducts(farmacia.id, [
    { name: 'Acetaminofén 500mg x10', price: 3500, category: 'Analgésicos', description: 'Tabletas' },
    { name: 'Ibuprofeno 400mg x10', price: 4200, category: 'Analgésicos', description: 'Tabletas' },
    { name: 'Alcohol antiséptico 250ml', price: 6000, category: 'Antisépticos', description: 'Frasco 250 ml' },
    { name: 'Tapabocas desechable x5', price: 3000, category: 'Protección', description: 'Unidades sueltas' },
    { name: 'Suero oral Pedialyte', price: 8500, category: 'Hidratación', description: 'Frasco 500 ml' },
  ]);

  console.log(`Business seeded: ${farmacia.id} (${farmacia.name})`);

  const supermercado = await prisma.business.upsert({
    where: { token: 'biz-token-super-demo' },
    update: {},
    create: {
      name: 'Supermercado El Ahorro',
      token: 'biz-token-super-demo',
      category: 'SUPERMARKET',
      address: 'Av. Santander #8-45, Pamplona',
      phone: '+57 311 555 6666',
      isOpen: true,
      deliveryFee: 3000,
      etaMinutes: 30,
    },
  });

  await seedProducts(supermercado.id, [
    { name: 'Arroz x500g', price: 2800, category: 'Granos', description: 'Arroz blanco premium' },
    { name: 'Leche entera x1L', price: 3200, category: 'Lácteos', description: 'Bolsa litro' },
    { name: 'Huevos x12', price: 10500, category: 'Huevos', description: 'Docena AA' },
    { name: 'Pan tajado', price: 5500, category: 'Panadería', description: 'Pan blanco tajado 500g' },
    { name: 'Aceite 1L', price: 12000, category: 'Aceites', description: 'Aceite vegetal' },
    { name: 'Azúcar x500g', price: 3500, category: 'Dulces', description: 'Azúcar blanca' },
  ]);

  console.log(`Business seeded: ${supermercado.id} (${supermercado.name})`);
}

async function seedProducts(
  businessId: string,
  products: Array<{ name: string; price: number; category: string; description?: string }>,
) {
  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { businessId, name: p.name } });
    if (!existing) {
      await prisma.product.create({
        data: { businessId, name: p.name, price: p.price, category: p.category, description: p.description },
      });
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
