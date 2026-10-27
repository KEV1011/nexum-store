// ── Revisar el catálogo publicado: lo que se lee, se pregunta y se escribe ───
//
// Las reglas viven en `lib/revision-catalogo.ts` y las guardas de la IA en
// `lib/carta-ia.ts`; aquí solo se lee el catálogo, se le pregunta a la IA si
// está encendida y se escribe lo que el dueño aprobó.
//
// REVISAR NO ESCRIBE NADA. Devuelve propuestas con su antes y su después; el
// catálogo solo cambia cuando el dueño pulsa «Guardar», y entonces cada cambio
// se comprueba contra el producto TAL COMO ESTÁ (si lo editó mientras tanto,
// no se pisa) y nunca toca el precio.

import { prisma } from '../lib/prisma';
import { revisarFilas } from '../lib/carta-ia';
import {
  conflictoConActual,
  datosDeCambio,
  filasParaRevisor,
  incorporarRevisionIA,
  revisarConReglas,
  sanearCambiosPedidos,
  seccionesDelTrabajo,
  terminarRevision,
  type ProductoRevisable,
  type RevisionCatalogo,
} from '../lib/revision-catalogo';
import { reservarUsoIA, revisarCartaConIA, revisorDisponible } from './carta-ia.service';

/** Más productos que esto no caben en una sola pregunta a la IA. */
const MAX_PARA_IA = 300;

export interface EstadoIA {
  /** Si la cuenta tiene la IA encendida. */
  disponible: boolean;
  /** Si esta revisión la usó de verdad. */
  usada: boolean;
  resumen?: string;
  /** Por qué no se usó, dicho al dueño. */
  motivo?: string;
}

export interface ResultadoRevisionCatalogo extends RevisionCatalogo {
  ia: EstadoIA;
}

async function _productos(businessId: string): Promise<ProductoRevisable[]> {
  const ps = await prisma.product.findMany({
    where: { businessId },
    select: {
      id: true, name: true, description: true, category: true, price: true,
      suggestAsAddon: true, isAvailable: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return ps.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    category: p.category ?? '',
    price: p.price,
    suggestAsAddon: p.suggestAsAddon,
    isAvailable: p.isAvailable,
  }));
}

export async function revisarCatalogoDelNegocio(
  businessId: string,
  opciones: { conIA: boolean },
): Promise<ResultadoRevisionCatalogo> {
  const productos = await _productos(businessId);
  const t = revisarConReglas(productos);
  const ia: EstadoIA = { disponible: revisorDisponible(), usada: false };

  if (opciones.conIA && ia.disponible && productos.length > 0) {
    if (productos.length > MAX_PARA_IA) {
      ia.motivo = `Tu catálogo tiene ${productos.length} productos: la revisión con IA cubre hasta ${MAX_PARA_IA}. Te mostramos lo que encontraron las reglas.`;
    } else if (!reservarUsoIA(businessId)) {
      ia.motivo = 'Ya usaste muchas revisiones con IA en la última hora. Te mostramos lo que encontraron las reglas.';
    } else {
      const filas = filasParaRevisor(t);
      const secciones = seccionesDelTrabajo(t);
      const r = await revisarCartaConIA({ contexto: 'catalogo', filas, secciones, textoCrudo: '' });
      if (r.disponible) {
        // Sin carta impresa, `textoCrudo` vacío: la guarda descarta cualquier
        // precio que proponga, que es justo lo que se quiere aquí.
        const revision = revisarFilas(filas, r.correcciones, { textoCrudo: '', secciones, modo: 'revision' });
        if (revision.descartadas.length > 0) {
          console.log(
            `[CatalogoIA] ${businessId}: ${revision.descartadas.length} propuesta(s) descartada(s): `
            + revision.descartadas.slice(0, 10).map((d) => `L${d.linea} ${d.accion} (${d.razon})`).join('; '),
          );
        }
        incorporarRevisionIA(t, revision);
        ia.usada = true;
        if (r.resumen) ia.resumen = r.resumen;
      } else if (r.motivo) {
        ia.motivo = `${r.motivo} Te mostramos lo que encontraron las reglas.`;
      }
    }
  }

  return { ...terminarRevision(t), ia };
}

export interface ResultadoAplicar {
  aplicados: number;
  omitidos: Array<{ productId: string; motivo: string }>;
}

/**
 * Escribe lo aprobado. Lo que se mande aquí el dueño podría escribirlo igual
 * editando cada producto: no es una puerta nueva, es la misma edición en
 * bloque. Por eso basta con comprobar que el producto es de este negocio, que
 * sigue como estaba y que el nombre no quede vacío. El precio no llega
 * (`sanearCambiosPedidos` lo deja fuera).
 */
export async function aplicarRevisionCatalogo(
  businessId: string,
  crudo: unknown,
): Promise<ResultadoAplicar> {
  const cambios = sanearCambiosPedidos(crudo);
  if (cambios.length === 0) throw new Error('No marcaste ningún cambio.');

  const actuales = new Map(
    (await _productos(businessId))
      .filter((p) => cambios.some((c) => c.productId === p.id))
      .map((p) => [p.id, p]),
  );

  let aplicados = 0;
  const omitidos: ResultadoAplicar['omitidos'] = [];
  for (const c of cambios) {
    const actual = actuales.get(c.productId);
    if (!actual) {
      omitidos.push({ productId: c.productId, motivo: 'Ese producto ya no está en tu catálogo.' });
      continue;
    }
    const conflicto = conflictoConActual(actual, c);
    if (conflicto) {
      omitidos.push({ productId: c.productId, motivo: conflicto });
      continue;
    }
    let data;
    try {
      data = datosDeCambio(c);
    } catch (err) {
      omitidos.push({ productId: c.productId, motivo: err instanceof Error ? err.message : 'Dato inválido.' });
      continue;
    }
    // `businessId` en el where = pertenencia; un id ajeno no escribe nada.
    const r = await prisma.product.updateMany({ where: { id: c.productId, businessId }, data });
    if (r.count > 0) {
      aplicados++;
      // Dos cambios del mismo producto (texto y sección) se comprueban cada
      // uno contra el anterior ya escrito.
      actuales.set(c.productId, {
        ...actual,
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description ?? '' }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.suggestAsAddon !== undefined && { suggestAsAddon: data.suggestAsAddon }),
      });
    }
  }
  return { aplicados, omitidos };
}
