import { GOOGLE_MAPS_API_KEY } from '../config/constants';

const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

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
