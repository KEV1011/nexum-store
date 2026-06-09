import { Router, Request, Response } from 'express';
import { DocumentStatus } from '@prisma/client';
import { requireAdmin } from '../middleware/admin.middleware';
import {
  listDocumentsForAdmin,
  adminReviewDocument,
} from '../services/driver-profile.service';

const router = Router();

// ─── HTML Admin Panel ────────────────────────────────────────────────────────

const PANEL_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nexum — Verificación de Conductores</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #1a1a1a; }
    header { background: #1565c0; color: #fff; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.2rem; }
    #login-form { max-width: 360px; margin: 60px auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
    #login-form h2 { margin-bottom: 20px; font-size: 1rem; color: #333; }
    input { width: 100%; border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; font-size: .9rem; margin-bottom: 12px; }
    button { width: 100%; background: #1565c0; color: #fff; border: none; border-radius: 6px; padding: 12px; font-size: .95rem; cursor: pointer; }
    button:hover { background: #1976d2; }
    #app { display: none; padding: 24px; max-width: 1100px; margin: 0 auto; }
    .controls { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    .controls select, .controls button { width: auto; padding: 8px 16px; font-size: .85rem; }
    .controls button { background: #1565c0; }
    table { width: 100%; background: #fff; border-radius: 10px; border-collapse: collapse; box-shadow: 0 1px 6px rgba(0,0,0,.08); overflow: hidden; }
    th { background: #e3f2fd; color: #1565c0; padding: 12px 14px; text-align: left; font-size: .8rem; text-transform: uppercase; }
    td { padding: 10px 14px; border-top: 1px solid #f0f0f0; font-size: .88rem; vertical-align: middle; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: .75rem; font-weight: 600; }
    .badge-PENDING  { background: #fff8e1; color: #f57f17; }
    .badge-APPROVED { background: #e8f5e9; color: #2e7d32; }
    .badge-REJECTED { background: #fce4ec; color: #c62828; }
    .btn-sm { padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: .8rem; margin-right: 4px; }
    .btn-approve { background: #2e7d32; color: #fff; }
    .btn-reject  { background: #c62828; color: #fff; }
    a.doc-link { color: #1565c0; }
    #msg { padding: 10px 16px; border-radius: 8px; margin-bottom: 16px; display: none; }
    #msg.ok  { background: #e8f5e9; color: #2e7d32; }
    #msg.err { background: #fce4ec; color: #c62828; }
    .empty { padding: 40px; text-align: center; color: #888; }
  </style>
</head>
<body>

<div id="login-form">
  <h2>Acceso al panel de administración</h2>
  <input id="phone-input" type="tel" placeholder="+57300..." />
  <button onclick="login()">Entrar</button>
  <p id="login-err" style="color:#c00;font-size:.8rem;margin-top:8px;"></p>
</div>

<div id="app">
  <header>
    <span style="font-size:1.6rem">🛡️</span>
    <h1>Nexum — Verificación de Conductores</h1>
  </header>
  <div style="padding:24px">
    <div id="msg"></div>
    <div class="controls">
      <select id="status-filter">
        <option value="PENDING">Pendientes</option>
        <option value="APPROVED">Aprobados</option>
        <option value="REJECTED">Rechazados</option>
        <option value="">Todos</option>
      </select>
      <button onclick="loadDocs()">Actualizar</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Conductor</th>
          <th>Documento</th>
          <th>Archivo</th>
          <th>Estado</th>
          <th>Subido</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="doc-table-body">
        <tr><td colspan="6" class="empty">Cargando...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
let TOKEN = '';

function login() {
  const phone = document.getElementById('phone-input').value.trim();
  if (!phone) return;
  TOKEN = phone;
  fetch('/admin/verifications?status=PENDING', { headers: { Authorization: 'Bearer ' + TOKEN } })
    .then(r => {
      if (!r.ok) { document.getElementById('login-err').textContent = 'Teléfono no autorizado.'; TOKEN = ''; return; }
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      loadDocs();
    });
}

function loadDocs() {
  const status = document.getElementById('status-filter').value;
  const url = '/admin/verifications' + (status ? '?status=' + status : '');
  fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } })
    .then(r => r.json())
    .then(data => renderTable(data.data || []));
}

function renderTable(docs) {
  const tbody = document.getElementById('doc-table-body');
  if (!docs.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin documentos.</td></tr>'; return; }
  tbody.innerHTML = docs.map(d => \`
    <tr>
      <td><strong>\${esc(d.driverName)}</strong></td>
      <td>\${esc(d.label)}</td>
      <td><a class="doc-link" href="\${esc(d.fileUrl)}" target="_blank">Ver archivo</a></td>
      <td><span class="badge badge-\${d.status}">\${d.status}</span></td>
      <td>\${new Date(d.uploadedAt).toLocaleDateString('es-CO')}</td>
      <td>
        \${d.status !== 'APPROVED' ? '<button class="btn-sm btn-approve" onclick="approve(\\''+d.docId+'\\')">Aprobar</button>' : ''}
        \${d.status !== 'REJECTED' ? '<button class="btn-sm btn-reject"  onclick="reject(\\''+d.docId+'\\')">Rechazar</button>' : ''}
      </td>
    </tr>
  \`).join('');
}

function approve(docId) {
  apiFetch('/admin/verifications/' + docId + '/approve', 'POST', {})
    .then(() => { showMsg('Documento aprobado.', false); loadDocs(); });
}

function reject(docId) {
  const reason = prompt('Motivo de rechazo (opcional):') ?? '';
  apiFetch('/admin/verifications/' + docId + '/reject', 'POST', { rejectionReason: reason })
    .then(() => { showMsg('Documento rechazado.', false); loadDocs(); });
}

function apiFetch(url, method, body) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => showMsg(e.message, true));
}

function showMsg(text, isErr) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = isErr ? 'err' : 'ok';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
</script>
</body>
</html>`;

// GET /admin — HTML panel (no auth; login handled in-browser via Bearer token)
router.get('/', (_req: Request, res: Response): void => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PANEL_HTML);
});

// All API routes below require admin authentication.
router.use('/verifications', requireAdmin);

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

export default router;
