import { Router, Request, Response } from 'express';
import {
  getActiveLegalDoc,
  createTakedownRequest,
  LegalError,
} from '../services/legal.service';

// ── Rutas legales públicas ────────────────────────────────────────────────────
// GET /legal/terms · GET /legal/privacy — documento VIGENTE (apps y web leen de
// aquí: una sola fuente de verdad versionada).
// POST /legal/takedown — formulario público de retiro DMCA/derechos de autor.

const router = Router();

router.get('/terms', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getActiveLegalDoc('TERMS') });
});

router.get('/privacy', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getActiveLegalDoc('PRIVACY') });
});

router.post('/takedown', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await createTakedownRequest(req.body as Record<string, string>);
    res.status(201).json({
      success: true,
      data,
      message:
        'Recibimos tu solicitud de retiro. El agente designado la revisará y te contactará al correo indicado.',
    });
  } catch (err) {
    if (err instanceof LegalError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({ success: false, error: 'No se pudo registrar la solicitud.' });
  }
});

export default router;
