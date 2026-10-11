/**
 * Lo que solo se ve contra la base: el catálogo que ESCRIBE la carta por foto,
 * y el negocio que no se registra dos veces.
 *
 * Las reglas puras ya están probadas (`carta-foto.test.ts`,
 * `texto-carta.test.ts`, `negocio-duplicado.test.ts`). Aquí se comprueban las
 * dos cosas que una prueba unitaria no toca:
 *
 *   · que `applyProductImport` ESCRIBA limpio — el defecto era justo ese, que
 *     escribía con `prisma.product.create` directo y se saltaba el limpiador;
 *   · que `registerBusiness` devuelva el negocio que ya existe en vez de crear
 *     un segundo portal, que es lo que dejó «BETOS» dos veces en la lista.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/carta-y-duplicados.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  applyProductImport,
  getManagedProductsForBusiness,
} from '../src/services/business.service';
import { getBusinessService } from '../src/services/business.service';
import { parsearCarta, filasACsv } from '../src/lib/carta-foto';
import { parseProductCsv } from '../src/lib/product-csv';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

/** Una carta como la que fotografía un dueño: nombre arriba, precio debajo. */
const CARTA = `ASADOS
● Carne asada
21.000
Costilla de cerdo BBQ
23.000

BEBIDAS
Gaseosa  3.500`;

async function main() {
  const sello = Date.now();
  const creados: string[] = [];

  try {
    console.log('\n[1] La carta de la foto, de punta a punta');
    const leida = parsearCarta(CARTA);
    check(leida.secciones.includes('Asados') && leida.secciones.includes('Bebidas'),
      'las secciones son las de verdad', leida.secciones);
    check(!leida.secciones.some((s) => s.toLowerCase().includes('carne')),
      'y el PLATO no se coló como sección', leida.secciones);
    check(leida.lineas.length === 3, 'salen los tres platos', leida.lineas.length);
    check(leida.lineas.every((l) => l.precio !== null),
      'todos con su precio: ninguno quedó llamándose «21.000»',
      leida.lineas.map((l) => [l.nombre, l.precio]));

    const biz = await getBusinessService().registerBusiness({
      name: `Asadero E2E ${sello}`,
      ownerName: 'Dueño',
      phone: '+573001112233',
      address: 'Calle 5 # 3-40',
      category: 'restaurante',
    });
    creados.push(biz.id);

    // El MISMO camino que el portal: filas → CSV → vista previa → importar.
    const csv = filasACsv(leida.lineas.map((l) => ({
      nombre: l.nombre, precio: l.precio, seccion: l.seccion,
    })));
    const previa = parseProductCsv(csv, new Map());
    check(previa.nuevos.length === 3, 'la vista previa trae los tres', previa.nuevos.length);

    const res = await applyProductImport(biz.id, previa.nuevos, []);
    check(res.creados === 3, 'y se crean los tres', res);

    console.log('\n[2] Lo que quedó GUARDADO está limpio');
    // Es la comprobación que justifica el script: el limpiador se aplicaba en
    // el alta normal y NO en esta ruta, que es por donde entra la carta.
    const guardados = await getManagedProductsForBusiness(biz.id);
    const nombres = guardados.map((p) => p.name).sort();
    check(nombres.includes('Carne asada'),
      'la viñeta «●» del papel no llegó al catálogo', nombres);
    check(!nombres.some((n) => /[●▪◆⬤]/.test(n)), 'ningún nombre trae viñeta', nombres);
    check(!nombres.some((n) => /^\$?\d/.test(n)),
      'y ninguno se llama como su precio', nombres);
    const carne = guardados.find((p) => p.name === 'Carne asada');
    check(carne?.price === 21000, 'con el precio que decía la carta', carne?.price);
    check(carne?.category === 'Asados', 'y en su sección', carne?.category);

    // Y la defensa en profundidad: `applyProductImport` limpia POR SU CUENTA,
    // no porque el que llama le haya dado algo limpio. `parseProductCsv` sí
    // limpia el nombre —de ahí que el camino de la carta ya saliera bien en
    // cuanto se añadió el rango de las viñetas—, pero esta función es pública
    // y cualquier otro llamador escribiría crudo.
    await applyProductImport(biz.id, [
      { nombre: '▪ Chuzo mixto', precio: 15000, seccion: '◆ Asados' },
    ], []);
    const conSuciedad = await getManagedProductsForBusiness(biz.id);
    const chuzo = conSuciedad.find((p) => p.name.includes('Chuzo'));
    check(chuzo?.name === 'Chuzo mixto',
      'un nombre sucio que entra por otra puerta también se limpia', chuzo?.name);
    check(chuzo?.category === 'Asados', 'y su sección', chuzo?.category);

    console.log('\n[3] El mismo negocio NO se registra dos veces');
    // El doble toque en «Registrar» desde un celular con mala señal.
    const otra = await getBusinessService().registerBusiness({
      name: `Asadero E2E ${sello}`,
      ownerName: 'Dueño',
      phone: '+57 300 111 2233', // el mismo, escrito distinto
      address: 'Calle 5 # 3-40',
      category: 'restaurante',
    });
    check(otra.id === biz.id, 'devuelve el que ya existía', { uno: biz.id, dos: otra.id });
    // `accessToken`, no `token`: comparar `biz.token` daba `undefined` a los
    // dos lados y la comprobación pasaba SIN MEDIR NADA, que es peor que
    // fallar. Lo cazó la de abajo, que esperaba lo contrario.
    check(!!biz.accessToken && otra.accessToken === biz.accessToken,
      'con SU MISMO enlace: dos enlaces es lo que dejaba al dueño sin saber cuál usar',
      { uno: biz.accessToken, dos: otra.accessToken });
    const cuantos = await prisma.business.count({ where: { name: `Asadero E2E ${sello}` } });
    check(cuantos === 1, 'y en la base hay UNO, no dos', cuantos);

    console.log('\n[4] Pero un SEGUNDO local del mismo dueño sí se registra');
    // La mitad que impide que la guarda se convierta en un bloqueo.
    const segundo = await getBusinessService().registerBusiness({
      name: `Asadero E2E ${sello} Centro`,
      ownerName: 'Dueño',
      phone: '+573001112233',
      address: 'Calle 6 # 2-10',
      category: 'restaurante',
    });
    creados.push(segundo.id);
    check(segundo.id !== biz.id, 'es un negocio nuevo', segundo.name);
    check(!!segundo.accessToken && segundo.accessToken !== biz.accessToken,
      'con su propio enlace', { uno: biz.accessToken, dos: segundo.accessToken });

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    process.exitCode = fallos > 0 ? 1 : 0;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    for (const id of creados) {
      await prisma.product.deleteMany({ where: { businessId: id } });
      await prisma.business.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  }
}

void main();
