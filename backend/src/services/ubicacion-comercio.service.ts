// ── Ubicar un comercio y saber cuáles quedaron mal ubicados ──────────────────
//
// Las reglas viven en `lib/ubicacion-comercio.ts`. Aquí se geocodifica CON la
// ciudad, se comprueba contra su centroide y se listan los comercios ya
// creados cuya ubicación necesita que alguien la mire.

import { prisma } from '../lib/prisma';
import {
  decidirUbicacion,
  motivoUbicacionDudosa,
  type MotivoDudoso,
  type UbicacionDecidida,
} from '../lib/ubicacion-comercio';
import { geocodeAddress } from './geo.service';
import { getMunicipality, coordsOf, plazaDeCoordenadas } from './municipality.service';

export class CiudadDesconocidaError extends Error {}

/**
 * Geocodifica la dirección de un comercio dentro de su ciudad.
 *
 * Con `ciudad` (slug del municipio), la búsqueda va acotada por su nombre y el
 * resultado tiene que caer dentro de su plaza; si no, se guarda sin punto. Sin
 * ella (formularios viejos) se acepta solo un punto que caiga en alguna plaza.
 * Nunca lanza por el geocodificador: sin llave o sin respuesta, sale sin punto.
 */
export async function ubicarComercio(
  direccion: string,
  ciudad?: string | null,
): Promise<UbicacionDecidida> {
  const slug = ciudad?.trim().toLowerCase() || null;
  const m = slug ? await getMunicipality(slug) : null;
  if (slug && !m) throw new CiudadDesconocidaError(`No reconocemos la ciudad «${ciudad}».`);
  const punto = await geocodeAddress(direccion, m?.name).catch(() => null);
  const plaza = punto ? await plazaDeCoordenadas(punto.lat, punto.lng) : null;
  return decidirUbicacion(punto, m ? { slug: m.slug, lat: m.lat, lng: m.lng } : null, plaza);
}

export interface ComercioMalUbicado {
  id: string;
  name: string;
  address: string;
  citySlug: string | null;
  lat: number | null;
  lng: number | null;
  claimed: boolean;
  token: string;
  motivo: MotivoDudoso;
}

/**
 * Los comercios activos cuya ubicación no sirve para despachar: sin punto, sin
 * plaza, o con el punto lejos de la ciudad que dicen ser. No se corrige nada
 * aquí: se listan para que alguien fije el punto en el mapa del portal.
 */
export async function listarComerciosMalUbicados(): Promise<ComercioMalUbicado[]> {
  const filas = await prisma.business.findMany({
    where: { isOpen: true },
    select: {
      id: true, name: true, address: true, citySlug: true, lat: true, lng: true,
      claimed: true, token: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const salida: ComercioMalUbicado[] = [];
  for (const b of filas) {
    const plaza = b.citySlug ? await coordsOf(b.citySlug) : null;
    const punto = b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null;
    const motivo = motivoUbicacionDudosa(punto, plaza, b.citySlug);
    if (motivo) salida.push({ ...b, motivo });
  }
  return salida;
}
