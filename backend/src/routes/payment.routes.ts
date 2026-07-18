import { Router, Request, Response } from 'express';
import { getPaymentByReference, reconcilePayment } from '../services/payment.service';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /payment/result?ref=NX-...
//
// Página a la que Wompi redirige al usuario al terminar el checkout. Es
// pública (el usuario llega desde el navegador, sin token): solo muestra el
// estado del pago — nunca datos personales. Si el pago sigue `pending`,
// reconcilia contra la API de Wompi y se auto-refresca cada 4 s, porque el
// webhook puede tardar unos segundos más que el redirect.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_VIEW: Record<string, { icon: string; color: string; title: string; detail: string }> = {
  approved: {
    icon: '✓', color: '#00C853', title: 'Pago aprobado',
    detail: 'Tu pago fue procesado con éxito. Ya puedes volver a la app ZIPA.',
  },
  rejected: {
    icon: '✕', color: '#D32F2F', title: 'Pago rechazado',
    detail: 'Tu pago no pudo procesarse. Vuelve a la app e inténtalo de nuevo.',
  },
  voided: {
    icon: '✕', color: '#757575', title: 'Pago anulado',
    detail: 'La transacción fue anulada. Si tienes dudas escribe a soporte desde la app.',
  },
  pending: {
    icon: '⏳', color: '#F9A825', title: 'Confirmando tu pago…',
    detail: 'Estamos esperando la confirmación del banco. Esta página se actualiza sola.',
  },
};

function _renderPage(status: string, reference: string): string {
  const view = STATUS_VIEW[status] ?? STATUS_VIEW['pending']!;
  const autoRefresh = status === 'pending'
    ? '<meta http-equiv="refresh" content="4">'
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${autoRefresh}
  <title>${view.title} — ZIPA</title>
  <style>
    body { margin:0; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; background:#fff;
           display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { text-align:center; padding:32px; max-width:340px; }
    .badge { width:88px; height:88px; border-radius:50%; margin:0 auto 24px; color:#fff;
             display:flex; align-items:center; justify-content:center; font-size:44px;
             background:${view.color}; }
    h1 { font-size:22px; color:#1A237E; margin:0 0 12px; }
    p { color:#616161; font-size:15px; line-height:1.5; margin:0 0 8px; }
    .ref { color:#9E9E9E; font-size:12px; margin-top:24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${view.icon}</div>
    <h1>${view.title}</h1>
    <p>${view.detail}</p>
    <p class="ref">Referencia: ${reference}</p>
  </div>
</body>
</html>`;
}

router.get('/result', async (req: Request, res: Response): Promise<void> => {
  const ref = typeof req.query['ref'] === 'string' ? req.query['ref'] : '';
  // Las referencias ZIPA son NX-<timestamp>-<6 hex>; rechaza cualquier otra
  // cosa antes de tocar la base de datos o interpolar en el HTML.
  if (!/^NX-[0-9]+-[A-Z0-9]{6}$/.test(ref)) {
    res.status(400).send(_renderPage('voided', 'inválida'));
    return;
  }

  await reconcilePayment(ref);
  const payment = await getPaymentByReference(ref);
  const status = payment?.status ?? 'pending';
  res.status(200).type('html').send(_renderPage(status, ref));
});

export default router;
