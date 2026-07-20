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
  /**
   * Estado por API: cada una debe habilitarse por separado en Google Cloud
   * (Geocoding, Places New, Routes). Un `upstreamOk:true` que solo probaba
   * Geocoding ocultaba que el autocompletado (Places) o las rutas (Routes)
   * estaban deshabilitados y fallaban en silencio.
   */
  apis: {
    geocoding: string; // 'ok' | mensaje de error de Google
    places: string;
    routes: string;
    mapTiles: string; // Map Tiles API (imágenes del mapa) — createSession
  };
}

/** Prueba UNA API de Google y devuelve 'ok' o el error exacto que reporta. */
async function _probeApi(
  label: string,
  run: () => Promise<{ status?: string; error?: string; httpOk: boolean; httpStatus: number }>,
): Promise<string> {
  try {
    const r = await run();
    if (r.status === 'OK' || r.status === 'ZERO_RESULTS' || (r.httpOk && !r.status && !r.error)) {
      return 'ok';
    }
    return `${r.status ?? `HTTP ${r.httpStatus}`}${r.error ? `: ${r.error}` : ''}`;
  } catch (err) {
    return err instanceof Error ? err.message : `Error de red (${label})`;
  }
}

/**
 * Diagnóstico del proxy geo: prueba LAS TRES APIs que usan las apps
 * (Geocoding, Places New, Routes) por separado. Pensado para abrirse en el
 * navegador cuando "los mapas no funcionan" y ver EXACTAMENTE cuál API falta
 * habilitar o está bloqueada por la restricción de la llave — sin leer logs.
 */
export async function geoHealth(): Promise<GeoHealth> {
  if (!isGeoConfigured()) {
    return {
      keyConfigured: false,
      upstreamOk: false,
      upstreamError: 'GOOGLE_MAPS_API_KEY no está definida en el servidor (Render → Environment).',
      apis: { geocoding: 'sin llave', places: 'sin llave', routes: 'sin llave', mapTiles: 'sin llave' },
    };
  }

  // Geocoding API (reverse geocode barato).
  const geocoding = await _probeApi('geocoding', async () => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${DEFAULT_LAT},${DEFAULT_LNG}`);
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    const res = await fetch(url);
    const json = (await res.json()) as Record<string, unknown>;
    return {
      status: json['status'] as string | undefined,
      error: json['error_message'] as string | undefined,
      httpOk: res.ok,
      httpStatus: res.status,
    };
  });

  // Places API (New): autocompletado. REQUEST_DENIED aquí = Places no habilitada
  // o la key está restringida y no la permite.
  const places = await _probeApi('places', async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({ input: 'cra', languageCode: 'es', regionCode: 'CO' }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    const err = (json['error'] as { message?: string } | undefined)?.message;
    return { error: err, httpOk: res.ok, httpStatus: res.status };
  });

  // Routes API: rutas por las calles.
  const routes = await _probeApi('routes', async () => {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG } } },
        destination: { location: { latLng: { latitude: DEFAULT_LAT + 0.02, longitude: DEFAULT_LNG } } },
        travelMode: 'DRIVE',
      }),
    });
    const json = (await res.json()) as Record<string, unknown>;
    const err = (json['error'] as { message?: string } | undefined)?.message;
    return { error: err, httpOk: res.ok, httpStatus: res.status };
  });

  // Map Tiles API: imágenes del mapa de Google (createSession). REQUEST_DENIED /
  // 403 aquí = Map Tiles API no habilitada o key restringida.
  const mapTiles = await _probeApi('mapTiles', async () => {
    const res = await fetch(
      `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType: 'roadmap', language: 'es-419', region: 'CO' }),
      },
    );
    const json = (await res.json()) as Record<string, unknown>;
    const err = (json['error'] as { message?: string } | undefined)?.message;
    return { error: err, httpOk: res.ok, httpStatus: res.status };
  });

  const allOk =
    geocoding === 'ok' && places === 'ok' && routes === 'ok' && mapTiles === 'ok';
  const failing = [
    geocoding !== 'ok' ? `Geocoding (${geocoding})` : null,
    places !== 'ok' ? `Places New (${places})` : null,
    routes !== 'ok' ? `Routes (${routes})` : null,
    mapTiles !== 'ok' ? `Map Tiles (${mapTiles})` : null,
  ].filter(Boolean);

  return {
    keyConfigured: true,
    upstreamOk: allOk,
    upstreamError: allOk ? null : `Falta habilitar/permitir: ${failing.join(' · ')}`,
    apis: { geocoding, places, routes, mapTiles },
  };
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

// ─── Map Tiles API (imágenes REALES del mapa de Google) ───────────────────────
// Las apps piden /geo/tile/{z}/{x}/{y} al backend y este trae el tile de Google
// con la key server-side (la app nunca ve la key). El aspecto es idéntico a
// maps.google.com. Requiere habilitar "Map Tiles API" en Google Cloud.
//
// Map Tiles API exige un token de sesión (createSession) reutilizable ~2 semanas;
// lo cacheamos en memoria y lo recreamos solo cuando expira o Google lo rechaza.

interface MapSession {
  token: string;
  /** epoch en segundos en que expira (según Google). */
  expiry: number;
}

let _mapSession: MapSession | null = null;
let _mapSessionInFlight: Promise<string> | null = null;

async function _createMapSession(): Promise<string> {
  const res = await fetch(
    `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'roadmap', language: 'es-419', region: 'CO' }),
    },
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json['error'] as { message?: string } | undefined)?.message;
    throw new GeoError(err ?? `createSession falló (${res.status})`);
  }
  const token = json['session'] as string;
  const expiry =
    parseInt((json['expiry'] as string | undefined) ?? '0', 10) ||
    Math.floor(Date.now() / 1000) + 3600;
  _mapSession = { token, expiry };
  return token;
}

async function _getMapSession(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_mapSession && _mapSession.expiry - 60 > now) return _mapSession.token;
  if (!_mapSessionInFlight) {
    _mapSessionInFlight = _createMapSession().finally(() => {
      _mapSessionInFlight = null;
    });
  }
  return _mapSessionInFlight;
}

export interface MapTile {
  body: Buffer;
  contentType: string;
}

/** Descarga un tile del mapa de Google (proxeado, key server-side). */
export async function fetchMapTile(z: number, x: number, y: number): Promise<MapTile> {
  if (!isGeoConfigured()) throw new GeoError('Geo service not configured', 503);

  const doFetch = async (session: string): Promise<globalThis.Response> => {
    const url =
      `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}` +
      `?session=${encodeURIComponent(session)}&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    return fetch(url);
  };

  let session = await _getMapSession();
  let res = await doFetch(session);
  // Sesión expirada/invalidada por Google → recrear una vez.
  if (res.status === 401 || res.status === 403) {
    _mapSession = null;
    session = await _getMapSession();
    res = await doFetch(session);
  }
  if (!res.ok) {
    throw new GeoError(`tile upstream (${res.status})`, res.status === 404 ? 404 : 502);
  }
  const contentType = res.headers.get('content-type') ?? 'image/png';
  const arrayBuf = await res.arrayBuffer();
  return { body: Buffer.from(arrayBuf), contentType };
}
