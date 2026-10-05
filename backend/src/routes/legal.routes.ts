import { Router, Request, Response } from 'express';
import {
  getActiveLegalDoc,
  createTakedownRequest,
  LegalError,
} from '../services/legal.service';
import {
  MERCANCIA_NO_ADMITIDA,
  VERSION_LISTA_NO_ADMITIDA,
  CATEGORIAS_CARGA,
  ETIQUETA_CATEGORIA,
} from '../lib/remitente';

// ── Rutas legales públicas ────────────────────────────────────────────────────
// GET /legal/terms · GET /legal/privacy — documento VIGENTE (apps y web leen de
// aquí: una sola fuente de verdad versionada).
// POST /legal/takedown — formulario público de retiro DMCA/derechos de autor.
// GET /legal/envios — qué NO se transporta y el catálogo de lo que se declara.

const router = Router();

router.get('/terms', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getActiveLegalDoc('TERMS') });
});

router.get('/privacy', async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getActiveLegalDoc('PRIVACY') });
});

/**
 * Lo que no se transporta, y las categorías con las que se declara.
 *
 * Pública y SIN sesión a propósito: hay que poder leerla antes de enviar
 * —y antes de registrarse—, y el que decide si acepta un paquete en el
 * mostrador no siempre es quien tiene la app abierta.
 *
 * El catálogo sale de aquí y no de una lista escrita dentro de la app:
 * añadir una categoría no puede exigir que medio pueblo actualice el APK,
 * y dos listas acabarían ofreciendo opciones que el servidor rechaza.
 */
router.get('/envios', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      versionLista: VERSION_LISTA_NO_ADMITIDA,
      noAdmitido: MERCANCIA_NO_ADMITIDA,
      categorias: CATEGORIAS_CARGA.map((c) => ({ valor: c, etiqueta: ETIQUETA_CATEGORIA[c] })),
    },
  });
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
