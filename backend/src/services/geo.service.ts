// ─────────────────────────────────────────────────────────────────────────────
// Geo service — proxy server-side de las APIs de Google Maps.
//
// La API key (GOOGLE_MAPS_API_KEY) vive solo en el servidor: las apps llaman
// a /geo/* con su token de sesión y nunca ven la key. Las respuestas se
// reducen al mínimo que las apps necesitan (sin passthrough crudo).
//
// Usa las APIs nuevas (Places API New y Routes API): las legacy ya no se
// pueden habilitar en proyectos recientes de Google Cloud. Requiere billing
// habilitado en el proyecto (el crédito gratuito mensual cubre el uso).
//
// Sesgo regional: búsquedas centradas en Pamplona, Norte de Santander
// (Colombia), regionCode=CO.
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

// Centro por defecto: Pamplona, Norte de Santander.
const DEFAULT_LAT = 7.3754;
const DEFAULT_LNG = -72.6486;
const BIAS_RADIUS_M = 30_000;

export class GeoError extends Error {
  constructor(message: string, public readonly statusCode: number = 502) {
    super(message);
  }
}

export function isGeoConfigured(): boolean {
  return GOOGLE_MAPS_API_KEY.length > 0;
}

export interface GeoHealth {
  /** GOOGLE_MAPS_API_KEY presente en el entorno del servidor. */
  keyConfigured: boolean;
  /** La llamada de prueba a Google respondió OK. */
  upstreamOk: boolean;
  /**
   * Causa del fallo upstream, tal como la reporta Google (sin exponer la key):
   * p. ej. "REQUEST_DENIED: This API project is not authorized…" (API no
   * habilitada / sin billing) o "API keys with referer restrictions cannot
   * be used with this API" (key restringida a Android/web — debe ser sin
   * restricción de aplicación para uso server-side).
   */
  upstreamError: string | null;
}

/**
 * Diagnóstico del proxy geo: verifica la key con un reverse geocode barato
 * del centro de Pamplona. Pensado para abrirse en el navegador cuando "los
 * mapas no funcionan" y ver la causa exacta sin leer logs.
 */
export async function geoHealth(): Promise<GeoHealth> {
  if (!isGeoConfigured()) {
    return {
      keyConfigured: false,
      upstreamOk: false,
      upstreamError: 'GOOGLE_MAPS_API_KEY no está definida en el servidor (Render → Environment).',
    };
  }
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${DEFAULT_LAT},${DEFAULT_LNG}`);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    const res = await fetch(url);
    const json = (await res.json()) as Record<string, unknown>;
    const status = json['status'] as string | undefined;
    if (status === 'OK' || status === 'ZERO_RESULTS') {
      return { keyConfigured: true, upstreamOk: true, upstreamError: null };
    }
    const detail = json['error_message'] as string | undefined;
    return {
      keyConfigured: true,
      upstreamOk: false,
      upstreamError: `${status ?? `HTTP ${res.status}`}${detail ? `: ${detail}` : ''}`,
    };
  } catch (err) {
    return {
      keyConfigured: true,
      upstreamOk: false,
      upstreamError: err instanceof Error ? err.message : 'Error de red hacia Google',
    };
  }
}

async function _googleFetch(
  url: string,
  init: { method?: string; body?: unknown; fieldMask?: string },
): Promise<Record<string, unknown>> {
  if (!isGeoConfigured()) {
    throw new GeoError('Geo service not configured', 503);
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
  };
  if (init.fieldMask) headers['X-Goog-FieldMask'] = init.fieldMask;

  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const error = json['error'] as { message?: string } | undefined;
    // El mensaje upstream no contiene datos del usuario; sí ayuda a operar
    // (p. ej. "billing disabled").
    throw new GeoError(error?.message ?? `Upstream error (${res.status})`);
  }
  return json;
}

// ─── Places Autocomplete (New) ────────────────────────────────────────────────

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export async function autocomplete(
  input: string,
  lat?: number,
  lng?: number,
): Promise<PlaceSuggestion[]> {
  const json = await _googleFetch(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      body: {
        input,
        languageCode: 'es',
        regionCode: 'CO',
        locationBias: {
          circle: {
            center: {
              latitude: lat ?? DEFAULT_LAT,
              longitude: lng ?? DEFAULT_LNG,
            },
            radius: BIAS_RADIUS_M,
          },
        },
      },
    },
  );

  const suggestions = (json['suggestions'] ?? []) as Array<Record<string, unknown>>;
  const results: PlaceSuggestion[] = [];
  for (const s of suggestions) {
    const p = s['placePrediction'] as Record<string, unknown> | undefined;
    if (!p) continue;
    const text = (p['text'] as { text?: string } | undefined)?.text ?? '';
    const fmt = p['structuredFormat'] as
      | { mainText?: { text?: string }; secondaryText?: { text?: string } }
      | undefined;
    results.push({
      placeId: p['placeId'] as string,
      description: text,
      mainText: fmt?.mainText?.text ?? text,
      secondaryText: fmt?.secondaryText?.text ?? '',
    });
  }
  return results;
}

// ─── Place Details (New) ──────────────────────────────────────────────────────

export interface PlaceDetails {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const json = await _googleFetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`,
    { fieldMask: 'id,formattedAddress,location' },
  );
  const location = json['location'] as { latitude: number; longitude: number };
  return {
    placeId: json['id'] as string,
    address: json['formattedAddress'] as string,
    lat: location.latitude,
    lng: location.longitude,
  };
}

// ─── Reverse Geocoding ────────────────────────────────────────────────────────
// La Geocoding API clásica sigue vigente (no es legacy).

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!isGeoConfigured()) {
    throw new GeoError('Geo service not configured', 503);
  }
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', 'es');
  url.searchParams.set('result_type', 'street_address|route|neighborhood');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new GeoError(`Upstream error (${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  const status = json['status'] as string;
  if (status === 'ZERO_RESULTS') return null;
  if (status !== 'OK') throw new GeoError(`Reverse geocode failed: ${status}`);
  const results = json['results'] as Array<Record<string, unknown>>;
  return (results[0]?.['formatted_address'] as string | undefined) ?? null;
}

// ─── Routes API (ruta + ETA real) ─────────────────────────────────────────────

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  /** Polyline codificada (formato Google) para dibujar la ruta en el mapa. */
  polyline: string;
}

export async function directions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteInfo> {
  const json = await _googleFetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      fieldMask: 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      body: {
        origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: 'DRIVE',
        languageCode: 'es',
      },
    },
  );

  const routes = (json['routes'] ?? []) as Array<Record<string, unknown>>;
  const route = routes[0];
  if (!route) throw new GeoError('No route found', 404);

  const distanceMeters = (route['distanceMeters'] as number | undefined) ?? 0;
  // duration viene como "123s"
  const durationStr = (route['duration'] as string | undefined) ?? '0s';
  const durationSeconds = parseInt(durationStr.replace('s', ''), 10) || 0;
  const polyline =
    ((route['polyline'] as { encodedPolyline?: string } | undefined)?.encodedPolyline) ?? '';

  return {
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    polyline,
  };
}
