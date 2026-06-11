// ─── Google Maps server-side proxy ────────────────────────────────────────────
//
// Keeps the API key on the server. Flutter apps call /geo/* — never the
// Maps APIs directly. Key is injected via GOOGLE_MAPS_API_KEY env var.
//
// APIs used:
//   Places API (New)  — autocomplete + place details
//   Routes API        — directions / distance-matrix
//   Geocoding API     — reverse geocode

const API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

export function isGeoConfigured(): boolean {
  return API_KEY.length > 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  polyline?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mapsPost(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': API_KEY,
    ...extraHeaders,
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Maps API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function mapsGet(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Maps API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Autocomplete (Places API New) ─────────────────────────────────────────────

export async function autocomplete(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = {
    input,
    languageCode: 'es',
    regionCode: 'CO',
    locationBias: {
      circle: { center: { latitude: 7.3754, longitude: -72.6486 }, radius: 50000 },
    },
  };
  if (sessionToken) body['sessionToken'] = sessionToken;

  const data = await mapsPost(
    'https://places.googleapis.com/v1/places:autocomplete',
    body,
    { 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text' },
  ) as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> };

  return (data.suggestions ?? [])
    .map((s) => {
      const p = s.placePrediction;
      if (!p?.placeId) return null;
      return {
        placeId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        description: p.text?.text ?? '',
      } satisfies PlaceSuggestion;
    })
    .filter((s): s is PlaceSuggestion => s !== null);
}

// ── Place Details (Places API New) ────────────────────────────────────────────

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const data = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?fields=id,displayName,formattedAddress,location&languageCode=es`,
    { headers: { 'X-Goog-Api-Key': API_KEY } },
  ).then(async (r) => {
    if (!r.ok) throw new Error(`Places details ${r.status}`);
    return r.json() as Promise<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }>;
  });

  return {
    placeId: data.id ?? placeId,
    name: data.displayName?.text ?? '',
    address: data.formattedAddress ?? '',
    lat: data.location?.latitude ?? 0,
    lng: data.location?.longitude ?? 0,
  };
}

// ── Reverse Geocode ───────────────────────────────────────────────────────────

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const data = await mapsGet(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${API_KEY}`,
  ) as { results?: Array<{ formatted_address?: string }>; status?: string };

  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`Reverse geocode status: ${data.status}`);
  }
  return data.results[0]?.formatted_address ?? '';
}

// ── Directions (Routes API) ───────────────────────────────────────────────────

export async function directions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<RouteInfo> {
  const data = await mapsPost(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
      destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'es',
      units: 'METRIC',
    },
    {
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
  ) as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> };

  const route = data.routes?.[0];
  if (!route) throw new Error('No route found');

  const distanceMeters = route.distanceMeters ?? 0;
  const durationSeconds = parseInt(route.duration?.replace('s', '') ?? '0', 10);

  return {
    distanceMeters,
    distanceText: distanceMeters < 1000
      ? `${distanceMeters} m`
      : `${(distanceMeters / 1000).toFixed(1)} km`,
    durationSeconds,
    durationText: durationSeconds < 60
      ? `${durationSeconds} seg`
      : `${Math.round(durationSeconds / 60)} min`,
    polyline: route.polyline?.encodedPolyline,
  };
}
