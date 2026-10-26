import { Router, Request, Response } from 'express';
import { csvTemplate, parseProductCsv } from '../lib/product-csv';
import {
  listOptionGroups,
  upsertOptionGroup,
  deleteOptionGroup,
  applyOptionGroupToCategory,
  getBusinessService,
  getManagedProductsForBusiness,
  reorderBusinessProducts,
  createBusinessProduct,
  findProductByBarcode,
  suggestProductByBarcode,
  getSalesReportForBusiness,
  getBarcodeIndexForBusiness,
  applyProductImport,
  updateBusinessProduct,
  deleteBusinessProduct,
  updateBusinessCover,
  addProductPhoto,
  deleteProductPhoto,
  setProductOptions,
  aplicarRolesDeCarta,
  proponerSeparacionDeNombres,
  aplicarSeparacionDeNombres,
  getBusinessSettings,
  updateBusinessSettings,
  getBusinessStats,
  getBusinessReviews,
  findBusinessesByPhone,
  recuperarNegocios,
  recuperarNegociosConPase,
  type RecuperacionNegocios,
  updateBusinessLocation,
  updateBusinessShipping,
} from '../services/business.service';
import { codigoEsLlaveMaestra, requestOtp, validateOtp, OtpRateLimitError } from '../services/otp.service';
import { ClaveError, fijarClave } from '../services/clave-personal.service';
import { normalizeColombianPhone } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { isSmsConfigured } from '../services/sms.service';
import {
  getClientOrdersForBusiness,
  acceptOrderByBusiness,
  rejectOrderByBusiness,
  markOrderReadyByBusiness,
} from '../services/client.service';
import { getMesasDelNegocio, guardarMesas, marcarServido } from '../services/mesa.service';
import {
  addFotoDelLocal,
  quitarFotoDelLocal,
  updateBusinessLogo,
  updateMarcaDelLocal,
} from '../services/business.service';
import {
  RegisterBusinessDTO,
  BUSINESS_CATEGORIES,
  CreateProductDTO,
  UpdateProductDTO,
  SetProductOptionsDTO,
  BusinessSettingsDTO,
} from '../types';
import { authLimiter } from '../middleware/rate-limit.middleware';
import { cartaUpload, documentUpload, fileToUrl } from '../lib/upload';
import { mejorLectura, parsearCarta, parsearCartaMedida, filasACsv } from '../lib/carta-foto';
import { GRUPO_TAMANO, motivoParaNoAgrupar, sugerirVariantes } from '../lib/carta-variantes';
import {
  agruparAdicionales,
  agruparGuarniciones,
  destinoPorDefecto,
  sanearRol,
} from '../lib/carta-rol';
import { limpiarTextoDeCarta } from '../lib/texto-carta';
import { saneaGrupo } from '../lib/texto-opciones';
import { reporteACsv } from '../lib/reporte-ventas';
import { altoDelCuerpo, esTituloPorTamano, lineasDeLaFoto } from '../lib/carta-geometria';
import { leerTextoDeCarta } from '../services/carta-ocr.service';
import {
  reservarUsoIA,
  revisarCartaConIA,
  revisorDisponible,
} from '../services/carta-ia.service';
import { revisarFilas, sanearFilas } from '../lib/carta-ia';
import { PORTAL_BASE_URL } from '../config/constants';
import { pedidosEnCocina, deshacerPlatoListo } from '../services/cocina.service';
import {
  cuentasAbiertas, getCuenta, cerrarCuenta, reabrirCuenta,
  cancelarRondaDeMesa, cuentasReabiertasHoy,
} from '../services/cuenta-mesa.service';
import { cajaAbierta, abrirCaja, cerrarCaja, cajasDelDia } from '../services/caja.service';
import {
  saldoDelAliado, creditosPendientes, girosDelAliado, GiroError,
} from '../services/giro-aliado.service';

const router = Router();

// ─── Registro público de negocios ─────────────────────────────────────────────
// Autoservicio desde /negocio/registro (el flujo "lo registra el repartidor"
// se eliminó junto con el business_portal del app). Protegido por rate-limit.

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as RegisterBusinessDTO;

  if (!dto.name || !dto.ownerName || !dto.phone || !dto.address || !dto.category) {
    res.status(400).json({
      success: false,
      error: 'Faltan campos requeridos: nombre, dueño, teléfono, dirección y categoría.',
    });
    return;
  }

  // Una categoría desconocida llegaba hasta Prisma como `undefined` y el
  // registro fallaba con un error de base de datos que no le dice nada a
  // nadie. Se valida aquí, con la lista y en español.
  if (!BUSINESS_CATEGORIES.includes(dto.category)) {
    res.status(400).json({
      success: false,
      error: `Categoría no válida. Las disponibles son: ${BUSINESS_CATEGORIES.join(', ')}.`,
    });
    return;
  }

  try {
    const business = await getBusinessService().registerBusiness(dto);
    res.status(201).json({
      success: true,
      data: {
        ...business,
        portalUrl: `${PORTAL_BASE_URL}/negocio/${business.accessToken}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ success: false, error: message });
  }
});

// ─── Recuperación del enlace del portal ───────────────────────────────────────
// El portal es un enlace mágico sin contraseña: quien lo pierde se queda por
// fuera para siempre. Con OTP al teléfono del registro se prueba la posesión
// del número y se devuelven los enlaces de sus negocios.

// POST /business/recover/send-otp { phone }
router.post('/recover/send-otp', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'Escribe tu número de teléfono.' });
    return;
  }
  try {
    // Con Twilio, el SMS real solo sale si el número tiene negocios (evita
    // SMS-pumping); en modo local la sesión se crea siempre para que el verify
    // pueda validar el código primero. La respuesta es idéntica en ambos casos:
    // desde afuera no se puede averiguar qué números están registrados.
    const negocios = await findBusinessesByPhone(phone);
    if (negocios.length > 0 || !isSmsConfigured()) await requestOtp(phone.trim());
    res.json({ success: true, data: { sent: true } });
  } catch (err) {
    const status = err instanceof OtpRateLimitError ? 429 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo enviar el código.',
    });
  }
});

// POST /business/recover/verify-otp { phone, otp } → enlaces de sus negocios
router.post('/recover/verify-otp', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'Faltan el teléfono y el código.' });
    return;
  }
  // 1) Validar el código PRIMERO: prueba que quien pregunta tiene el teléfono.
  try {
    await validateOtp(phone.trim(), otp.trim());
  } catch (err) {
    const status = err instanceof OtpRateLimitError ? 429 : 401;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'Código inválido',
    });
    return;
  }
  // 2) ...y solo entonces revelar los negocios. No hay enumeración posible:
  // esta información llega únicamente a quien recibió el SMS. Sin SMS, el que
  // tiene clave personal además la pide (ver `recuperarNegocios`).
  const pin = (req.body as { pin?: unknown }).pin;
  try {
    const r = await recuperarNegocios(phone, typeof pin === 'string' ? pin : undefined);
    res.json({ success: true, data: _enlacesDeRecuperacion(r) });
  } catch (err) {
    _errorDeClave(res, err);
  }
});

// POST /business/recover/verify-pin { pinTicket, pin } — termina una
// recuperación que pidió la clave personal.
router.post('/recover/verify-pin', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { pinTicket, pin } = req.body as { pinTicket?: unknown; pin?: unknown };
  try {
    const r = await recuperarNegociosConPase(pinTicket, typeof pin === 'string' ? pin : undefined);
    res.json({ success: true, data: _enlacesDeRecuperacion(r) });
  } catch (err) {
    _errorDeClave(res, err);
  }
});

function _enlacesDeRecuperacion(r: RecuperacionNegocios) {
  if ('needsPin' in r) return r;
  return {
    businesses: r.businesses.map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      isOpen: b.isOpen,
      portalUrl: `${PORTAL_BASE_URL}/negocio/${b.token}`,
    })),
    ...(r.pinSetupRequired ? { pinSetupRequired: true } : {}),
  };
}

function _errorDeClave(res: Response, err: unknown): void {
  if (err instanceof ClaveError) {
    res.status(err.status).json({ success: false, error: err.message, code: err.code });
    return;
  }
  res.status(500).json({ success: false, error: 'No se pudo recuperar el acceso.' });
}

// GET /business/:token/clave → { tiene, exigible }
router.get('/:token/clave', async (req: Request, res: Response): Promise<void> => {
  const biz = await prisma.business.findUnique({
    where: { token: req.params['token']! },
    select: { id: true, loginPinHash: true, phone: true },
  });
  if (!biz) { res.status(404).json({ success: false, error: 'Negocio no encontrado' }); return; }
  res.json({
    success: true,
    data: {
      tiene: !!biz.loginPinHash,
      exigible: codigoEsLlaveMaestra(biz.phone ? normalizeColombianPhone(biz.phone) : ''),
    },
  });
});

// PUT /business/:token/clave { nueva, actual? } — la clave con la que el
// dueño recupera este enlace si lo pierde.
router.put('/:token/clave', async (req: Request, res: Response): Promise<void> => {
  const biz = await prisma.business.findUnique({
    where: { token: req.params['token']! },
    select: { id: true },
  });
  if (!biz) { res.status(404).json({ success: false, error: 'Negocio no encontrado' }); return; }
  const { nueva, actual } = (req.body ?? {}) as { nueva?: unknown; actual?: unknown };
  try {
    await fijarClave({ tipo: 'business', id: biz.id }, nueva, typeof actual === 'string' ? actual : undefined);
    res.json({ success: true, data: { tiene: true } });
  } catch (err) {
    _errorDeClave(res, err);
  }
});

// ─── Portal access: verify token and get business info ───────────────────────

router.get('/:token/info', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({
      success: true,
      data: {
        id: business.id,
        name: business.name,
        ownerName: business.ownerName,
        category: business.category,
        address: business.address,
        imageUrl: business.imageUrl,
        lat: business.lat,
        lng: business.lng,
        citySlug: business.citySlug,
        shipsTo: business.shipsTo,
        pagoPendienteDesde: business.pagoPendienteDesde ?? null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Access denied';
    res.status(message.includes('not found') ? 404 : 403).json({
      success: false,
      error: message,
    });
  }
});

// ─── Ajustes del negocio (perfil, tarifa, tiempo, abierto/cerrado) ────────────

router.get('/:token/settings', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const settings = await getBusinessSettings(business.id);
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Access denied';
    res.status(message.includes('not found') ? 404 : 403).json({ success: false, error: message });
  }
});

router.put('/:token/settings', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const settings = await updateBusinessSettings(business.id, req.body as BusinessSettingsDTO);
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron guardar los ajustes';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// PUT /business/:token/location { lat, lng } — el dueño fija su punto en el mapa.
// Los negocios registrados antes de la geocodificación automática no tienen
// coordenadas, y hay direcciones que Google no resuelve: sin esta vía se
// quedarían anclados al centro del pueblo para siempre.
router.put('/:token/location', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await updateBusinessLocation(business.id, Number(lat), Number(lng));
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo guardar la ubicación';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// PUT /business/:token/shipping { destinos: [{city, fee, etaHours}] }
//
// El dueño declara a qué otras ciudades despacha. Lista vacía = solo su ciudad,
// que es donde está todo comercio hasta que declare lo contrario.
router.put('/:token/shipping', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { destinos } = req.body as { destinos?: unknown };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await updateBusinessShipping(business.id, destinos ?? []);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron guardar los destinos';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Estadísticas de ventas del negocio ───────────────────────────────────────

// GET /business/:token/reviews — la nota del local y lo que la gente escribió.
router.get('/:token/reviews', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({ success: true, data: await getBusinessReviews(business.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron cargar las calificaciones';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.get('/:token/stats', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { from, to } = req.query as { from?: string; to?: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const stats = await getBusinessStats(business.id, from, to);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron cargar las estadísticas';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Orders: list today's orders ──────────────────────────────────────────────

router.get('/:token/orders', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const [orders, stats] = await Promise.all([
      getBusinessService().getTodayOrdersForBusiness(business.id),
      getBusinessService().getDayStats(business.id),
    ]);

    // El portal (`/negocio/[token]`) renderiza `business.name` en el header:
    // sin este campo la página crashea con "Cannot read properties of
    // undefined (reading 'name')". Se incluye la info mínima del negocio.
    res.status(200).json({
      success: true,
      data: {
        // `pagoPendienteDesde`: con el plan sin pagar, los pedidos nuevos ya
        // no llegan aquí (salen como mandados de compra) y el portal tiene
        // que decirlo — si no, el dueño vería una pantalla vacía y creería
        // que nadie le pide.
        business: {
          name: business.name, token, imageUrl: business.imageUrl,
          pagoPendienteDesde: business.pagoPendienteDesde ?? null,
        },
        orders,
        stats,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load orders';
    res.status(message.includes('not found') ? 404 : 400).json({
      success: false,
      error: message,
    });
  }
});

// GET /business/:token/ventas?from&to — el reporte de un período.
//
// NO es una factura electrónica: esa la emite un facturador autorizado por la
// DIAN y el que responde ante ella es el dueño. Esto es con lo que cuadra la
// caja y lo que le pide el contador. `.csv` devuelve lo mismo para Excel.
router.get('/:token/ventas', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { from, to } = req.query as { from?: string; to?: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const reporte = await getSalesReportForBusiness(business.id, from, to);
    res.status(200).json({ success: true, data: reporte });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo armar el reporte';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.get('/:token/ventas.csv', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { from, to } = req.query as { from?: string; to?: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const reporte = await getSalesReportForBusiness(business.id, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ventas-zipa.csv"');
    // El BOM hace que Excel abra el archivo en UTF-8: sin él, «Bandeja paisa»
    // sale con la tilde partida y el dueño cree que el reporte está corrupto.
    res.status(200).send('\uFEFF' + reporteACsv(reporte));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo armar el reporte';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Orders: detail ───────────────────────────────────────────────────────────

router.get('/:token/orders/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };

  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await getBusinessService().getOrderDetail(orderId, business.id);
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Order not found';
    res.status(message.includes('not found') ? 404 : 400).json({
      success: false,
      error: message,
    });
  }
});

// ─── Pedidos del portal del conductor: RUTAS RETIRADAS ───────────────────────
//
// `POST /business/orders` y `PATCH /business/orders/:orderId/status` servían al
// portal de negocios que vivía DENTRO de la app del conductor. Esa pantalla se
// eliminó hace tandas (el canal real del negocio es la web /negocio) y las
// rutas se quedaron sin nadie que las llamara.
//
// No eran solo código muerto. El PATCH aceptaba cualquier orderId con un JWT
// de conductor y NO comprobaba que ese pedido fuera suyo: cualquier conductor
// registrado podía marcar como entregado el pedido de otro —y disparar el
// WhatsApp de "entregado" al negocio—. El camino vivo
// (`updateOrderStatusByDriver` en client.service) sí valida la asignación.

// ─── Client orders from AppCliente ───────────────────────────────────────────

router.get('/:token/client-orders', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const orders = await getClientOrdersForBusiness(business.id);
    res.status(200).json({ success: true, data: orders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load orders';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Gestión del pedido por el restaurante (portal, token-auth) ───────────────
// El restaurante acepta y fija el tiempo de preparación (dispara el despacho),
// rechaza, o marca el pedido listo para recoger.

router.post('/:token/client-orders/:orderId/accept', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  const prepMinutes = Number((req.body as { prepMinutes?: unknown }).prepMinutes);
  if (!Number.isFinite(prepMinutes) || prepMinutes <= 0) {
    res.status(400).json({ success: false, error: 'prepMinutes (minutos de preparación) es requerido' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await acceptOrderByBusiness(business.id, orderId, prepMinutes);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido ya no está pendiente de aceptación' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo aceptar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/client-orders/:orderId/reject', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await rejectOrderByBusiness(business.id, orderId);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido ya no se puede rechazar' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo rechazar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/client-orders/:orderId/ready', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await markOrderReadyByBusiness(business.id, orderId);
    if (!order) {
      res.status(409).json({ success: false, error: 'El pedido no se puede marcar como listo' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo marcar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// El plato SALIÓ al salón. Es el cierre de un pedido en mesa: ahí no hay
// repartidor que lo recoja, así que «listo» y «entregado» son el mismo momento.
router.post('/:token/client-orders/:orderId/servido', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const order = await marcarServido(business.id, orderId);
    if (!order) {
      res.status(409).json({ success: false, error: 'Ese pedido ya no se puede marcar como servido' });
      return;
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo marcar el pedido';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Mesas del local y código de la carta ─────────────────────────────────────
//
// El código que devuelven estas rutas es el PÚBLICO (`menuCode`), el que va en
// el QR. Nunca se imprime `token`: ese abre el portal entero.

router.get('/:token/mesas', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({ success: true, data: await getMesasDelNegocio(business.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron cargar las mesas';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.put('/:token/mesas', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const { tables } = req.body as { tables?: unknown };
    res.status(200).json({ success: true, data: await guardarMesas(business.id, tables) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron guardar las mesas';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Catálogo del negocio (gestión del dueño, autenticada por el token) ───────
// El token del portal ES la credencial del negocio (mismo modelo que /orders).

// Catálogo COMPLETO (incluye no disponibles) para la vista de gestión.
router.get('/:token/products', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const products = await getManagedProductsForBusiness(business.id);
    res.status(200).json({ success: true, data: products });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo cargar el catálogo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ── Carga masiva por CSV ─────────────────────────────────────────────────────

// GET /business/:token/products/csv-template — plantilla con la fila de ejemplo.
router.get('/:token/products/csv-template', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    await getBusinessService().getBusinessByToken(token);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.csv"');
    // BOM para que Excel en Windows respete las tildes.
    res.status(200).send('\uFEFF' + csvTemplate());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo generar la plantilla';
    res.status(404).json({ success: false, error: message });
  }
});

// POST /business/:token/products/csv-preview { csv } — dice QUÉ pasaría, sin
// tocar nada. Un archivo con la columna de precio corrida destrozaría el
// catálogo entero: esta pantalla es lo único que lo impide.
router.post('/:token/products/csv-preview', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { csv } = req.body as { csv?: string };
  if (typeof csv !== 'string' || !csv.trim()) {
    res.status(400).json({ success: false, error: 'Envía el contenido del archivo CSV.' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const indice = await getBarcodeIndexForBusiness(business.id);
    res.status(200).json({ success: true, data: parseProductCsv(csv, indice) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el archivo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /business/:token/products/csv-import — aplica lo que el dueño confirmó.
// Se vuelve a interpretar el CSV en el servidor en vez de confiar en la lista
// que manda el navegador: así lo aplicado es exactamente lo que se validó.
router.post('/:token/products/csv-import', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { csv } = req.body as { csv?: string };
  if (typeof csv !== 'string' || !csv.trim()) {
    res.status(400).json({ success: false, error: 'Envía el contenido del archivo CSV.' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const indice = await getBarcodeIndexForBusiness(business.id);
    const preview = parseProductCsv(csv, indice);
    const resultado = await applyProductImport(
      business.id,
      preview.nuevos,
      preview.actualizaciones,
    );
    res.status(200).json({
      success: true,
      data: { ...resultado, omitidos: preview.errores.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo importar el catálogo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// GET /business/:token/products/barcode/:code — el escáner pregunta si el
// negocio YA tiene ese producto. Si existe se abre su ficha para ajustar precio
// o sumar existencias (el caso frecuente al reponer); si no, se crea uno nuevo
// con el código ya rellenado y con el nombre PROPUESTO a partir de cómo lo
// tienen los demás comercios (nunca su precio — ver `sugerencia-codigo.ts`).
router.get('/:token/products/barcode/:code', async (req: Request, res: Response): Promise<void> => {
  const { token, code } = req.params as { token: string; code: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await findProductByBarcode(business.id, code);
    // La sugerencia solo se busca si NO lo tiene: teniéndolo, lo que manda es
    // su propia ficha y proponerle el nombre de otra tienda sería cambiárselo.
    const sugerencia = product ? null : await suggestProductByBarcode(business.id, code);
    // 200 con data:null — "no lo tienes" es una respuesta válida, no un error.
    res.status(200).json({ success: true, data: product, sugerencia });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo buscar el producto';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// PUT /business/:token/products/order { order: [{ id, sortOrder }] } — reordena
// la carta en UNA petición. Mover un plato de sitio no debe disparar cuarenta
// llamadas, que en el celular del dueño con mala señal deja el menú a medio
// reordenar.
router.put('/:token/products/order', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { order } = req.body as { order?: Array<{ id?: string; sortOrder?: number }> };
  if (!Array.isArray(order) || order.length === 0) {
    res.status(400).json({ success: false, error: 'order es requerido' });
    return;
  }
  const limpio = order
    .filter((o) => typeof o.id === 'string' && Number.isFinite(o.sortOrder))
    .map((o) => ({ id: o.id as string, sortOrder: Math.trunc(o.sortOrder as number) }));
  if (limpio.length !== order.length) {
    res.status(400).json({ success: false, error: 'Cada entrada necesita id y sortOrder.' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({
      success: true,
      data: await reorderBusinessProducts(business.id, limpio),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo reordenar el catálogo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:token/products', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const dto = req.body as CreateProductDTO;
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await createBusinessProduct(business.id, dto);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear el producto';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.patch('/:token/products/:productId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  const dto = req.body as UpdateProductDTO;
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await updateBusinessProduct(business.id, productId, dto);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el producto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

router.delete('/:token/products/:productId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    await deleteBusinessProduct(business.id, productId);
    res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar el producto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// Sube la foto de un producto (multipart 'file') y devuelve el producto actualizado.
router.post(
  '/:token/products/:productId/photo',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token, productId } = req.params as { token: string; productId: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const product = await updateBusinessProduct(business.id, productId, {
        imageUrl: fileToUrl(req.file),
      });
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la foto';
      const notFound = message.includes('not found') || message.includes('no encontrado');
      res.status(notFound ? 404 : 400).json({ success: false, error: message });
    }
  },
);

// POST /business/:token/products/carta-foto (multipart 'file')
//
// Lee la carta impresa de una foto y devuelve las filas que el dueño va a
// REVISAR. No escribe nada: lo que se apruebe sale por el importador de
// siempre (`csv-preview` → `csv-import`), que es donde vive la vista previa
// obligatoria y la guarda de pertenencia al negocio. Un segundo camino de
// escritura sería un segundo sitio donde olvidarse de validar el precio.
router.post(
  '/:token/products/carta-foto',
  (req: Request, res: Response, next) => {
    // `cartaUpload` y no `documentUpload`: la foto va a MEMORIA. El lector
    // necesita los bytes (una ruta `/uploads/...` del disco efímero de Render
    // no la puede abrir Google) y de la carta solo interesa el texto, así que
    // guardarla sería un archivo que nadie vuelve a abrir.
    cartaUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params as { token: string };
    if (!req.file?.buffer?.length) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({
        success: false,
        error: 'La carta debe ser una foto (JPG, PNG o WebP).',
      });
      return;
    }
    try {
      // Se resuelve el negocio ANTES de gastar una llamada al proveedor: un
      // token inválido no debe costar una lectura facturada.
      const negocio = await getBusinessService().getBusinessByToken(token);

      // Google Vision se factura POR IMAGEN y la única credencial de esta ruta
      // es el enlace del negocio, que se pega en WhatsApp: un token filtrado
      // bastaba para leer cartas en bucle a nuestra cuenta. La revisión con IA
      // —la otra llamada facturada de esta pantalla— ya tenía este tope y a
      // esta se le olvidó.
      //
      // Cupo APARTE del de la IA (misma función, otra clave): leer la carta y
      // revisarla son dos proveedores distintos, y con un solo bote un dueño
      // que sube diez cartas y las corrige se quedaría sin poder hacer ninguna
      // de las dos cosas.
      if (!reservarUsoIA(`carta-foto:${negocio.id}`)) {
        res.status(429).json({
          success: false,
          error: 'Ya leíste muchas cartas en la última hora. Vuelve en un rato, o carga los productos con el archivo de Excel.',
        });
        return;
      }

      const lectura = await leerTextoDeCarta({
        bytes: req.file.buffer,
        mimetype: req.file.mimetype,
      });
      if (!lectura.disponible) {
        // 503 y no 400: no se equivocó el dueño, es que el servicio no está.
        res.status(503).json({ success: false, error: lectura.motivo });
        return;
      }

      // Con la geometría de la foto se lee columna por columna y el título se
      // reconoce por el TAMAÑO de su letra. Sin ella —proveedor que no la
      // manda, o `fake`— se cae al texto plano, que es como funcionaba antes.
      //
      // Y se hacen LAS DOS lecturas y se queda la que más platos encontró con
      // precio (`mejorLectura`): una foto que engaña a la geometría —de lado,
      // torcida, con un plegado— ya no puede dejar la carta peor que el texto
      // corrido de Vision, que es como se leía antes.
      const medidas = lectura.palabras ? lineasDeLaFoto(lectura.palabras) : [];
      const porTexto = parsearCarta(lectura.texto);
      const carta = medidas.length > 0
        ? mejorLectura(parsearCartaMedida(medidas, altoDelCuerpo(medidas), esTituloPorTamano), porTexto)
        : porTexto;
      res.status(200).json({
        success: true,
        data: {
          lineas: carta.lineas,
          secciones: carta.secciones,
          // Platos que parecen el mismo en varios tamaños. Es una SUGERENCIA
          // para la vista previa: el dueño la acepta, la corrige o la deja
          // separada. Sin esto, «Picada pequeña/mediana/grande» nace como tres
          // productos sueltos y arreglarlo pide otra pantalla.
          variantes: sugerirVariantes(carta.lineas),
          // Lo que la carta dice que TRAEN los platos («acompañados de papa a
          // la francesa»): el portal lo propone como su descripción.
          notas: carta.notas,
          // Se devuelve el texto leído para que el dueño pueda comprobar si el
          // problema fue la foto (borrosa, torcida) o nuestra lectura.
          textoCrudo: lectura.texto,
          // Si hay agente revisor, el portal se lo pide justo después. Va en
          // una petición APARTE a propósito: la lista se ve ya, y si la IA
          // tarda o falla la lectura no se pierde.
          revisorIA: revisorDisponible(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo leer la carta';
      const notFound = message.includes('not found') || message.includes('no encontrado');
      res.status(notFound ? 404 : 400).json({ success: false, error: message });
    }
  },
);

// ── El agente revisor de la carta ─────────────────────────────────────────────
//
// Dos puertas y una sola regla: la IA PROPONE correcciones y `revisarFilas`
// decide cuáles valen (ningún precio que no esté impreso, ninguna palabra que
// no estuviera). Ninguna de las dos escribe en el catálogo: devuelven cambios
// con su «antes» y su «después» para que el portal los aplique sobre la vista
// previa, y lo aprobado sigue saliendo por `carta-importar`, como siempre.

async function _revisarCarta(
  req: Request,
  res: Response,
  entrada: { imagen?: { bytes: Buffer; mimetype: string }; cuerpo: Record<string, unknown> },
): Promise<void> {
  const { token } = req.params as { token: string };
  const { cuerpo } = entrada;
  const filas = sanearFilas(cuerpo['filas']);
  if (filas.length === 0) {
    res.status(400).json({ success: false, error: 'No hay filas para revisar.' });
    return;
  }
  const instruccion = typeof cuerpo['instruccion'] === 'string'
    ? cuerpo['instruccion'].replace(/\s+/g, ' ').trim().slice(0, 500)
    : '';
  const textoCrudo = typeof cuerpo['textoCrudo'] === 'string' ? cuerpo['textoCrudo'].slice(0, 20_000) : '';
  const secciones = Array.isArray(cuerpo['secciones'])
    ? cuerpo['secciones'].filter((x): x is string => typeof x === 'string').slice(0, 60)
    : [];
  try {
    // El negocio ANTES de gastar una llamada facturada.
    const negocio = await getBusinessService().getBusinessByToken(token);
    if (!revisorDisponible()) {
      res.status(503).json({ success: false, error: 'La revisión con IA no está activada en esta cuenta.' });
      return;
    }
    if (!reservarUsoIA(negocio.id)) {
      res.status(429).json({
        success: false,
        error: 'Ya usaste muchas revisiones en la última hora. Revisa la lista a mano o vuelve en un rato.',
      });
      return;
    }
    const r = await revisarCartaConIA({
      ...(entrada.imagen && { imagen: entrada.imagen }),
      filas, secciones, textoCrudo,
      ...(instruccion && { instruccion }),
    });
    if (!r.disponible) {
      res.status(503).json({ success: false, error: r.motivo });
      return;
    }
    const revision = revisarFilas(filas, r.correcciones, {
      textoCrudo, secciones, modo: instruccion ? 'instruccion' : 'revision',
      ...(instruccion && { instruccion }),
    });
    if (revision.descartadas.length > 0) {
      // Al log y no al dueño: lo que la guarda frenó es nuestro asunto, y es
      // justo lo que hay que mirar para afinar la instrucción del agente.
      console.log(
        `[CartaIA] ${negocio.id}: ${revision.descartadas.length} propuesta(s) descartada(s): `
        + revision.descartadas.slice(0, 10).map((d) => `L${d.linea} ${d.accion} (${d.razon})`).join('; '),
      );
    }
    res.json({
      success: true,
      data: {
        resumen: r.resumen,
        aplicadas: revision.aplicadas,
        sugerencias: revision.sugerencias,
        descartadas: revision.descartadas.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo revisar la carta';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
}

// POST /business/:token/products/carta-revisar (multipart: 'file' + 'datos')
//
// La revisión completa, con la FOTO: el portal la vuelve a mandar (reducida)
// junto con la lista que tiene en pantalla. Lo de confianza alta llega ya
// aplicado —con su «deshacer»—; lo demás, como sugerencia.
router.post(
  '/:token/products/carta-revisar',
  (req: Request, res: Response, next) => {
    cartaUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    let cuerpo: Record<string, unknown> = {};
    const datos = (req.body as { datos?: unknown })?.datos;
    if (typeof datos === 'string') {
      try {
        cuerpo = JSON.parse(datos) as Record<string, unknown>;
      } catch {
        res.status(400).json({ success: false, error: 'Los datos de la carta llegaron dañados.' });
        return;
      }
    }
    // La instrucción del dueño va por la otra puerta: aquí la IA mira por su cuenta.
    delete cuerpo['instruccion'];
    await _revisarCarta(req, res, {
      ...(req.file?.buffer?.length && {
        imagen: { bytes: req.file.buffer, mimetype: req.file.mimetype },
      }),
      cuerpo,
    });
  },
);

// POST /business/:token/products/carta-corregir
//   { filas, secciones, textoCrudo, instruccion }
//
// «Las papas no son un plato, vienen con la hamburguesa»: el dueño dice con
// sus palabras qué quedó mal y la IA lo traduce en cambios. Como lo PIDIÓ él,
// todo lo que pase la guarda se aplica de una (y se puede deshacer).
router.post('/:token/products/carta-corregir', async (req: Request, res: Response): Promise<void> => {
  const cuerpo = (req.body ?? {}) as Record<string, unknown>;
  if (typeof cuerpo['instruccion'] !== 'string' || cuerpo['instruccion'].trim().length < 3) {
    res.status(400).json({ success: false, error: 'Escribe qué quedó mal.' });
    return;
  }
  await _revisarCarta(req, res, { cuerpo });
});

// POST /business/:token/products/carta-importar
//   { filas: [{nombre,precio,seccion}], variantes?: [...] }
//
// Lo que el dueño aprobó en la tabla de la carta. Convierte sus filas a CSV y
// las mete por el MISMO importador: la validación, el precio de la BD y la
// guarda de pertenencia son las de siempre, no una segunda copia.
//
// El armado del CSV se hace AQUÍ y no en el navegador a propósito: el escape
// de comillas y comas tiene que vivir junto a quien lo lee (`splitCsvLine`),
// o un plato llamado «Arroz, pollo y "especial"» volvería partido en dos.
//
// LAS VARIANTES NO ABREN UN CAMINO NUEVO. Un plato con tamaños es UN producto
// al precio del más barato —o sea una fila más del mismo CSV— y después sus
// opciones por `setProductOptions`, que es la ruta que ya usa el portal. Lo
// único propio es enlazar las dos cosas, y para eso `applyProductImport`
// devuelve los ids de lo que creó.
router.post('/:token/products/carta-importar', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { filas, variantes, adicionales, guarniciones, notas } = req.body as {
    filas?: Array<{ nombre?: unknown; precio?: unknown; seccion?: unknown; descripcion?: unknown; rol?: unknown }>;
    variantes?: Array<{
      nombre?: unknown; seccion?: unknown; precioBase?: unknown; grupo?: unknown; rol?: unknown;
      descripcion?: unknown;
      opciones?: Array<{ nombre?: unknown; precioDelta?: unknown }>;
    }>;
    /** A qué secciones de platos va cada grupo de adicionales. */
    adicionales?: Array<{ grupo?: unknown; aplicarA?: unknown }>;
    /** A qué secciones va cada grupo de guarniciones, y cuántas se escogen. */
    guarniciones?: Array<{ grupo?: unknown; aplicarA?: unknown; elige?: unknown }>;
    /** «Acompañado de papa a la francesa»: a la descripción de esos platos. */
    notas?: Array<{ texto?: unknown; seccion?: unknown; aplicarA?: unknown }>;
  };
  const sueltas = Array.isArray(filas) ? filas : [];
  const grupos = Array.isArray(variantes) ? variantes : [];
  if (sueltas.length === 0 && grupos.length === 0) {
    res.status(400).json({ success: false, error: 'No hay filas para crear.' });
    return;
  }

  // Se sanea ANTES de tocar nada: una variante a medias crearía el producto y
  // se quedaría sin sus tamaños, que es peor que no crearlo (el cliente vería
  // la picada a 39.000 sin poder elegir, y el dueño no sabría por qué).
  const limpias = grupos.map((v) => ({
    nombre: typeof v.nombre === 'string' ? v.nombre.trim() : '',
    descripcion: typeof v.descripcion === 'string' ? limpiarTextoDeCarta(v.descripcion).slice(0, 500).trim() : '',
    seccion: typeof v.seccion === 'string' ? v.seccion.trim() : '',
    precioBase: typeof v.precioBase === 'number' ? Math.round(v.precioBase) : 0,
    grupo: typeof v.grupo === 'string' && v.grupo.trim() ? v.grupo.trim() : GRUPO_TAMANO,
    // Un adicional no forma tamaños: lo que llegue así se trata como plato.
    rol: sanearRol(v.rol) === 'acompanamiento' ? 'acompanamiento' as const : 'plato' as const,
    opciones: (Array.isArray(v.opciones) ? v.opciones : []).map((o) => ({
      nombre: typeof o.nombre === 'string' ? o.nombre.trim() : '',
      precioDelta: typeof o.precioDelta === 'number' ? Math.round(o.precioDelta) : -1,
    })),
  }));
  for (const v of limpias) {
    const motivo = motivoParaNoAgrupar(v);
    if (motivo) {
      res.status(400).json({ success: false, error: `«${v.nombre || 'Sin nombre'}»: ${motivo}` });
      return;
    }
  }

  const base = sueltas.map((f) => ({
    nombre: typeof f.nombre === 'string' ? f.nombre : '',
    precio: typeof f.precio === 'number' ? f.precio : null,
    seccion: typeof f.seccion === 'string' ? f.seccion : '',
    descripcion: typeof f.descripcion === 'string' ? f.descripcion : '',
    rol: sanearRol(f.rol),
  }));
  // Los adicionales y las guarniciones NO van al CSV de productos: se montan
  // como grupos de la biblioteca y se adjuntan a los platos. Ver `carta-rol.ts`.
  const productos = base.filter((f) => f.rol !== 'adicional' && f.rol !== 'guarnicion');
  const { grupos: gruposAdicionales } = agruparAdicionales(base);
  const gruposGuarnicion = agruparGuarniciones(base);

  // Cada grupo de adicionales se valida con la MISMA regla que la biblioteca,
  // y también antes de escribir: un grupo inválido descubierto después dejaría
  // los platos creados sin sus adicionales.
  const destinos = new Map<string, string[]>();
  for (const a of Array.isArray(adicionales) ? adicionales : []) {
    if (typeof a.grupo !== 'string') continue;
    const secciones = Array.isArray(a.aplicarA)
      ? a.aplicarA.filter((x): x is string => typeof x === 'string')
      : [];
    destinos.set(a.grupo.trim().toLowerCase(), secciones);
  }
  // Sin decir a dónde, un grupo va a TODOS los platos de esta carta: es lo que
  // significa una sección «ADICIONALES» al pie de la carta.
  const seccionesDePlatos = [
    ...new Set([
      ...productos.filter((f) => f.rol === 'plato').map((f) => f.seccion),
      ...limpias.filter((v) => v.rol === 'plato').map((v) => v.seccion),
    ]),
  ];
  // Las secciones con algo que se vende. Una guarnición puede ir también en
  // una bebida («Jugo natural · elige tu sabor»), así que aquí cuentan todos
  // los productos, no solo los platos.
  const seccionesConProductos = [
    ...new Set([...productos.map((f) => f.seccion), ...limpias.map((v) => v.seccion)].map((x) => x.trim())),
  ];
  const destinosGuarnicion = new Map<string, { aplicarA?: string[]; elige: number }>();
  for (const a of Array.isArray(guarniciones) ? guarniciones : []) {
    if (typeof a.grupo !== 'string') continue;
    destinosGuarnicion.set(a.grupo.trim().toLowerCase(), {
      ...(Array.isArray(a.aplicarA)
        ? { aplicarA: a.aplicarA.filter((x): x is string => typeof x === 'string') }
        : {}),
      elige: typeof a.elige === 'number' && Number.isFinite(a.elige) ? Math.trunc(a.elige) : 1,
    });
  }
  const guarnicionesListas = [];
  for (const g of gruposGuarnicion) {
    const pedido = destinosGuarnicion.get(g.nombre.trim().toLowerCase());
    // OBLIGATORIO y «elige 1»: es lo que dice «escoge tu acompañamiento». Con
    // la misma regla de la biblioteca, que corrige un «elige 5» de tres
    // opciones en vez de dejar el plato imposible de pedir.
    const r = saneaGrupo({
      name: g.nombre,
      required: true,
      minSelect: 1,
      maxSelect: pedido?.elige ?? 1,
      options: g.opciones.map((o) => ({ name: o.nombre, priceDelta: o.precio })),
    });
    if ('error' in r) {
      res.status(400).json({ success: false, error: r.error });
      return;
    }
    guarnicionesListas.push({
      nombre: g.nombre,
      opciones: g.opciones,
      required: true as const,
      minSelect: r.grupo.minSelect,
      maxSelect: r.grupo.maxSelect,
      aplicarA: pedido?.aplicarA ?? destinoPorDefecto(g.secciones, seccionesConProductos),
    });
  }

  // Las notas van a la DESCRIPCIÓN de los platos, antes de escribir el CSV:
  // así entran por el mismo importador y no hace falta otra escritura.
  const notasListas = (Array.isArray(notas) ? notas : [])
    .map((n) => ({
      texto: typeof n.texto === 'string' ? limpiarTextoDeCarta(n.texto).slice(0, 300).trim() : '',
      seccion: typeof n.seccion === 'string' ? n.seccion.trim() : '',
      aplicarA: Array.isArray(n.aplicarA)
        ? n.aplicarA.filter((x): x is string => typeof x === 'string').map((x) => x.trim())
        : undefined,
    }))
    .filter((n) => n.texto.length >= 3);
  const notaDe = (seccion: string): string => {
    const s = seccion.trim();
    return notasListas
      .filter((n) => (n.aplicarA ?? destinoPorDefecto([n.seccion], seccionesDePlatos)).includes(s))
      .map((n) => n.texto)
      .join('. ');
  };
  const conNota = (descripcion: string, seccion: string): string => {
    const nota = notaDe(seccion);
    if (!nota) return descripcion;
    // Volver a subir la misma carta no le pega la nota dos veces.
    if (descripcion.toLowerCase().includes(nota.toLowerCase())) return descripcion;
    return (descripcion ? `${descripcion.replace(/[.\s]+$/, '')}. ${nota}` : nota).slice(0, 500);
  };

  const gruposListos = [];
  for (const g of gruposAdicionales) {
    const r = saneaGrupo({
      name: g.nombre,
      required: false,
      minSelect: 0,
      maxSelect: g.opciones.length,
      options: g.opciones.map((o) => ({ name: o.nombre, priceDelta: o.precio })),
    });
    if ('error' in r) {
      res.status(400).json({ success: false, error: r.error });
      return;
    }
    gruposListos.push({
      ...g,
      aplicarA: destinos.get(g.nombre.trim().toLowerCase()) ?? seccionesDePlatos,
    });
  }

  try {
    const business = await getBusinessService().getBusinessByToken(token);

    // Las variantes van al FINAL del CSV y en orden, así que su número de
    // línea es conocido y con él se recupera el id del producto creado.
    const csv = filasACsv([
      ...productos.map((f) => (f.rol === 'plato' ? { ...f, descripcion: conNota(f.descripcion, f.seccion) } : f)),
      ...limpias.map((v) => ({
        nombre: v.nombre,
        precio: v.precioBase,
        seccion: v.seccion,
        descripcion: v.rol === 'plato' ? conNota(v.descripcion, v.seccion) : v.descripcion,
      })),
    ]);

    const indice = await getBarcodeIndexForBusiness(business.id);
    const preview = parseProductCsv(csv, indice);
    const resultado = await applyProductImport(business.id, preview.nuevos, preview.actualizaciones);
    const idDeLinea = (lineaCsv: number): string | undefined => {
      const pos = preview.nuevos.findIndex((n) => n.linea === lineaCsv);
      return pos === -1 ? undefined : resultado.idsNuevos[pos];
    };

    // `filasACsv` se salta las filas sin precio, así que la numeración del CSV
    // no es la del array: se cuenta en el mismo orden en que se escribieron.
    const acompanamientoIds: string[] = [];
    const platos: Array<{ id: string; seccion: string }> = [];
    const todos: Array<{ id: string; seccion: string }> = [];
    let lineaCsv = 0;
    for (const f of productos) {
      if (f.precio == null || !(f.precio > 0)) continue;
      lineaCsv++;
      const id = idDeLinea(lineaCsv);
      if (!id) continue;
      todos.push({ id, seccion: f.seccion });
      if (f.rol === 'acompanamiento') acompanamientoIds.push(id);
      else platos.push({ id, seccion: f.seccion });
    }

    let conTamanos = 0;
    for (const v of limpias) {
      lineaCsv++;
      const productId = idDeLinea(lineaCsv);
      // Sin id es que la fila base no se creó (la rechazó el importador). No
      // se inventa un producto para colgarle las opciones: se cuenta como
      // omitida y el dueño ve que faltó.
      if (!productId) continue;
      await setProductOptions(business.id, productId, {
        groups: [{
          name: v.grupo,
          required: true,
          minSelect: 1,
          maxSelect: 1,
          options: v.opciones.map((o) => ({ name: o.nombre, priceDelta: o.precioDelta })),
        }],
      });
      conTamanos++;
      todos.push({ id: productId, seccion: v.seccion });
      if (v.rol === 'acompanamiento') acompanamientoIds.push(productId);
      else platos.push({ id: productId, seccion: v.seccion });
    }

    const roles = await aplicarRolesDeCarta(business.id, {
      acompanamientoIds,
      platos,
      grupos: gruposListos,
      productos: todos,
      guarniciones: guarnicionesListas,
    });

    res.status(200).json({
      success: true,
      data: {
        creados: resultado.creados,
        actualizados: resultado.actualizados,
        conTamanos,
        omitidos: preview.errores.length,
        acompanamientos: roles.acompanamientos,
        gruposAdicionales: roles.grupos,
        adicionalesNuevos: roles.opcionesNuevas,
        platosConAdicionales: roles.platosConAdicionales,
        gruposGuarnicion: roles.gruposGuarnicion,
        platosConGuarnicion: roles.platosConGuarnicion,
        notas: notasListas.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear el catálogo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── Biblioteca de adiciones del negocio ─────────────────────────────────────
//
// Los grupos («Adicionales», «Tamaño») viven en el NEGOCIO y los platos los
// adjuntan, así que el precio del aguacate está en un solo sitio. Antes cada
// grupo colgaba de un plato: once adiciones en doce arepas eran 132 filas a
// mano y doce sitios que tocar al subir un precio.

router.get('/:token/option-groups', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({ success: true, data: await listOptionGroups(business.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron cargar las adiciones';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST crea; POST /:groupId actualiza. Devuelven la biblioteca entera, para
// que el portal no tenga que recargarla aparte.
router.post('/:token/option-groups/:groupId?', async (req: Request, res: Response): Promise<void> => {
  const { token, groupId } = req.params as { token: string; groupId?: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await upsertOptionGroup(
      business.id,
      groupId,
      req.body as SetProductOptionsDTO['groups'][number],
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo guardar el grupo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.delete('/:token/option-groups/:groupId', async (req: Request, res: Response): Promise<void> => {
  const { token, groupId } = req.params as { token: string; groupId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.status(200).json({ success: true, data: await deleteOptionGroup(business.id, groupId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar el grupo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// La acción que ahorra la tarde: el grupo a TODOS los platos de una sección.
router.post('/:token/option-groups/:groupId/aplicar', async (req: Request, res: Response): Promise<void> => {
  const { token, groupId } = req.params as { token: string; groupId: string };
  const { categoria } = req.body as { categoria?: unknown };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await applyOptionGroupToCategory(
      business.id,
      groupId,
      typeof categoria === 'string' ? categoria : '',
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo aplicar el grupo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// Reemplaza TODAS las variantes/opciones del producto (el portal guarda todo).
router.put('/:token/products/:productId/options', async (req: Request, res: Response): Promise<void> => {
  const { token, productId } = req.params as { token: string; productId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await setProductOptions(business.id, productId, req.body as SetProductOptionsDTO);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudieron guardar las opciones';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// Agrega una foto a la GALERÍA del producto (además de la portada). Multipart 'file'.
router.post(
  '/:token/products/:productId/gallery',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token, productId } = req.params as { token: string; productId: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const product = await addProductPhoto(business.id, productId, fileToUrl(req.file));
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la foto';
      const notFound = message.includes('not found') || message.includes('no encontrado');
      res.status(notFound ? 404 : 400).json({ success: false, error: message });
    }
  },
);

// Elimina una foto de la galería del producto.
router.delete('/:token/products/:productId/gallery/:photoId', async (req: Request, res: Response): Promise<void> => {
  const { token, productId, photoId } = req.params as { token: string; productId: string; photoId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const product = await deleteProductPhoto(business.id, productId, photoId);
    res.status(200).json({ success: true, data: product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo eliminar la foto';
    const notFound = message.includes('not found') || message.includes('no encontrado');
    res.status(notFound ? 404 : 400).json({ success: false, error: message });
  }
});

// ─── La identidad del local en su carta del QR ───────────────────────────────
//
// En un menú QR el comensal está SENTADO en el restaurante: la marca que manda
// ahí es la del local. Sin esto, los veinte locales de la plaza tienen una
// carta idéntica y se lee como una plantilla.

/** Multipart de una sola imagen, con el guard de tipo que ya usa la portada. */
function unaImagen(queEs: string) {
  return [
    (req: Request, res: Response, next: () => void) => {
      documentUpload.single('file')(req, res, (err) => {
        if (err) { res.status(400).json({ success: false, error: err.message }); return; }
        next();
      });
    },
    (req: Request, res: Response, next: () => void) => {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
        return;
      }
      if (!req.file.mimetype.startsWith('image/')) {
        res.status(400).json({
          success: false,
          error: `${queEs} debe ser una imagen (JPG, PNG o WebP).`,
        });
        return;
      }
      next();
    },
  ];
}

// POST /business/:token/logo — el logo del local (multipart 'file').
router.post('/:token/logo', ...unaImagen('El logo'), async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await updateBusinessLogo(business.id, fileToUrl(req.file!));
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo subir el logo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// DELETE /business/:token/logo — quitarlo y volver a la inicial del local.
router.delete('/:token/logo', async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.json({ success: true, data: await updateBusinessLogo(business.id, null) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo quitar el logo';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /business/:token/fotos — una foto del LOCAL (el salón, la parrilla).
router.post('/:token/fotos', ...unaImagen('La foto'), async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await addFotoDelLocal(business.id, fileToUrl(req.file!));
    res.status(201).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo subir la foto';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// DELETE /business/:token/fotos { url }
router.delete('/:token/fotos', async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  const url = String((req.body as { url?: unknown } | undefined)?.url ?? '');
  if (!url) {
    res.status(400).json({ success: false, error: 'Falta la foto que se quiere quitar.' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    res.json({ success: true, data: await quitarFotoDelLocal(business.id, url) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo quitar la foto';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// PUT /business/:token/marca { brandColor?, tagline? }
router.put('/:token/marca', async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  const body = (req.body ?? {}) as { brandColor?: unknown; tagline?: unknown };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const data = await updateMarcaDelLocal(business.id, {
      ...(body.brandColor !== undefined ? { brandColor: String(body.brandColor ?? '') || null } : {}),
      ...(body.tagline !== undefined ? { tagline: String(body.tagline ?? '') } : {}),
    });
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo guardar la marca';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// Sube la foto de portada del local (multipart 'file') y devuelve el negocio.
router.post(
  '/:token/cover',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params as { token: string };
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La portada debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const updated = await updateBusinessCover(business.id, fileToUrl(req.file));
      res.status(201).json({
        success: true,
        data: { name: updated.name, token, imageUrl: updated.imageUrl },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la portada';
      res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
    }
  },
);

export default router;

// ─── Lo que ZIPA le debe al negocio y los giros que le ha hecho ──────────────
//
// Existe desde que la plataforma puede recaudar: si cobramos nosotros, le
// debemos al negocio. Esta es la pantalla donde el dueño lo ve, que es la
// mitad que vuelve aceptable que le toquemos la plata.

router.get('/:token/giros', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const b = { businessId: business.id };
    const [saldo, pendientes, giros] = await Promise.all([
      saldoDelAliado(b),
      creditosPendientes(b),
      girosDelAliado(b),
    ]);
    res.json({ success: true, data: { saldo, pendientes, giros } });
  } catch (err) {
    res.status(err instanceof GiroError ? 400 : 404).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos cargar tus giros',
    });
  }
});

// GET  /business/:token/products/separar-nombres   → qué se partiría
// POST /business/:token/products/separar-nombres   { productIds: [...] }
//
// Los catálogos que se subieron antes de que el lector supiera separar tienen
// el plato y sus ingredientes en el mismo campo («Hamburguesa Camarón
// (Croqueta de carne, cebolla…)»). Esto lo arregla, pero PROPONIENDO: son
// nombres de platos de un negocio real y la regla puede equivocarse en un
// renglón raro, así que el dueño ve antes y después y marca cuáles aplica.
router.get(
  '/:token/products/separar-nombres',
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params as { token: string };
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const propuestas = await proponerSeparacionDeNombres(business.id);
      res.json({ success: true, data: { propuestas } });
    } catch (err) {
      res.status(404).json({
        success: false,
        error: err instanceof Error ? err.message : 'Negocio no encontrado',
      });
    }
  },
);

router.post(
  '/:token/products/separar-nombres',
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params as { token: string };
    const { productIds } = req.body as { productIds?: unknown };
    const ids = Array.isArray(productIds)
      ? productIds.filter((x): x is string => typeof x === 'string')
      : [];
    if (ids.length === 0) {
      res.status(400).json({ success: false, error: 'No marcaste ningún plato.' });
      return;
    }
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const r = await aplicarSeparacionDeNombres(business.id, ids);
      res.json({ success: true, data: r });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : 'No pudimos separar los nombres',
      });
    }
  },
);

// GET  /business/:token/cocina            → qué hay que cocinar ahora
// POST /business/:token/cocina/:orderId   { listo: boolean }
//
// El tablero de la tablet de la cocina. Mesa y domicilio van JUNTOS: para
// cocinar da igual el destino, y dos listas obligarían al cocinero a decidir
// él el orden. El portal del dueño los sigue llevando aparte, que para él sí
// son dos negocios distintos.
router.get('/:token/cocina', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const { pedidos, platos } = await pedidosEnCocina(business.id);
    res.json({
      success: true,
      data: { business: { name: business.name, token }, pedidos, platos },
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Negocio no encontrado',
    });
  }
});

// Deshacer el «listo». Marcar lo hace `/client-orders/:id/ready`, que ya
// existe y además avisa al repartidor y al cliente; aquí solo está la vuelta
// atrás, que esa ruta no permite — y en una cocina el botón se toca con prisa.
router.delete('/:token/cocina/:orderId/listo', async (req: Request, res: Response): Promise<void> => {
  const { token, orderId } = req.params as { token: string; orderId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    await deshacerPlatoListo(business.id, orderId);
    res.json({ success: true, data: { readyAt: null } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos deshacerlo',
    });
  }
});

// ── Las cuentas de las mesas ───────────────────────────────────────────────
//
// GET    /business/:token/cuentas            → las mesas con cuenta abierta
// GET    /business/:token/cuentas/:tabId     → una cuenta, para imprimirla
// POST   /business/:token/cuentas/:tabId/cerrar   { paymentMethod?, closedBy? }
// POST   /business/:token/cuentas/:tabId/reabrir
//
// La cuenta se ABRE sola con la primera ronda que pide la mesa; no hay ruta
// para abrirla porque no hay nada que decidir.
router.get('/:token/cuentas', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const cuentas = await cuentasAbiertas(business.id);
    res.json({ success: true, data: { cuentas } });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Negocio no encontrado',
    });
  }
});

router.get('/:token/cuentas/:tabId', async (req: Request, res: Response): Promise<void> => {
  const { token, tabId } = req.params as { token: string; tabId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const cuenta = await getCuenta(business.id, tabId);
    if (!cuenta) {
      res.status(404).json({ success: false, error: 'No encontramos esa cuenta.' });
      return;
    }
    res.json({ success: true, data: { cuenta, business: { name: business.name, token } } });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Negocio no encontrado',
    });
  }
});

router.post('/:token/cuentas/:tabId/cerrar', async (req: Request, res: Response): Promise<void> => {
  const { token, tabId } = req.params as { token: string; tabId: string };
  const { paymentMethod, closedBy } = req.body as {
    paymentMethod?: unknown; closedBy?: unknown;
  };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const cuenta = await cerrarCuenta(business.id, tabId, {
      ...(typeof paymentMethod === 'string' ? { paymentMethod } : {}),
      ...(typeof closedBy === 'string' ? { closedBy } : {}),
    });
    res.json({ success: true, data: { cuenta } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos cerrar la cuenta',
    });
  }
});

router.post('/:token/cuentas/:tabId/reabrir', async (req: Request, res: Response): Promise<void> => {
  const { token, tabId } = req.params as { token: string; tabId: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const { quien } = req.body as { quien?: unknown };
    const cuenta = await reabrirCuenta(
      business.id, tabId, typeof quien === 'string' ? quien : undefined,
    );
    res.json({ success: true, data: { cuenta } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos reabrir la cuenta',
    });
  }
});

// POST /business/:token/cuentas/ronda/:orderId/cancelar  { motivo? }
//
// El plato se cayó, el cliente se arrepintió, el mesero marcó la mesa
// equivocada. Hasta ahora NO había forma de deshacerlo y el único camino era
// cobrar algo que nadie consumió. El total de la cuenta baja solo —se deriva
// de las rondas— y el aviso sale por el socket, así que la cancelación llega
// al instante al portal, a la cocina y a la pantalla de mesas.
router.post(
  '/:token/cuentas/ronda/:orderId/cancelar',
  async (req: Request, res: Response): Promise<void> => {
    const { token, orderId } = req.params as { token: string; orderId: string };
    const { motivo } = req.body as { motivo?: unknown };
    try {
      const business = await getBusinessService().getBusinessByToken(token);
      const cuenta = await cancelarRondaDeMesa(
        business.id, orderId, typeof motivo === 'string' ? motivo : undefined,
      );
      res.json({ success: true, data: { cuenta } });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : 'No pudimos cancelar la ronda',
      });
    }
  },
);

// GET /business/:token/cuentas/reabiertas
//
// Las cuentas del día que alguien volvió a abrir después de cobrarlas. Es la
// contrapartida de que reabrir exista: el dueño tiene que poder verlas sin
// buscarlas, o la red de seguridad se convierte en un agujero.
router.get('/:token/cuentas-reabiertas', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const cuentas = await cuentasReabiertasHoy(business.id);
    res.json({ success: true, data: { cuentas } });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Negocio no encontrado',
    });
  }
});

// ── La caja del turno ──────────────────────────────────────────────────────
//
// GET  /business/:token/caja          → la caja abierta (o null) y las del día
// POST /business/:token/caja/abrir    { openingFloat?, openedBy? }
// POST /business/:token/caja/cerrar   { countedCash, closedBy?, notes? }
router.get('/:token/caja', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const [abierta, delDia] = await Promise.all([
      cajaAbierta(business.id),
      cajasDelDia(business.id),
    ]);
    res.json({ success: true, data: { abierta, delDia } });
  } catch (err) {
    res.status(404).json({
      success: false,
      error: err instanceof Error ? err.message : 'Negocio no encontrado',
    });
  }
});

router.post('/:token/caja/abrir', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { openingFloat, openedBy } = req.body as { openingFloat?: unknown; openedBy?: unknown };
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const caja = await abrirCaja(business.id, {
      ...(typeof openingFloat === 'number' ? { openingFloat } : {}),
      ...(typeof openedBy === 'string' ? { openedBy } : {}),
    });
    res.json({ success: true, data: { caja } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos abrir la caja',
    });
  }
});

router.post('/:token/caja/cerrar', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params as { token: string };
  const { countedCash, closedBy, notes } = req.body as {
    countedCash?: unknown; closedBy?: unknown; notes?: unknown;
  };
  if (typeof countedCash !== 'number') {
    // Sin contar no hay arqueo: cerrar «a ojo» daría una diferencia
    // inventada, que es peor que no tener la función.
    res.status(400).json({ success: false, error: 'Cuenta el efectivo del cajón antes de cerrar.' });
    return;
  }
  try {
    const business = await getBusinessService().getBusinessByToken(token);
    const caja = await cerrarCaja(business.id, {
      countedCash,
      ...(typeof closedBy === 'string' ? { closedBy } : {}),
      ...(typeof notes === 'string' ? { notes } : {}),
    });
    res.json({ success: true, data: { caja } });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos cerrar la caja',
    });
  }
});
