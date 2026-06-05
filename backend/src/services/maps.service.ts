import { GOOGLE_MAPS_API_KEY } from '../config/constants';

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  polyline?: string;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const url = `${GEOCODING_URL}?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&region=co&language=es`;
  const res = await fetch(url);
  const data = await res.json() as { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } } }> };
  if (data.status !== 'OK' || !data.results[0]) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

export async function calculateRoute(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number },
): Promise<RouteInfo | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const originStr = typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`;
  const destStr = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;
  const url = `${DIRECTIONS_URL}?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&key=${GOOGLE_MAPS_API_KEY}&region=co&language=es&mode=driving`;
  const res = await fetch(url);
  const data = await res.json() as {
    status: string;
    routes: Array<{
      legs: Array<{
        distance: { value: number };
        duration: { value: number };
        start_location: { lat: number; lng: number };
        end_location: { lat: number; lng: number };
      }>;
      overview_polyline?: { points: string };
    }>;
  };
  if (data.status !== 'OK' || !data.routes[0]) return null;
  const leg = data.routes[0].legs[0];
  return {
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    durationMinutes: Math.ceil(leg.duration.value / 60),
    originLat: leg.start_location.lat,
    originLng: leg.start_location.lng,
    destLat: leg.end_location.lat,
    destLng: leg.end_location.lng,
    polyline: data.routes[0].overview_polyline?.points,
  };
}

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

/**
 * Autocompletado de direcciones (Google Places). Si se pasa lat/lng, sesga los
 * resultados alrededor de esa ubicación (p. ej. la posición del usuario).
 */
export async function placesAutocomplete(
  input: string,
  bias?: { lat: number; lng: number },
): Promise<PlacePrediction[]> {
  if (!GOOGLE_MAPS_API_KEY || !input.trim()) return [];
  const params = new URLSearchParams({
    input,
    key: GOOGLE_MAPS_API_KEY,
    language: 'es',
    components: 'country:co',
  });
  if (bias) {
    params.set('location', `${bias.lat},${bias.lng}`);
    params.set('radius', '30000');
  }
  const res = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
  const data = await res.json() as {
    status: string;
    predictions: Array<{
      place_id: string;
      description: string;
      structured_formatting?: { main_text: string; secondary_text: string };
    }>;
  };
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
  return data.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? '',
  }));
}

/** Detalle de un lugar por placeId: coordenadas + dirección formateada. */
export async function placeDetails(
  placeId: string,
): Promise<{ lat: number; lng: number; address: string } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_MAPS_API_KEY,
    language: 'es',
    fields: 'geometry,formatted_address,name',
  });
  const res = await fetch(`${PLACE_DETAILS_URL}?${params.toString()}`);
  const data = await res.json() as {
    status: string;
    result?: {
      geometry: { location: { lat: number; lng: number } };
      formatted_address?: string;
      name?: string;
    };
  };
  if (data.status !== 'OK' || !data.result) return null;
  const loc = data.result.geometry.location;
  return {
    lat: loc.lat,
    lng: loc.lng,
    address: data.result.formatted_address ?? data.result.name ?? '',
  };
}
