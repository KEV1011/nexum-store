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
import { requestOtp, validateOtp, OtpRateLimitError } from '../services/otp.service';
import {
  getAdminMetrics,
  listDriversForAdmin,
  listSosForAdmin,
  listOperatorsForAdmin,
  setOperatorStatus,
  listOperatorRoutesForAdmin,
  setOperatorRouteAuthorized,
  setDriverVerified,
} from '../services/admin.service';
import { OperatorStatus } from '@prisma/client';
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
    await requestOtp(phone.trim());
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const status = err instanceof OtpRateLimitError ? 429 : 500;
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
    await validateOtp(phone.trim(), otp.trim());
    res.json({ success: true, data: { token: signAdminToken(phone.trim()) } });
  } catch {
    res.status(401).json({ success: false, error: 'Código inválido o expirado' });
  }
});

// ─── API del panel (requiere JWT de admin) ───────────────────────────────────

router.use(['/verifications', '/metrics', '/drivers', '/sos', '/promos', '/payouts', '/operators', '/routes'], requireAdmin);

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
    body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #1a1a1a; }
    header { background: #1565c0; color: #fff; padding: 14px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.1rem; flex: 1; }
    header button { width: auto; background: rgba(255,255,255,.15); padding: 6px 14px; font-size: .8rem; }
    .card { max-width: 360px; margin: 60px auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
    .card h2 { margin-bottom: 18px; font-size: 1rem; color: #333; }
    input, select { width: 100%; border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; font-size: .9rem; margin-bottom: 12px; background:#fff; }
    button { width: 100%; background: #1565c0; color: #fff; border: none; border-radius: 6px; padding: 11px; font-size: .92rem; cursor: pointer; }
    button:hover { filter: brightness(1.08); }
    #app { display: none; padding: 20px; max-width: 1200px; margin: 0 auto; }
    nav.tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
    nav.tabs button { width: auto; padding: 8px 18px; background: #fff; color: #1565c0; border: 1px solid #cfd8dc; font-size: .85rem; border-radius: 20px; }
    nav.tabs button.active { background: #1565c0; color: #fff; border-color: #1565c0; }
    table { width: 100%; background: #fff; border-radius: 10px; border-collapse: collapse; box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow: hidden; }
    th { background: #e3f2fd; color: #1565c0; padding: 11px 13px; text-align: left; font-size: .76rem; text-transform: uppercase; }
    td { padding: 9px 13px; border-top: 1px solid #f0f0f0; font-size: .87rem; vertical-align: middle; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: .73rem; font-weight: 600; }
    .badge-PENDING { background: #fff8e1; color: #f57f17; }
    .badge-APPROVED, .badge-ONLINE, .badge-ok { background: #e8f5e9; color: #2e7d32; }
    .badge-REJECTED, .badge-PANIC { background: #fce4ec; color: #c62828; }
    .badge-OFFLINE { background: #eceff1; color: #607d8b; }
    .badge-ON_TRIP { background: #e3f2fd; color: #1565c0; }
    .badge-REQUESTED { background: #fff8e1; color: #f57f17; }
    .badge-PROCESSING { background: #e3f2fd; color: #1565c0; }
    .badge-PAID { background: #e8f5e9; color: #2e7d32; }
    .btn-sm { width:auto; padding: 5px 12px; border-radius: 6px; font-size: .78rem; margin-right: 4px; }
    .btn-approve { background: #2e7d32; }
    .btn-reject { background: #c62828; }
    a { color: #1565c0; }
    #msg { padding: 10px 16px; border-radius: 8px; margin-bottom: 14px; display: none; }
    #msg.ok { background: #e8f5e9; color: #2e7d32; }
    #msg.err { background: #fce4ec; color: #c62828; }
    .empty { padding: 36px; text-align: center; color: #888; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 6px rgba(0,0,0,.08); }
    .metric .v { font-size: 1.5rem; font-weight: 700; color: #1565c0; }
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
    <input id="phone" type="tel" placeholder="+573001234567" />
    <button onclick="sendOtp()">Enviarme el código</button>
  </div>
  <div id="step-otp" style="display:none">
    <input id="otp" inputmode="numeric" maxlength="6" placeholder="Código SMS (6 dígitos)" />
    <button onclick="verifyOtp()">Entrar</button>
  </div>
  <p id="login-err" style="color:#c00;font-size:.8rem;margin-top:8px;"></p>
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
      <button data-tab="operators" onclick="show('operators')">Empresas</button>
      <button data-tab="sos" onclick="show('sos')">SOS</button>
      <button data-tab="promos" onclick="show('promos')">Promos</button>
      <button data-tab="payouts" onclick="show('payouts')">Retiros</button>
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
      <table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Vehículo</th><th>Estado</th><th>Verificado</th><th>Rating</th><th>Viajes</th><th>Última conexión</th><th>Acciones</th></tr></thead>
      <tbody id="drivers-body"><tr><td colspan="9" class="empty">Cargando…</td></tr></tbody></table>
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
  </div>
</div>

<script>
let TOKEN = sessionStorage.getItem('nx_admin_token') || '';
let PHONE = '';

if (TOKEN) { boot(); }

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
  ({ metrics: loadMetrics, docs: loadDocs, drivers: loadDrivers, operators: loadOperators, sos: loadSos, promos: loadPromos, payouts: loadPayouts })[tab]();
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

function loadDrivers() {
  api('/admin/drivers').then((rows) => {
    const tb = document.getElementById('drivers-body');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">Sin conductores.</td></tr>'; return; }
    tb.innerHTML = rows.map((d) => '<tr><td><strong>' + esc(d.name) + '</strong></td><td>' + esc(d.phone) + '</td><td>' + esc(d.vehicle || '—') +
      '</td><td><span class="badge badge-' + d.status + '">' + d.status + '</span></td><td>' + (d.isVerified ? '✅' : '—') +
      '</td><td>' + d.rating.toFixed(2) + '</td><td>' + d.totalTrips + '</td><td>' + when(d.lastSeenAt) + '</td><td>' +
      (d.isVerified
        ? '<button class="btn-sm btn-reject" onclick="setDriverVerified(\\'' + d.id + '\\', \\'unverify\\')">Quitar verif.</button>'
        : '<button class="btn-sm btn-approve" onclick="setDriverVerified(\\'' + d.id + '\\', \\'verify\\')">Verificar</button>') +
      '</td></tr>').join('');
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
