// Google Maps proxy — all API calls run server-side; key never exposed to clients.
// Uses:
//   • Places API (New)  — POST https://places.googleapis.com/v1/places:autocomplete
//   • Routes API        — POST https://routes.googleapis.com/directions/v2:computeRoutes
//   • Geocoding API     — GET  https://maps.googleapis.com/maps/api/geocode/json

const API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

export function isGeoConfigured(): boolean {
  return API_KEY.length > 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  description: string;
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  etaMinutes: number;
  polyline: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function gPost<T>(url: string, body: unknown, fieldMask: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Geo] ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function gGet<T>(url: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: API_KEY }).toString();
  const res = await fetch(`${url}?${qs}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Geo] ${url} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

export async function autocomplete(
  input: string,
  lat?: number,
  lng?: number,
): Promise<PlaceSuggestion[]> {
  if (!isGeoConfigured()) throw new Error('Google Maps API key not configured');

  const body: Record<string, unknown> = {
    input,
    languageCode: 'es',
    regionCode: 'CO',
  };

  if (lat !== undefined && lng !== undefined) {
    body['locationBias'] = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 30000,
      },
    };
  }

  const data = await gPost<{
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  }>(
    'https://places.googleapis.com/v1/places:autocomplete',
    body,
    'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
  );

  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      placeId: p.placeId!,
      description: p.text?.text ?? '',
      mainText: p.structuredFormat?.mainText?.text ?? '',
      secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

// ─── Place Details ────────────────────────────────────────────────────────────

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  if (!isGeoConfigured()) throw new Error('Google Maps API key not configured');

  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'id,displayName,location,formattedAddress',
      },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[Geo] place details → ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };

  const lat = data.location?.latitude;
  const lng = data.location?.longitude;
  if (lat === undefined || lng === undefined) throw new Error('[Geo] place has no location');

  return {
    placeId: data.id ?? placeId,
    description: data.formattedAddress ?? data.displayName?.text ?? '',
    lat,
    lng,
  };
}

// ─── Reverse Geocode ──────────────────────────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!isGeoConfigured()) return null;

  const data = await gGet<{
    status: string;
    results?: Array<{ formatted_address?: string }>;
  }>('https://maps.googleapis.com/maps/api/geocode/json', {
    latlng: `${lat},${lng}`,
    language: 'es',
    region: 'CO',
  });

  if (data.status !== 'OK') return null;
  return data.results?.[0]?.formatted_address ?? null;
}

// ─── Directions ───────────────────────────────────────────────────────────────

export async function directions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteInfo> {
  if (!isGeoConfigured()) throw new Error('Google Maps API key not configured');

  const body = {
    origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
    destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    languageCode: 'es',
    regionCode: 'CO',
    units: 'METRIC',
  };

  const data = await gPost<{
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  }>(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    body,
    'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
  );

  const route = data.routes?.[0];
  if (!route) throw new Error('[Geo] Routes API returned no route');

  const distanceMeters = route.distanceMeters ?? 0;
  // duration is returned as "NNNs" (e.g. "1234s")
  const durationSeconds = parseInt((route.duration ?? '0s').replace('s', ''), 10);

  return {
    distanceMeters,
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationSeconds,
    etaMinutes: Math.ceil(durationSeconds / 60),
    polyline: route.polyline?.encodedPolyline ?? '',
  };
}
