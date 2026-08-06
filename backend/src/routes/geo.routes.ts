import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { listMunicipalities } from '../services/municipality.service';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { emitirTilePase, verificarTilePase, TILE_TICKET_TTL_S } from '../lib/tile-ticket';
import { verifyClientToken } from '../services/client.service';
import {
  autocomplete,
  placeDetails,
  reverseGeocode,
  directions,
  geoHealth,
  fetchMapTile,
  GeoError,
} from '../services/geo.service';

const router = Router();

// GET /geo/health — diagnóstico del proxy de Google Maps. Público y sin PII:
// abre https://<api>/geo/health en el navegador para ver por qué fallan los
// mapas (key ausente, API no habilitada, billing, restricciones de la key…).
router.get('/health', async (_req: Request, res: Response) => {
  const health = await geoHealth();
  res.status(health.upstreamOk ? 200 : 503).json({ success: health.upstreamOk, data: health });
});

// GET /geo/municipios?q=texto — municipios a los que se puede viajar.
// Público y sin datos personales: la app lo usa para el buscador de origen y
// destino del intermunicipal, que antes era una lista fija de siete.
router.get('/municipios', async (req: Request, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? (req.query['q'] as string) : undefined;
  try {
    res.json({ success: true, data: await listMunicipalities(q) });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// Verifica un token de cliente O de conductor: ambos usan los servicios geo.
function isValidAnyToken(token: string): boolean {
  try {
    verifyClientToken(token);
    return true;
  } catch {
    // not a client token — try driver
  }
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

// El portal del negocio no usa JWT sino su token de enlace mágico, así que no
// pasaba la validación de arriba y sus tiles morían en 401: el mapa salía gris.
// Una panorámica son decenas de tiles, así que el token validado se recuerda un
// rato en memoria en vez de consultar la base por cada imagen.
const businessTokenCache = new Map<string, number>();
const BUSINESS_TOKEN_TTL_MS = 10 * 60_000;

async function isValidBusinessToken(token: string): Promise<boolean> {
  const visto = businessTokenCache.get(token);
  if (visto != null && visto > Date.now()) return true;
  const biz = await prisma.business.findUnique({
    where: { token },
    select: { isOpen: true },
  });
  if (!biz?.isOpen) return false;
  if (businessTokenCache.size > 500) {
    const ahora = Date.now();
    for (const [k, exp] of businessTokenCache) {
      if (exp <= ahora) businessTokenCache.delete(k);
    }
  }
  businessTokenCache.set(token, Date.now() + BUSINESS_TOKEN_TTL_MS);
  return true;
}

function handleGeoError(res: Response, err: unknown): void {
  if (err instanceof GeoError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(502).json({ success: false, error: 'Geo service error' });
}

// GET /geo/tile-ticket — cambia una sesión (cliente, conductor o portal del
// negocio) por un pase de dos horas que SOLO sirve para pedir tiles.
//
// Existe porque una capa de tiles no puede poner cabeceras: el permiso viaja en
// la URL de cada imagen, y una panorámica son decenas. Antes ahí iba el JWT de
// sesión de 30 días, que acaba en los logs de Render, en cualquier proxy y en
// el historial. El pase, si se filtra, solo sirve para mirar mapas.
router.get('/tile-ticket', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const bizToken = req.headers['x-business-token'];
  const bizOk = typeof bizToken === 'string' && (await isValidBusinessToken(bizToken));

  if (!bizOk && (!token || !isValidAnyToken(token))) {
    res.status(401).json({ success: false, error: 'Sesión inválida o expirada' });
    return;
  }
  res.json({
    success: true,
    data: { ticket: emitirTilePase(JWT_SECRET), expiresIn: TILE_TICKET_TTL_S },
  });
});

// GET /geo/tile/:z/:x/:y — imagen REAL del mapa de Google (Map Tiles API),
// proxeada con la key server-side. Acepta el pase por query (`?t=`) —la única
// vía para una capa de tiles— o una sesión completa por cabecera, para quien sí
// pueda mandarla. Lo que ya NO se acepta es la sesión por query: era filtrar el
// token de 30 días en cada imagen.
// Se declara ANTES del middleware de header porque hace su propia validación.
router.get('/tile/:z/:x/:y', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const pase = req.query['t'] as string | undefined;

  const autorizado =
    verificarTilePase(JWT_SECRET, pase) ||
    (!!headerToken && (isValidAnyToken(headerToken) || (await isValidBusinessToken(headerToken))));

  if (!autorizado) {
    res.status(401).json({ success: false, error: 'Pase de mapa inválido o expirado' });
    return;
  }
  const z = parseInt(req.params['z'] as string, 10);
  const x = parseInt(req.params['x'] as string, 10);
  const y = parseInt(req.params['y'] as string, 10);
  if ([z, x, y].some(Number.isNaN)) {
    res.status(400).json({ success: false, error: 'z, x, y requeridos' });
    return;
  }
  try {
    const tile = await fetchMapTile(z, x, y);
    res.setHeader('Content-Type', tile.contentType);
    // Los tiles del mapa cambian raramente: se cachean en el cliente/CDN.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(tile.body);
  } catch (err) {
    handleGeoError(res, err);
  }
});

// Acepta token de cliente O de conductor por header: ambos usan los servicios geo.
function anyAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }
  if (isValidAnyToken(authHeader.slice(7))) {
    next();
    return;
  }
  res.status(401).json({ success: false, error: 'Invalid or expired token' });
}

router.use(anyAuthMiddleware);

// GET /geo/autocomplete?input=cra+5&lat=&lng=
router.get('/autocomplete', async (req, res) => {
  const input = (req.query['input'] as string | undefined)?.trim();
  if (!input || input.length < 3) {
    res.json({ success: true, data: [] });
    return;
  }
  const lat = req.query['lat'] ? parseFloat(req.query['lat'] as string) : undefined;
  const lng = req.query['lng'] ? parseFloat(req.query['lng'] as string) : undefined;
  try {
    const suggestions = await autocomplete(input, lat, lng);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/place/:placeId — coordenadas + dirección formateada
router.get('/place/:placeId', async (req, res) => {
  try {
    const details = await placeDetails(req.params['placeId']!);
    res.json({ success: true, data: details });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/reverse?lat=&lng= — dirección legible desde coordenadas GPS
router.get('/reverse', async (req, res) => {
  const lat = parseFloat(req.query['lat'] as string);
  const lng = parseFloat(req.query['lng'] as string);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ success: false, error: 'lat and lng are required' });
    return;
  }
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ success: true, data: { address } });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/directions?originLat=&originLng=&destLat=&destLng=
router.get('/directions', async (req, res) => {
  const originLat = parseFloat(req.query['originLat'] as string);
  const originLng = parseFloat(req.query['originLng'] as string);
  const destLat = parseFloat(req.query['destLat'] as string);
  const destLng = parseFloat(req.query['destLng'] as string);
  if ([originLat, originLng, destLat, destLng].some(Number.isNaN)) {
    res.status(400).json({ success: false, error: 'originLat, originLng, destLat and destLng are required' });
    return;
  }
  try {
    const route = await directions(originLat, originLng, destLat, destLng);
    res.json({ success: true, data: route });
  } catch (err) {
    handleGeoError(res, err);
  }
});

export default router;
