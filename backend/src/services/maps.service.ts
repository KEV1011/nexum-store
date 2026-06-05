// Servicios de mapas usando APIs gratuitas de OpenStreetMap.
// Sin API key requerida — costo $0.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const OSRM_URL = 'https://router.project-osrm.org';
const PHOTON_URL = 'https://photon.komoot.io';

// Nominatim requiere User-Agent para identificar la aplicación (política de uso).
const OSM_HEADERS = {
  'User-Agent': 'Nexum-App/1.0 (contacto@nexum.app)',
  'Accept-Language': 'es',
};

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  polyline?: string;
}

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: '1',
    countrycodes: 'co',
    'accept-language': 'es',
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
    headers: OSM_HEADERS,
  });
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data[0]) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export async function calculateRoute(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number },
): Promise<RouteInfo | null> {
  let o: { lat: number; lng: number } | null;
  let d: { lat: number; lng: number } | null;

  if (typeof origin === 'string') {
    o = await geocodeAddress(origin);
    if (!o) return null;
  } else {
    o = origin;
  }

  if (typeof destination === 'string') {
    d = await geocodeAddress(destination);
    if (!d) return null;
  } else {
    d = destination;
  }

  // OSRM espera lng,lat (longitud primero)
  const url = `${OSRM_URL}/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=polyline`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    code: string;
    routes: Array<{
      distance: number;   // metros
      duration: number;   // segundos
      geometry: string;   // polyline codificada (compatible con Google)
    }>;
  };
  if (data.code !== 'Ok' || !data.routes[0]) return null;

  const route = data.routes[0];
  return {
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    durationMinutes: Math.ceil(route.duration / 60),
    originLat: o.lat,
    originLng: o.lng,
    destLat: d.lat,
    destLng: d.lng,
    polyline: route.geometry,
  };
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface PhotonFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
  };
}

/**
 * Autocompletado de direcciones usando Photon (Komoot/OSM).
 * El placeId codifica lat|lng|dirección para evitar una llamada extra en placeDetails.
 */
export async function placesAutocomplete(
  input: string,
  bias?: { lat: number; lng: number },
): Promise<PlacePrediction[]> {
  if (!input.trim() || input.trim().length < 3) return [];

  const params = new URLSearchParams({ q: input, limit: '6', lang: 'es' });
  if (bias) {
    params.set('lat', bias.lat.toString());
    params.set('lon', bias.lng.toString());
  }

  const res = await fetch(`${PHOTON_URL}/api/?${params}`, {
    headers: { 'User-Agent': OSM_HEADERS['User-Agent'] },
  });
  const data = (await res.json()) as { features: PhotonFeature[] };
  if (!data.features?.length) return [];

  return data.features.map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    const mainParts = [
      p.name,
      p.housenumber ? `${p.street ?? ''} ${p.housenumber}`.trim() : p.street,
    ].filter(Boolean);
    const mainText = mainParts[0] ?? p.city ?? 'Lugar';
    const secondaryParts = [p.district, p.city, p.state].filter(Boolean);
    const secondaryText = secondaryParts.join(', ');
    const fullAddress = [mainText, ...secondaryParts].filter(Boolean).join(', ');
    // placeId codifica lat|lng|dirección para no necesitar llamada extra
    const placeId = `${lat}|${lng}|${encodeURIComponent(fullAddress)}`;
    return { placeId, description: fullAddress, mainText, secondaryText };
  });
}

/** Decodifica el placeId generado por placesAutocomplete — sin llamada extra a la API. */
export async function placeDetails(
  placeId: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
  const parts = placeId.split('|');
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  const address = parts[2] ? decodeURIComponent(parts[2]) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return { lat, lng, address };
}
