import { Router, Request, Response } from 'express';
import { DocumentStatus, PayoutStatus } from '@prisma/client';
import {
  requireAdmin,
  isAdminPhone,
  getAdminPhones,
  signAdminToken,
} from '../middleware/admin.middleware';
import {
  listDocumentsForAdmin,
  adminReviewDocument,
} from '../services/driver-profile.service';
import {
  requestAdminOtp,
  validateAdminOtp,
  OtpRateLimitError,
  OtpConfigError,
} from '../services/otp.service';
import {
  getAdminMetrics,
  listDriversForAdmin,
  listSosForAdmin,
  listOperatorsForAdmin,
  setOperatorStatus,
  listOperatorRoutesForAdmin,
  setOperatorRouteAuthorized,
  setDriverVerified,
  releaseDriver,
  diagnoseMatching,
  listClientsForKyc,
} from '../services/admin.service';
import { setClientKycStatus, ClientKycError } from '../services/client-kyc.service';
import { OperatorStatus } from '@prisma/client';
import { setDriverKycStatus, KycError } from '../services/kyc.service';
import {
  listAllTickets,
  getTicketForAdmin,
  adminReply,
  setTicketStatus,
  SupportError,
} from '../services/support.service';
import { SupportStatus } from '@prisma/client';
import { adminCreatePromo, adminListPromos, adminTogglePromo, PromoError } from '../services/promo.service';
import { listPayoutsForAdmin, adminUpdatePayout } from '../services/payout.service';

const router = Router();

// ─── Auth del panel (OTP → JWT de admin) ─────────────────────────────────────

// POST /admin/auth/send-otp { phone } — solo teléfonos en ADMIN_PHONES.
router.post('/auth/send-otp', async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone es requerido' });
    return;
  }
  if (getAdminPhones().size === 0) {
    res.status(503).json({ success: false, error: 'Panel no configurado (ADMIN_PHONES vacío).' });
    return;
  }
  // Mismo mensaje para no-admin que para éxito: no revelar la lista blanca.
  if (!isAdminPhone(phone)) {
    res.json({ success: true, data: { success: true } });
    return;
  }
  try {
    await requestAdminOtp(phone.trim());
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const status =
      err instanceof OtpRateLimitError ? 429 :
      err instanceof OtpConfigError ? 503 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/auth/verify-otp { phone, otp } → { token }
router.post('/auth/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'phone y otp son requeridos' });
    return;
  }
  if (!isAdminPhone(phone)) {
    res.status(401).json({ success: false, error: 'Código inválido' });
    return;
  }
  try {
    await validateAdminOtp(phone.trim(), otp.trim());
    res.json({ success: true, data: { token: signAdminToken(phone.trim()) } });
  } catch (err) {
    // Mensaje específico (rate limit / panel cerrado / inválido): con el panel
    // en producción y sin acceso a los logs, el texto exacto ES el diagnóstico.
    const status =
      err instanceof OtpRateLimitError ? 429 :
      err instanceof OtpConfigError ? 503 : 401;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'Código inválido',
    });
  }
});

// ─── API del panel (requiere JWT de admin) ───────────────────────────────────

router.use(['/verifications', '/metrics', '/drivers', '/clients', '/sos', '/promos', '/payouts', '/operators', '/routes', '/matching', '/support'], requireAdmin);

// GET /admin/matching/diagnose?lat=&lng= — radiografía del despacho urbano:
// por conductor, qué filtro del matching pasa/falla contra ese punto de recogida.
router.get('/matching/diagnose', async (req: Request, res: Response): Promise<void> => {
  const lat = Number(req.query['lat'] ?? 7.3754);
  const lng = Number(req.query['lng'] ?? -72.6486);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ success: false, error: 'lat/lng inválidos' });
    return;
  }
  try {
    const drivers = await diagnoseMatching(lat, lng);
    res.json({
      success: true,
      data: { lat, lng, radiusMeters: 5000, freshnessSeconds: 120, drivers },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /admin/metrics
router.get('/metrics', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await getAdminMetrics() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /admin/drivers
router.get('/drivers', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listDriversForAdmin() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/drivers/:id/verify · /:id/unverify — atajo de piloto.
router.post('/drivers/:id/verify', async (req: Request, res: Response): Promise<void> => {
  const ok = await setDriverVerified(req.params['id']!, true);
  if (!ok) { res.status(404).json({ success: false, error: 'Conductor no encontrado' }); return; }
  res.json({ success: true });
});

router.post('/drivers/:id/unverify', async (req: Request, res: Response): Promise<void> => {
  const ok = await setDriverVerified(req.params['id']!, false);
  if (!ok) { res.status(404).json({ success: false, error: 'Conductor no encontrado' }); return; }
  res.json({ success: true });
});

// POST /admin/drivers/:id/release — des-atasca al conductor (cancela su viaje
// activo y lo devuelve a ONLINE). Libera también al cliente colgado.
router.post('/drivers/:id/release', async (req: Request, res: Response): Promise<void> => {
  const result = await releaseDriver(req.params['id']!);
  if (!result.ok) { res.status(404).json({ success: false, error: 'Conductor no encontrado' }); return; }
  res.json({ success: true, data: result });
});

// POST /admin/drivers/:id/kyc { status: 'VERIFIED'|'REJECTED'|'IN_REVIEW', reference? }
// Decisión manual de identidad del conductor (revisión de selfie + documento).
const KYC_DECISIONS = new Set(['VERIFIED', 'REJECTED', 'IN_REVIEW']);
router.post('/drivers/:id/kyc', async (req: Request, res: Response): Promise<void> => {
  const { status, reference } = req.body as { status?: string; reference?: string };
  if (!status || !KYC_DECISIONS.has(status)) {
    res.status(400).json({ success: false, error: 'status debe ser VERIFIED, REJECTED o IN_REVIEW' });
    return;
  }
  try {
    const data = await setDriverKycStatus(
      req.params['id']!,
      status as 'VERIFIED' | 'REJECTED' | 'IN_REVIEW',
      reference,
    );
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof KycError) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Soporte con tickets ────────────────────────────────────────────────────────

const SUPPORT_STATUSES = new Set<string>(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);

// GET /admin/support?status=OPEN — lista de tickets.
router.get('/support', async (req: Request, res: Response): Promise<void> => {
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  try {
    const filter = status && SUPPORT_STATUSES.has(status) ? (status as SupportStatus) : undefined;
    res.json({ success: true, data: await listAllTickets(filter) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /admin/support/:id — detalle con mensajes.
router.get('/support/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await getTicketForAdmin(req.params['id']!) });
  } catch (err) {
    const status = err instanceof SupportError ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/support/:id/reply { body } — responde el ticket.
router.post('/support/:id/reply', async (req: Request, res: Response): Promise<void> => {
  const { body } = req.body as { body?: string };
  if (!body) { res.status(400).json({ success: false, error: 'body es requerido' }); return; }
  try {
    res.json({ success: true, data: await adminReply(req.params['id']!, body) });
  } catch (err) {
    const status = err instanceof SupportError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/support/:id/status { status } — cambia el estado.
router.post('/support/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (!status || !SUPPORT_STATUSES.has(status)) {
    res.status(400).json({ success: false, error: 'status inválido' }); return;
  }
  try {
    res.json({ success: true, data: await setTicketStatus(req.params['id']!, status as SupportStatus) });
  } catch (err) {
    const st = err instanceof SupportError ? 404 : 500;
    res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Verificación de identidad de clientes (KYC pasajero) ─────────────────────

// GET /admin/clients — clientes que iniciaron verificación.
router.get('/clients', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listClientsForKyc() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/clients/:id/kyc { status } — decisión manual de identidad del cliente.
router.post('/clients/:id/kyc', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (!status || !KYC_DECISIONS.has(status)) {
    res.status(400).json({ success: false, error: 'status debe ser VERIFIED, REJECTED o IN_REVIEW' });
    return;
  }
  try {
    const data = await setClientKycStatus(req.params['id']!, status as 'VERIFIED' | 'REJECTED' | 'IN_REVIEW');
    res.json({ success: true, data });
  } catch (err) {
    const st = err instanceof ClientKycError ? 404 : 500;
    res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Empresas de transporte (operadores) ──────────────────────────────────────

const OPERATOR_STATUSES = new Set<string>(['PENDING', 'ACTIVE', 'SUSPENDED']);

// GET /admin/operators?status=PENDING|ACTIVE|SUSPENDED
router.get('/operators', async (req: Request, res: Response): Promise<void> => {
  const raw = (req.query['status'] as string | undefined)?.toUpperCase();
  const status = raw && OPERATOR_STATUSES.has(raw) ? (raw as OperatorStatus) : undefined;
  try {
    res.json({ success: true, data: await listOperatorsForAdmin(status) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/operators/:id/verify — aprueba la habilitación (ACTIVE + verificada).
router.post('/operators/:id/verify', async (req: Request, res: Response): Promise<void> => {
  const ok = await setOperatorStatus(req.params['id']!, 'ACTIVE');
  if (!ok) { res.status(404).json({ success: false, error: 'Empresa no encontrada' }); return; }
  res.json({ success: true });
});

// POST /admin/operators/:id/suspend
router.post('/operators/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  const ok = await setOperatorStatus(req.params['id']!, 'SUSPENDED');
  if (!ok) { res.status(404).json({ success: false, error: 'Empresa no encontrada' }); return; }
  res.json({ success: true });
});

// GET /admin/operators/:id/routes — rutas troncales declaradas por la empresa.
router.get('/operators/:id/routes', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorRoutesForAdmin(req.params['id']!) });
});

// POST /admin/routes/:id/authorize · /admin/routes/:id/revoke
router.post('/routes/:id/authorize', async (req: Request, res: Response): Promise<void> => {
  const ok = await setOperatorRouteAuthorized(req.params['id']!, true);
  if (!ok) { res.status(404).json({ success: false, error: 'Ruta no encontrada' }); return; }
  res.json({ success: true });
});

router.post('/routes/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const ok = await setOperatorRouteAuthorized(req.params['id']!, false);
  if (!ok) { res.status(404).json({ success: false, error: 'Ruta no encontrada' }); return; }
  res.json({ success: true });
});

// GET /admin/sos
router.get('/sos', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listSosForAdmin() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /admin/promos · POST /admin/promos · POST /admin/promos/:id/toggle
router.get('/promos', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await adminListPromos() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post('/promos', async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (typeof b['code'] !== 'string' || typeof b['value'] !== 'number'
      || (b['type'] !== 'PERCENT' && b['type'] !== 'FIXED')) {
    res.status(400).json({ success: false, error: 'code, type (PERCENT|FIXED) y value son requeridos' });
    return;
  }
  try {
    const promo = await adminCreatePromo({
      code: b['code'],
      description: typeof b['description'] === 'string' ? b['description'] : undefined,
      type: b['type'],
      value: b['value'],
      scope: b['scope'] === 'TRIPS' || b['scope'] === 'ORDERS' ? b['scope'] : 'ALL',
      minAmount: typeof b['minAmount'] === 'number' ? b['minAmount'] : undefined,
      maxDiscount: typeof b['maxDiscount'] === 'number' ? b['maxDiscount'] : undefined,
      maxRedemptions: typeof b['maxRedemptions'] === 'number' ? b['maxRedemptions'] : undefined,
      perUserLimit: typeof b['perUserLimit'] === 'number' ? b['perUserLimit'] : undefined,
      expiresAt: typeof b['expiresAt'] === 'string' && b['expiresAt'] ? b['expiresAt'] : undefined,
      createdBy: req.adminPhone!,
    });
    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    const status = err instanceof PromoError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post('/promos/:id/toggle', async (req: Request, res: Response): Promise<void> => {
  const { active } = req.body as { active?: boolean };
  try {
    await adminTogglePromo(req.params['id']!, Boolean(active));
    res.json({ success: true });
  } catch {
    res.status(404).json({ success: false, error: 'Promo no encontrada' });
  }
});

// ─── Payouts (retiros) ───────────────────────────────────────────────────────

const PAYOUT_STATUSES = new Set<string>(['REQUESTED', 'PROCESSING', 'PAID', 'REJECTED']);

// GET /admin/payouts?status=REQUESTED|PROCESSING|PAID|REJECTED
router.get('/payouts', async (req: Request, res: Response): Promise<void> => {
  const raw = (req.query['status'] as string | undefined)?.toUpperCase();
  const status = raw && PAYOUT_STATUSES.has(raw) ? (raw as PayoutStatus) : undefined;
  try {
    res.json({ success: true, data: await listPayoutsForAdmin(status) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /admin/payouts/:id { status, reference?, notes? } — actualiza un retiro.
router.post('/payouts/:id', async (req: Request, res: Response): Promise<void> => {
  const b = req.body as { status?: string; reference?: string; notes?: string };
  if (!b.status || !PAYOUT_STATUSES.has(b.status)) {
    res.status(400).json({ success: false, error: 'status válido es requerido (REQUESTED|PROCESSING|PAID|REJECTED)' });
    return;
  }
  try {
    const updated = await adminUpdatePayout(req.params['id']!, b.status as PayoutStatus, {
      processedBy: req.adminPhone!,
      reference: typeof b.reference === 'string' ? b.reference : undefined,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
    });
    if (!updated) { res.status(404).json({ success: false, error: 'Retiro no encontrado' }); return; }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Verificación de documentos (existente) ──────────────────────────────────

// GET /admin/verifications?status=PENDING|APPROVED|REJECTED
router.get('/verifications', async (req: Request, res: Response): Promise<void> => {
  const rawStatus = (req.query['status'] as string | undefined)?.toUpperCase();
  const validStatuses = new Set<string>(['PENDING', 'APPROVED', 'REJECTED']);
  const status = rawStatus && validStatuses.has(rawStatus)
    ? (rawStatus as DocumentStatus)
    : undefined;

  try {
    const docs = await listDocumentsForAdmin(status);
    res.json({ success: true, data: docs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al listar documentos';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /admin/verifications/:docId/approve
router.post('/verifications/:docId/approve', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params as { docId: string };
  try {
    const profile = await adminReviewDocument(docId, true, req.adminPhone!);
    if (!profile) { res.status(404).json({ success: false, error: 'Documento no encontrado' }); return; }
    res.json({ success: true, data: profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al aprobar';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /admin/verifications/:docId/reject
router.post('/verifications/:docId/reject', async (req: Request, res: Response): Promise<void> => {
  const { docId } = req.params as { docId: string };
  const { rejectionReason } = req.body as { rejectionReason?: string };
  try {
    const profile = await adminReviewDocument(docId, false, req.adminPhone!, rejectionReason);
    if (!profile) { res.status(404).json({ success: false, error: 'Documento no encontrado' }); return; }
    res.json({ success: true, data: profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al rechazar';
    res.status(500).json({ success: false, error: message });
  }
});

// ─── HTML del panel ──────────────────────────────────────────────────────────

const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexum — Panel de Operación</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
    header { background: #0f172a; color: #fff; padding: 14px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #059669; }
    header h1 { font-size: 1.1rem; flex: 1; }
    header button { width: auto; background: rgba(255,255,255,.12); padding: 6px 14px; font-size: .8rem; }
    .card { max-width: 360px; margin: 60px auto; background: #fff; padding: 32px; border-radius: 14px; box-shadow: 0 2px 14px rgba(15,23,42,.12); border-top: 4px solid #059669; }
    .card h2 { margin-bottom: 18px; font-size: 1rem; color: #0f172a; }
    input, select { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; font-size: .9rem; margin-bottom: 12px; background:#fff; }
    input:focus, select:focus { outline: 2px solid #05966955; border-color: #059669; }
    button { width: 100%; background: #059669; color: #fff; border: none; border-radius: 8px; padding: 11px; font-size: .92rem; cursor: pointer; font-weight: 600; }
    button:hover { filter: brightness(1.08); }
    #app { display: none; padding: 20px; max-width: 1200px; margin: 0 auto; }
    nav.tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
    nav.tabs button { width: auto; padding: 8px 18px; background: #fff; color: #047857; border: 1px solid #cbd5e1; font-size: .85rem; border-radius: 20px; }
    nav.tabs button.active { background: #059669; color: #fff; border-color: #059669; }
    table { width: 100%; background: #fff; border-radius: 10px; border-collapse: collapse; box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow: hidden; }
    th { background: #ecfdf5; color: #047857; padding: 11px 13px; text-align: left; font-size: .76rem; text-transform: uppercase; }
    td { padding: 9px 13px; border-top: 1px solid #f0f0f0; font-size: .87rem; vertical-align: middle; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: .73rem; font-weight: 600; }
    .badge-PENDING { background: #fff8e1; color: #f57f17; }
    .badge-APPROVED, .badge-ONLINE, .badge-ok { background: #e8f5e9; color: #2e7d32; }
    .badge-REJECTED, .badge-PANIC { background: #fce4ec; color: #c62828; }
    .badge-OFFLINE { background: #eceff1; color: #607d8b; }
    .badge-ON_TRIP { background: #d1fae5; color: #047857; }
    .badge-REQUESTED { background: #fff8e1; color: #f57f17; }
    .badge-PROCESSING { background: #d1fae5; color: #047857; }
    .badge-PAID { background: #e8f5e9; color: #2e7d32; }
    .btn-sm { width:auto; padding: 5px 12px; border-radius: 6px; font-size: .78rem; margin-right: 4px; }
    .btn-approve { background: #2e7d32; }
    .btn-reject { background: #c62828; }
    a { color: #047857; }
    #msg { padding: 10px 16px; border-radius: 8px; margin-bottom: 14px; display: none; }
    #msg.ok { background: #e8f5e9; color: #2e7d32; }
    #msg.err { background: #fce4ec; color: #c62828; }
    .empty { padding: 36px; text-align: center; color: #888; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
    .metric .v { font-size: 1.5rem; font-weight: 700; color: #059669; }
    .metric .l { font-size: .75rem; color: #777; margin-top: 4px; }
    form.inline { background:#fff; padding:16px; border-radius:10px; margin-bottom:16px; box-shadow: 0 1px 6px rgba(0,0,0,.08); display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px; align-items:end; }
    form.inline label { font-size:.72rem; color:#666; display:block; margin-bottom:4px; }
    form.inline input, form.inline select { margin-bottom:0; }
  </style>
</head>
<body>

<div id="login" class="card">
  <h2>Panel de operación Nexum</h2>
  <div id="step-phone">
    <input id="phone" type="tel" autocomplete="tel" placeholder="+573001234567" />
    <button onclick="sendOtp()">Enviarme el código</button>
  </div>
  <div id="step-otp" style="display:none">
    <input id="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Código (6 dígitos)" />
    <button onclick="verifyOtp()">Entrar</button>
  </div>
  <p id="login-err" style="color:#c00;font-size:.8rem;margin-top:8px;"></p>
  <p id="diag" style="color:#94a3b8;font-size:.7rem;margin-top:14px;"></p>
</div>

<div id="app">
  <header>
    <span style="font-size:1.4rem">🛡️</span>
    <h1>Nexum — Panel de Operación</h1>
    <button onclick="logout()" style="width:auto">Salir</button>
  </header>
  <div style="padding:18px 0">
    <div id="msg"></div>
    <nav class="tabs">
      <button data-tab="metrics" class="active" onclick="show('metrics')">Métricas</button>
      <button data-tab="docs" onclick="show('docs')">Verificaciones</button>
      <button data-tab="drivers" onclick="show('drivers')">Conductores</button>
      <button data-tab="clients" onclick="show('clients')">Clientes</button>
      <button data-tab="operators" onclick="show('operators')">Empresas</button>
      <button data-tab="sos" onclick="show('sos')">SOS</button>
      <button data-tab="promos" onclick="show('promos')">Promos</button>
      <button data-tab="payouts" onclick="show('payouts')">Retiros</button>
      <button data-tab="support" onclick="show('support')">Soporte</button>
    </nav>

    <section id="tab-metrics"><div class="grid" id="metrics-grid"><div class="empty">Cargando…</div></div></section>

    <section id="tab-docs" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <select id="status-filter" style="width:auto" onchange="loadDocs()">
          <option value="PENDING">Pendientes</option>
          <option value="APPROVED">Aprobados</option>
          <option value="REJECTED">Rechazados</option>
          <option value="">Todos</option>
        </select>
      </div>
      <table><thead><tr><th>Conductor</th><th>Documento</th><th>Archivo</th><th>Estado</th><th>Subido</th><th>Acciones</th></tr></thead>
      <tbody id="docs-body"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-drivers" style="display:none">
      <form class="inline" onsubmit="runDiag(event)">
        <div><label>Lat del punto de recogida</label><input id="diag-lat" value="7.3754" /></div>
        <div><label>Lng</label><input id="diag-lng" value="-72.6486" /></div>
        <div><button type="submit" style="width:auto">Diagnóstico de despacho</button></div>
      </form>
      <div id="diag-wrap" style="display:none;margin-bottom:16px">
        <p style="font-size:.78rem;color:#64748b;margin-bottom:8px">Para recibir la oferta, el conductor debe cumplir LAS CUATRO: ONLINE + verificado + GPS fresco (≤120 s) + a ≤5 km del punto.</p>
        <table><thead><tr><th>Conductor</th><th>Estado</th><th>Verif.</th><th>GPS hace</th><th>Distancia</th><th>Radio 5 km</th><th>GPS fresco</th><th>¿Recibiría oferta?</th></tr></thead>
        <tbody id="diag-body"></tbody></table>
      </div>
      <table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Vehículo</th><th>Estado</th><th>Verificado</th><th>Intercity</th><th>KYC</th><th>Fraude</th><th>Rating</th><th>Viajes</th><th>Última conexión</th><th>Acciones</th></tr></thead>
      <tbody id="drivers-body"><tr><td colspan="12" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-clients" style="display:none">
      <p style="font-size:.78rem;color:#64748b;margin-bottom:10px">Verificación de identidad de pasajeros (anti-robo). Aprueba tras revisar la selfie.</p>
      <table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Selfie</th><th>Estado KYC</th><th>Registrado</th><th>Acciones</th></tr></thead>
      <tbody id="clients-body"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-operators" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <select id="operator-filter" style="width:auto" onchange="loadOperators()">
          <option value="">Todas</option>
          <option value="PENDING">Pendientes</option>
          <option value="ACTIVE">Activas</option>
          <option value="SUSPENDED">Suspendidas</option>
        </select>
      </div>
      <table><thead><tr><th>Empresa</th><th>Tipo</th><th>Ciudad</th><th>Veh/Cond</th><th>Docs pend.</th><th>Estado</th><th>Creada</th><th>Acciones</th></tr></thead>
      <tbody id="operators-body"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
      <div id="routes-panel" style="display:none;margin-top:18px;padding:16px;background:#fafafe;border:1px solid #e4e4ef;border-radius:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong id="routes-title" style="color:#3949ab">Rutas troncales</strong>
          <button class="btn-sm" style="background:#eee;color:#555" onclick="document.getElementById('routes-panel').style.display='none'">Cerrar</button>
        </div>
        <table><thead><tr><th>Ruta</th><th>Estado</th><th>Declarada</th><th>Acciones</th></tr></thead>
        <tbody id="routes-body"><tr><td colspan="4" class="empty">Cargando…</td></tr></tbody></table>
      </div>
    </section>

    <section id="tab-sos" style="display:none">
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Quién</th><th>Teléfono</th><th>Viaje</th><th>Ubicación</th></tr></thead>
      <tbody id="sos-body"><tr><td colspan="6" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-promos" style="display:none">
      <form class="inline" onsubmit="createPromo(event)">
        <div><label>Código</label><input id="p-code" placeholder="BIENVENIDO20" required /></div>
        <div><label>Tipo</label><select id="p-type"><option value="PERCENT">% Porcentaje</option><option value="FIXED">$ Fijo (COP)</option></select></div>
        <div><label>Valor</label><input id="p-value" type="number" min="1" required /></div>
        <div><label>Aplica a</label><select id="p-scope"><option value="ALL">Todo</option><option value="TRIPS">Viajes</option><option value="ORDERS">Pedidos</option></select></div>
        <div><label>Usos totales (vacío = ∞)</label><input id="p-max" type="number" min="1" /></div>
        <div><label>Vence</label><input id="p-exp" type="date" /></div>
        <div><button class="btn-sm" type="submit" style="padding:10px">Crear cupón</button></div>
      </form>
      <table><thead><tr><th>Código</th><th>Tipo</th><th>Valor</th><th>Aplica</th><th>Canjes</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
      <tbody id="promos-body"><tr><td colspan="8" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-payouts" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <select id="payout-filter" style="width:auto" onchange="loadPayouts()">
          <option value="REQUESTED">Solicitados</option>
          <option value="PROCESSING">En proceso</option>
          <option value="PAID">Pagados</option>
          <option value="REJECTED">Rechazados</option>
          <option value="">Todos</option>
        </select>
      </div>
      <table><thead><tr><th>Conductor</th><th>Teléfono</th><th>Monto</th><th>Destino</th><th>Estado</th><th>Solicitado</th><th>Acciones</th></tr></thead>
      <tbody id="payouts-body"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table>
    </section>

    <section id="tab-support" style="display:none">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <select id="support-filter" style="width:auto" onchange="loadSupport()">
          <option value="OPEN">Abiertos</option>
          <option value="IN_PROGRESS">En proceso</option>
          <option value="RESOLVED">Resueltos</option>
          <option value="CLOSED">Cerrados</option>
          <option value="">Todos</option>
        </select>
      </div>
      <table><thead><tr><th>De</th><th>Asunto</th><th>Categoría</th><th>Estado</th><th>Último mensaje</th><th>Actualizado</th><th>Acciones</th></tr></thead>
      <tbody id="support-body"><tr><td colspan="7" class="empty">Cargando…</td></tr></tbody></table>
      <div id="support-detail" style="display:none;margin-top:16px;background:#fff;padding:16px;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08)"></div>
    </section>
  </div>
</div>

<script>
let TOKEN = sessionStorage.getItem('nx_admin_token') || '';
let PHONE = '';

if (TOKEN) { boot(); }

// Pie de diagnóstico del login: build + modo OTP desde /health. Permite saber
// con una sola mirada qué commit corre Render y qué código espera el panel.
fetch('/health').then((r) => r.json()).then((h) => {
  document.getElementById('diag').textContent =
    'build ' + (h.commit || '?') + ' · OTP usuarios: ' + (h.otp || '?') +
    ' · OTP admin: ' + (h.otpAdmin || '?') + ' · BD: ' + (h.db ? 'ok' : 'sin conexión') +
    ' · fotos: ' + (h.uploads || '?') + ' · push: ' + (h.push || '?');
}).catch(() => {});

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN, ...(opts.headers || {}) },
  }).then(async (r) => {
    if (r.status === 401) { logout(); throw new Error('Sesión expirada'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(j.error || 'Error');
    return j.data;
  });
}

function sendOtp() {
  PHONE = document.getElementById('phone').value.trim();
  if (!PHONE) return;
  fetch('/admin/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: PHONE }) })
    .then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { document.getElementById('login-err').textContent = j.error || 'Error enviando código'; return; }
      document.getElementById('step-phone').style.display = 'none';
      document.getElementById('step-otp').style.display = 'block';
      document.getElementById('login-err').textContent = '';
      document.getElementById('otp').focus();
    });
}

function verifyOtp() {
  const otp = document.getElementById('otp').value.trim();
  fetch('/admin/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: PHONE, otp }) })
    .then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.data?.token) { document.getElementById('login-err').textContent = j.error || 'Código inválido'; return; }
      TOKEN = j.data.token;
      sessionStorage.setItem('nx_admin_token', TOKEN);
      boot();
    });
}

function logout() {
  sessionStorage.removeItem('nx_admin_token');
  TOKEN = '';
  location.reload();
}

function boot() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  show('metrics');
}

function show(tab) {
  for (const s of document.querySelectorAll('section[id^="tab-"]')) s.style.display = 'none';
  document.getElementById('tab-' + tab).style.display = 'block';
  for (const b of document.querySelectorAll('nav.tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  ({ metrics: loadMetrics, docs: loadDocs, drivers: loadDrivers, clients: loadClients, operators: loadOperators, sos: loadSos, promos: loadPromos, payouts: loadPayouts, support: loadSupport })[tab]();
}

const money = (v) => '$' + Number(v || 0).toLocaleString('es-CO');
const when = (iso) => iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function loadMetrics() {
  api('/admin/metrics').then((m) => {
    document.getElementById('metrics-grid').innerHTML = [
      [m.trips.todayRequested, 'Viajes pedidos hoy'],
      [m.trips.todayCompleted, 'Completados hoy'],
      [m.trips.activeNow, 'Viajes activos ahora'],
      [m.trips.last7dCompleted, 'Completados 7 días'],
      [money(m.money.todayGmv), 'GMV hoy'],
      [money(m.money.todayCommission), 'Comisión hoy'],
      [money(m.money.paymentsApprovedToday), 'Pagos Wompi hoy'],
      [m.drivers.onlineNow + ' / ' + m.drivers.total, 'Conductores en línea'],
      [m.drivers.verified, 'Verificados'],
      [m.drivers.pendingDocuments, 'Docs pendientes'],
      [m.users.total + ' (+' + m.users.newToday + ' hoy)', 'Usuarios'],
      [m.safety.sosLast24h, 'SOS últimas 24 h'],
    ].map(([v, l]) => '<div class="metric"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function loadDocs() {
  const status = document.getElementById('status-filter').value;
  api('/admin/verifications' + (status ? '?status=' + status : '')).then((docs) => {
    const tb = document.getElementById('docs-body');
    if (!docs.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Sin documentos.</td></tr>'; return; }
    tb.innerHTML = docs.map((d) => '<tr><td><strong>' + esc(d.driverName) + '</strong></td><td>' + esc(d.label) +
      '</td><td><a href="' + esc(d.fileUrl) + '" target="_blank">Ver archivo</a></td><td><span class="badge badge-' + d.status + '">' + d.status +
      '</span></td><td>' + when(d.uploadedAt) + '</td><td>' +
      (d.status !== 'APPROVED' ? '<button class="btn-sm btn-approve" onclick="reviewDoc(\\'' + d.docId + '\\', true)">Aprobar</button>' : '') +
      (d.status !== 'REJECTED' ? '<button class="btn-sm btn-reject" onclick="reviewDoc(\\'' + d.docId + '\\', false)">Rechazar</button>' : '') +
      '</td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function reviewDoc(id, approve) {
  const body = approve ? {} : { rejectionReason: prompt('Motivo de rechazo (opcional):') || '' };
  api('/admin/verifications/' + id + (approve ? '/approve' : '/reject'), { method: 'POST', body: JSON.stringify(body) })
    .then(() => { showMsg(approve ? 'Documento aprobado.' : 'Documento rechazado.', false); loadDocs(); })
    .catch((e) => showMsg(e.message, true));
}

var KYC_LABEL = { PENDING: 'Pendiente', IN_REVIEW: 'En revisión', VERIFIED: 'Verificado', REJECTED: 'Rechazado' };
function loadDrivers() {
  api('/admin/drivers').then((rows) => {
    const tb = document.getElementById('drivers-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="12" class="empty">Sin conductores.</td></tr>'; return; }
    tb.innerHTML = rows.map((d) => {
      var kycCell = '<span style="font-size:.72rem">' + (KYC_LABEL[d.kycStatus] || d.kycStatus) + '</span>';
      if (d.hasSelfie && d.selfieUrl) kycCell += ' <a href="' + esc(d.selfieUrl) + '" target="_blank" style="color:#059669">selfie</a>';
      var kycBtns = '';
      if (d.kycStatus !== 'VERIFIED') kycBtns += '<button class="btn-sm btn-approve" onclick="setDriverKyc(\\'' + d.id + '\\', \\'VERIFIED\\')">KYC ✓</button> ';
      if (d.kycStatus !== 'REJECTED') kycBtns += '<button class="btn-sm btn-reject" onclick="setDriverKyc(\\'' + d.id + '\\', \\'REJECTED\\')">KYC ✕</button>';
      var fraud = d.fraudFlags > 0 ? '<span class="badge badge-reject">⚠ ' + d.fraudFlags + '</span>' : '—';
      return '<tr><td><strong>' + esc(d.name) + '</strong></td><td>' + esc(d.phone) + '</td><td>' + esc(d.vehicle || '—') +
      '</td><td><span class="badge badge-' + d.status + '">' + d.status + '</span></td><td>' + (d.isVerified ? '✅' : '—') +
      '</td><td>' + (d.intercityEnabled ? '🛣️' : '—') +
      '</td><td>' + kycCell + '</td><td>' + fraud +
      '</td><td>' + d.rating.toFixed(2) + '</td><td>' + d.totalTrips + '</td><td>' + when(d.lastSeenAt) + '</td><td>' +
      (d.isVerified
        ? '<button class="btn-sm btn-reject" onclick="setDriverVerified(\\'' + d.id + '\\', \\'unverify\\')">Quitar verif.</button>'
        : '<button class="btn-sm btn-approve" onclick="setDriverVerified(\\'' + d.id + '\\', \\'verify\\')">Verificar</button>') +
      ' ' + kycBtns +
      (d.status === 'ON_TRIP' ? ' <button class="btn-sm" style="background:#f59e0b;color:#fff" onclick="releaseDriver(\\'' + d.id + '\\')">Liberar</button>' : '') +
      '</td></tr>';
    }).join('');
  }).catch((e) => showMsg(e.message, true));
}
function setDriverKyc(id, status) {
  api('/admin/drivers/' + id + '/kyc', { method: 'POST', body: JSON.stringify({ status: status }) })
    .then(() => { showMsg('KYC actualizado.', false); loadDrivers(); })
    .catch((e) => showMsg(e.message, true));
}
function loadClients() {
  api('/admin/clients').then((rows) => {
    const tb = document.getElementById('clients-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Ningún cliente inició verificación.</td></tr>'; return; }
    tb.innerHTML = rows.map((c) => {
      var selfie = c.hasSelfie && c.selfieUrl ? '<a href="' + esc(c.selfieUrl) + '" target="_blank" style="color:#059669">ver selfie</a>' : '—';
      var btns = '';
      if (c.kycStatus !== 'VERIFIED') btns += '<button class="btn-sm btn-approve" onclick="setClientKyc(\\'' + c.id + '\\', \\'VERIFIED\\')">Verificar</button> ';
      if (c.kycStatus !== 'REJECTED') btns += '<button class="btn-sm btn-reject" onclick="setClientKyc(\\'' + c.id + '\\', \\'REJECTED\\')">Rechazar</button>';
      return '<tr><td><strong>' + esc(c.name || '—') + '</strong></td><td>' + esc(c.phone) + '</td><td>' + selfie +
        '</td><td>' + (KYC_LABEL[c.kycStatus] || c.kycStatus) + '</td><td>' + when(c.createdAt) + '</td><td>' + btns + '</td></tr>';
    }).join('');
  }).catch((e) => showMsg(e.message, true));
}
function setClientKyc(id, status) {
  api('/admin/clients/' + id + '/kyc', { method: 'POST', body: JSON.stringify({ status: status }) })
    .then(() => { showMsg('Verificación del cliente actualizada.', false); loadClients(); })
    .catch((e) => showMsg(e.message, true));
}
function releaseDriver(id) {
  if (!confirm('¿Liberar al conductor? Se cancelará su viaje activo y volverá a ONLINE.')) return;
  api('/admin/drivers/' + id + '/release', { method: 'POST' })
    .then((r) => { showMsg('Conductor liberado (' + (r.cancelledTrips || 0) + ' viaje(s) cancelado(s)).', false); loadDrivers(); })
    .catch((e) => showMsg(e.message, true));
}

// Radiografía del despacho: evalúa los 4 filtros del matching por conductor.
function runDiag(ev) {
  ev.preventDefault();
  const lat = document.getElementById('diag-lat').value.trim();
  const lng = document.getElementById('diag-lng').value.trim();
  api('/admin/matching/diagnose?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng)).then((d) => {
    const tb = document.getElementById('diag-body');
    document.getElementById('diag-wrap').style.display = 'block';
    if (!d.drivers.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">No hay conductores registrados.</td></tr>'; return; }
    const ok = '<span class="badge badge-ok">Sí</span>';
    const no = '<span class="badge badge-REJECTED">No</span>';
    tb.innerHTML = d.drivers.map((r) => '<tr><td><strong>' + esc(r.name) + '</strong><br><span style="color:#94a3b8;font-size:.72rem">' + esc(r.phone) + '</span></td>' +
      '<td><span class="badge badge-' + r.status + '">' + r.status + '</span></td>' +
      '<td>' + (r.isVerified ? ok : no) + '</td>' +
      '<td>' + (r.geoAgeSeconds === null ? 'nunca' : r.geoAgeSeconds + ' s') + '</td>' +
      '<td>' + (r.distanceMeters === null ? '—' : (r.distanceMeters / 1000).toFixed(2) + ' km') + '</td>' +
      '<td>' + (r.inRadius ? ok : no) + '</td>' +
      '<td>' + (r.fresh ? ok : no) + '</td>' +
      '<td>' + (r.dispatchable ? '<strong style="color:#059669">SÍ</strong>' : '<strong style="color:#c62828">NO</strong>') + '</td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function setDriverVerified(id, action) {
  api('/admin/drivers/' + id + '/' + action, { method: 'POST' })
    .then(() => { showMsg(action === 'verify' ? 'Conductor verificado.' : 'Verificación retirada.', false); loadDrivers(); })
    .catch((e) => showMsg(e.message, true));
}

function loadOperators() {
  const status = document.getElementById('operator-filter').value;
  api('/admin/operators' + (status ? '?status=' + status : '')).then((rows) => {
    const tb = document.getElementById('operators-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">Sin empresas registradas.</td></tr>'; return; }
    tb.innerHTML = rows.map((o) => '<tr><td><strong>' + esc(o.legalName) + '</strong><div style="font-size:.72rem;color:#777">NIT ' + esc(o.nit) + '</div></td><td>' + esc(o.type) +
      '</td><td>' + esc(o.city || '—') + '</td><td>' + o.vehicles + ' / ' + o.drivers + '</td><td>' + (o.pendingDocs || 0) +
      '</td><td><span class="badge badge-' + (o.status === 'ACTIVE' ? 'ok' : o.status === 'SUSPENDED' ? 'REJECTED' : 'PENDING') + '">' + o.status + '</span></td><td>' + when(o.createdAt) + '</td><td>' +
      (o.status !== 'ACTIVE' ? '<button class="btn-sm btn-approve" onclick="setOperator(\\'' + o.id + '\\', \\'verify\\')">Verificar</button>' : '') +
      (o.status !== 'SUSPENDED' ? '<button class="btn-sm btn-reject" onclick="setOperator(\\'' + o.id + '\\', \\'suspend\\')">Suspender</button>' : '') +
      (o.type !== 'TAXI' ? '<button class="btn-sm" style="background:#e8eaf6;color:#3949ab" onclick="loadRoutes(\\'' + o.id + '\\', \\'' + encodeURIComponent(o.legalName).replace(/'/g, '%27') + '\\')">Rutas</button>' : '') +
      '</td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function loadRoutes(id, encName) {
  const panel = document.getElementById('routes-panel');
  panel.style.display = 'block';
  panel.dataset.op = id;
  document.getElementById('routes-title').textContent = 'Rutas troncales · ' + decodeURIComponent(encName);
  renderRoutes(id);
}

function renderRoutes(id) {
  document.getElementById('routes-body').innerHTML = '<tr><td colspan="4" class="empty">Cargando…</td></tr>';
  api('/admin/operators/' + id + '/routes').then((rows) => {
    const tb = document.getElementById('routes-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="4" class="empty">Esta empresa no ha declarado rutas.</td></tr>'; return; }
    tb.innerHTML = rows.map((r) => '<tr><td><strong>' + esc(r.originCity) + '</strong> → <strong>' + esc(r.destCity) + '</strong></td>' +
      '<td><span class="badge badge-' + (r.authorized ? 'ok' : 'PENDING') + '">' + (r.authorized ? 'Autorizada' : 'Pendiente') + '</span></td>' +
      '<td>' + when(r.createdAt) + '</td><td>' +
      (r.authorized
        ? '<button class="btn-sm btn-reject" onclick="setRoute(\\'' + r.id + '\\', \\'revoke\\')">Revocar</button>'
        : '<button class="btn-sm btn-approve" onclick="setRoute(\\'' + r.id + '\\', \\'authorize\\')">Autorizar</button>') +
      '</td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function setRoute(rid, action) {
  const opId = document.getElementById('routes-panel').dataset.op;
  api('/admin/routes/' + rid + '/' + action, { method: 'POST' })
    .then(() => { showMsg(action === 'authorize' ? 'Ruta autorizada.' : 'Ruta revocada.', false); renderRoutes(opId); })
    .catch((e) => showMsg(e.message, true));
}

function setOperator(id, action) {
  api('/admin/operators/' + id + '/' + action, { method: 'POST' })
    .then(() => { showMsg(action === 'verify' ? 'Empresa verificada.' : 'Empresa suspendida.', false); loadOperators(); })
    .catch((e) => showMsg(e.message, true));
}

function loadSos() {
  api('/admin/sos').then((rows) => {
    const tb = document.getElementById('sos-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Sin eventos SOS. 🎉</td></tr>'; return; }
    tb.innerHTML = rows.map((e) => '<tr><td>' + when(e.createdAt) + '</td><td><span class="badge badge-' + e.type + '">' + e.type +
      '</span></td><td>' + esc(e.actorName) + ' (' + e.actorRole + ')</td><td>' + esc(e.actorPhoneMasked) + '</td><td>' + esc(e.tripId || '—') +
      '</td><td><a href="' + esc(e.mapLink) + '" target="_blank">Ver mapa</a></td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function loadPromos() {
  api('/admin/promos').then((rows) => {
    const tb = document.getElementById('promos-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">Sin cupones aún.</td></tr>'; return; }
    tb.innerHTML = rows.map((p) => '<tr><td><strong>' + esc(p.code) + '</strong></td><td>' + (p.type === 'PERCENT' ? '%' : 'COP') +
      '</td><td>' + (p.type === 'PERCENT' ? p.value + '%' : money(p.value)) + '</td><td>' + p.scope + '</td><td>' + p.redemptions +
      (p.maxRedemptions ? ' / ' + p.maxRedemptions : '') + '</td><td>' + (p.expiresAt ? when(p.expiresAt) : '—') +
      '</td><td><span class="badge ' + (p.active ? 'badge-ok' : 'badge-OFFLINE') + '">' + (p.active ? 'Activo' : 'Inactivo') +
      '</span></td><td><button class="btn-sm" onclick="togglePromo(\\'' + p.id + '\\', ' + !p.active + ')">' + (p.active ? 'Desactivar' : 'Activar') + '</button></td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function createPromo(ev) {
  ev.preventDefault();
  const max = document.getElementById('p-max').value;
  const exp = document.getElementById('p-exp').value;
  api('/admin/promos', {
    method: 'POST',
    body: JSON.stringify({
      code: document.getElementById('p-code').value,
      type: document.getElementById('p-type').value,
      value: Number(document.getElementById('p-value').value),
      scope: document.getElementById('p-scope').value,
      maxRedemptions: max ? Number(max) : undefined,
      perUserLimit: 1,
      expiresAt: exp ? exp + 'T23:59:59-05:00' : undefined,
    }),
  }).then(() => { showMsg('Cupón creado.', false); loadPromos(); })
    .catch((e) => showMsg(e.message, true));
}

function togglePromo(id, active) {
  api('/admin/promos/' + id + '/toggle', { method: 'POST', body: JSON.stringify({ active }) })
    .then(() => loadPromos()).catch((e) => showMsg(e.message, true));
}

function payoutLabel(s) {
  return ({ REQUESTED: 'Solicitado', PROCESSING: 'En proceso', PAID: 'Pagado', REJECTED: 'Rechazado' })[s] || s;
}

function loadPayouts() {
  const status = document.getElementById('payout-filter').value;
  api('/admin/payouts' + (status ? '?status=' + status : '')).then((rows) => {
    const tb = document.getElementById('payouts-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Sin retiros.</td></tr>'; return; }
    tb.innerHTML = rows.map((p) => '<tr><td><strong>' + esc(p.driverName) + '</strong></td><td>' + esc(p.driverPhone) +
      '</td><td>' + money(p.amount) + '</td><td>' + esc(p.accountInfo || '—') +
      '</td><td><span class="badge badge-' + p.status + '">' + payoutLabel(p.status) + '</span></td><td>' + when(p.requestedAt) +
      '</td><td>' +
      (p.status === 'REQUESTED' ? '<button class="btn-sm" onclick="setPayout(\\'' + p.id + '\\', \\'PROCESSING\\')">Procesar</button>' : '') +
      (p.status === 'REQUESTED' || p.status === 'PROCESSING' ? '<button class="btn-sm btn-approve" onclick="payPayout(\\'' + p.id + '\\')">Pagar</button><button class="btn-sm btn-reject" onclick="setPayout(\\'' + p.id + '\\', \\'REJECTED\\')">Rechazar</button>' : '') +
      (p.reference ? '<div style="font-size:.72rem;color:#777;margin-top:3px">Ref: ' + esc(p.reference) + '</div>' : '') +
      '</td></tr>').join('');
  }).catch((e) => showMsg(e.message, true));
}

function setPayout(id, status) {
  api('/admin/payouts/' + id, { method: 'POST', body: JSON.stringify({ status }) })
    .then(() => { showMsg('Retiro actualizado.', false); loadPayouts(); })
    .catch((e) => showMsg(e.message, true));
}

function payPayout(id) {
  const reference = prompt('Referencia de la transferencia (opcional):') || '';
  api('/admin/payouts/' + id, { method: 'POST', body: JSON.stringify({ status: 'PAID', reference }) })
    .then(() => { showMsg('Retiro pagado.', false); loadPayouts(); })
    .catch((e) => showMsg(e.message, true));
}

var SUP_STATUS = { OPEN: 'Abierto', IN_PROGRESS: 'En proceso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' };
function loadSupport() {
  document.getElementById('support-detail').style.display = 'none';
  var f = document.getElementById('support-filter').value;
  api('/admin/support' + (f ? '?status=' + f : '')).then((rows) => {
    const tb = document.getElementById('support-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Sin tickets.</td></tr>'; return; }
    tb.innerHTML = rows.map((t) => {
      var who = (t.requesterKind === 'driver' ? '🚗 ' : '🧑 ') + esc(t.requesterName || t.requesterId.slice(0, 8));
      var last = t.lastMessage ? esc(t.lastMessage.slice(0, 60)) : '—';
      return '<tr><td>' + who + '</td><td><strong>' + esc(t.subject) + '</strong></td><td>' + esc(t.category) +
        '</td><td>' + (SUP_STATUS[t.status] || t.status) + '</td><td style="color:#64748b;font-size:.78rem">' + last +
        '</td><td>' + when(t.updatedAt) + '</td><td><button class="btn-sm btn-approve" onclick="openTicket(\\'' + t.id + '\\')">Ver</button></td></tr>';
    }).join('');
  }).catch((e) => showMsg(e.message, true));
}
function openTicket(id) {
  api('/admin/support/' + id).then((t) => {
    var box = document.getElementById('support-detail');
    box.style.display = 'block';
    var msgs = (t.messages || []).map((m) => {
      var mine = m.authorKind === 'admin';
      var label = m.authorKind === 'admin' ? 'Soporte' : (m.authorKind === 'driver' ? 'Conductor' : 'Cliente');
      return '<div style="margin:6px 0;padding:8px 12px;border-radius:10px;max-width:80%;' +
        (mine ? 'margin-left:auto;background:#d1fae5' : 'background:#f1f5f9') + '">' +
        '<div style="font-size:.68rem;color:#64748b;margin-bottom:2px">' + label + ' · ' + when(m.sentAt) + '</div>' +
        esc(m.body) + '</div>';
    }).join('');
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<h3 style="margin:0">' + esc(t.subject) + ' <span style="font-size:.75rem;color:#64748b">(' + (SUP_STATUS[t.status] || t.status) + ')</span></h3>' +
      '<div>' +
      '<button class="btn-sm btn-approve" onclick="setTicketStatus(\\'' + t.id + '\\', \\'RESOLVED\\')">Resolver</button>' +
      '<button class="btn-sm" style="background:#e2e8f0" onclick="setTicketStatus(\\'' + t.id + '\\', \\'CLOSED\\')">Cerrar</button>' +
      '</div></div>' +
      '<div style="max-height:340px;overflow-y:auto;padding:6px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">' + msgs + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<input id="ticket-reply" placeholder="Escribe tu respuesta…" style="flex:1;margin:0" />' +
      '<button style="width:auto" onclick="replyTicket(\\'' + t.id + '\\')">Responder</button></div>';
  }).catch((e) => showMsg(e.message, true));
}
function replyTicket(id) {
  var el = document.getElementById('ticket-reply');
  var body = (el.value || '').trim();
  if (!body) return;
  api('/admin/support/' + id + '/reply', { method: 'POST', body: JSON.stringify({ body }) })
    .then(() => { showMsg('Respuesta enviada.', false); openTicket(id); loadSupport(); })
    .catch((e) => showMsg(e.message, true));
}
function setTicketStatus(id, status) {
  api('/admin/support/' + id + '/status', { method: 'POST', body: JSON.stringify({ status }) })
    .then(() => { showMsg('Estado actualizado.', false); openTicket(id); loadSupport(); })
    .catch((e) => showMsg(e.message, true));
}

function showMsg(text, isErr) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = isErr ? 'err' : 'ok';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
</script>
</body>
</html>`;

// GET /admin — panel HTML (público; el acceso real lo da el OTP + JWT).
router.get('/', (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PANEL_HTML);
});

export default router;
