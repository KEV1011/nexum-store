import { prisma } from '../lib/prisma';
import { INTERCITY_CITY_COORDS, registerMunicipalityCoords } from '../config/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Municipios a los que se puede viajar.
//
// Antes eran siete valores en un enum del esquema: cada pueblo nuevo exigía una
// migración y un despliegue, y las empresas de transporte mueven a todos los
// pueblos. Ahora viven en una tabla y agregar uno es insertar una fila.
// ─────────────────────────────────────────────────────────────────────────────

export interface MunicipalityDTO {
  slug: string;
  name: string;
  department: string;
  lat: number;
  lng: number;
}

/**
 * Caché en memoria de todos los municipios activos.
 *
 * Son cuarenta y pico de filas que no cambian casi nunca, y se consultan en
 * cada matching y en cada DTO: leerlas de la base cada vez sería gasto puro.
 * Se refresca sola cada 10 minutos y al agregar o cambiar un municipio.
 */
const CACHE_TTL_MS = 10 * 60_000;
let _cache: Map<string, MunicipalityDTO> | null = null;
let _cacheAt = 0;

async function _cargar(): Promise<Map<string, MunicipalityDTO>> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;
  const filas = await prisma.municipality.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  _cache = new Map(
    filas.map((m) => [
      m.slug,
      { slug: m.slug, name: m.name, department: m.department, lat: m.lat, lng: m.lng },
    ]),
  );
  _cacheAt = Date.now();
  return _cache;
}

export function invalidarCacheMunicipios(): void {
  _cache = null;
}

export async function listMunicipalities(query?: string): Promise<MunicipalityDTO[]> {
  const todos = [...(await _cargar()).values()];
  const q = query?.trim().toLowerCase();
  if (!q) return todos;
  // Sin tildes: quien escribe "cucuta" debe encontrar "Cúcuta", y quien escribe
  // "chitaga" debe encontrar "Chitagá". Es la mitad de las búsquedas reales.
  const limpio = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const objetivo = limpio(q);
  return todos.filter(
    (m) => limpio(m.name).includes(objetivo) || m.slug.includes(objetivo),
  );
}

export async function getMunicipality(slug: string): Promise<MunicipalityDTO | null> {
  return (await _cargar()).get(slug) ?? null;
}

/**
 * Coordenadas del municipio, para el matching y los mapas.
 *
 * Cae a la lista fija de siempre si la tabla aún no está sembrada (por ejemplo
 * entre el despliegue del código y el de la migración): así el intermunicipal
 * nunca se queda sin poder calcular una distancia.
 */
export async function coordsOf(
  slug: string,
): Promise<{ lat: number; lng: number } | null> {
  const m = await getMunicipality(slug);
  if (m) return { lat: m.lat, lng: m.lng };
  const fijo = (INTERCITY_CITY_COORDS as Record<string, { lat: number; lng: number }>)[slug];
  return fijo ?? null;
}

/**
 * Coordenadas sin esperar. `getIntercityRoute` calcula distancias de forma
 * síncrona y no puede volverse asíncrona sin arrastrar medio servicio, así que
 * lee la caché ya cargada. Devuelve la lista fija si aún está fría — por eso
 * `warmMunicipalities()` se llama al arrancar.
 */
export function coordsOfSync(slug: string): { lat: number; lng: number } | null {
  const m = _cache?.get(slug);
  if (m) return { lat: m.lat, lng: m.lng };
  const fijo = (INTERCITY_CITY_COORDS as Record<string, { lat: number; lng: number }>)[slug];
  return fijo ?? null;
}

/** Carga la caché al arrancar para que `coordsOfSync` nunca esté fría. */
export async function warmMunicipalities(): Promise<void> {
  try {
    await _cargar();
  } catch {
    // Sin base todavía: se usará la lista fija hasta el primer acceso con éxito.
  }
}

/** Alta o corrección de un municipio desde el panel, sin desplegar nada. */
export async function upsertMunicipality(dto: {
  slug: string;
  name: string;
  department: string;
  lat: number;
  lng: number;
  isActive?: boolean;
}): Promise<MunicipalityDTO> {
  const slug = dto.slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error('El identificador del municipio no puede quedar vacío.');
  if (!Number.isFinite(dto.lat) || !Number.isFinite(dto.lng)) {
    throw new Error('Coordenadas inválidas.');
  }
  const m = await prisma.municipality.upsert({
    where: { slug },
    create: {
      slug,
      name: dto.name.trim(),
      department: dto.department.trim(),
      lat: dto.lat,
      lng: dto.lng,
      isActive: dto.isActive ?? true,
    },
    update: {
      name: dto.name.trim(),
      department: dto.department.trim(),
      lat: dto.lat,
      lng: dto.lng,
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    },
  });
  invalidarCacheMunicipios();
  return { slug: m.slug, name: m.name, department: m.department, lat: m.lat, lng: m.lng };
}

// Al cargar el módulo, la configuración de rutas empieza a resolver
// coordenadas contra la tabla: así un par de municipios recién agregados
// calcula distancia y precio sugerido sin tocar código.
registerMunicipalityCoords(coordsOfSync);
