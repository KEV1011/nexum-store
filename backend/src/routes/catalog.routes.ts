import { Router, Request, Response } from 'express';
import {
  addStoreProduct,
  bulkImport,
  createMaster,
  listStoreProducts,
  lookupByBarcode,
  searchMaster,
  updateStoreProduct,
} from '../services/catalog.service';

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Error';
}

// ── Catálogo maestro ──────────────────────────────────────────────────────────

// GET /catalog/lookup?barcode=7702004003508  → autocompletado al escanear
router.get('/lookup', (req: Request, res: Response): void => {
  const barcode = (req.query['barcode'] as string | undefined)?.trim();
  if (!barcode) {
    res.status(400).json({ success: false, error: 'barcode es requerido' });
    return;
  }
  const master = lookupByBarcode(barcode);
  res.status(200).json({ success: true, data: { found: master !== null, master } });
});

// GET /catalog/search?q=acetaminofen  → sugerencias sin escáner
router.get('/search', (req: Request, res: Response): void => {
  const q = (req.query['q'] as string | undefined) ?? '';
  res.status(200).json({ success: true, data: searchMaster(q) });
});

// POST /catalog/master  → crear maestro nuevo (EAN no encontrado)
router.post('/master', (req: Request, res: Response): void => {
  const b = req.body as Record<string, unknown>;
  if (typeof b['barcode'] !== 'string' || typeof b['name'] !== 'string') {
    res.status(400).json({ success: false, error: 'barcode y name son requeridos' });
    return;
  }
  try {
    const master = createMaster({
      barcode: b['barcode'] as string,
      name: b['name'] as string,
      brand: b['brand'] as string | undefined,
      category: (b['category'] as string | undefined) ?? 'General',
      presentation: b['presentation'] as string | undefined,
      requiresRx: b['requiresRx'] as boolean | undefined,
      invimaCode: b['invimaCode'] as string | undefined,
    });
    res.status(201).json({ success: true, data: master });
  } catch (err) {
    res.status(400).json({ success: false, error: errMsg(err) });
  }
});

// ── Productos por negocio ─────────────────────────────────────────────────────

// GET /catalog/products?businessId=xxx
router.get('/products', (req: Request, res: Response): void => {
  const businessId = (req.query['businessId'] as string | undefined) ?? 'default_business';
  res.status(200).json({ success: true, data: listStoreProducts(businessId) });
});

// POST /catalog/products  → agregar producto (modo barcode o manual)
router.post('/products', (req: Request, res: Response): void => {
  const b = req.body as Record<string, unknown>;
  if (typeof b['price'] !== 'number') {
    res.status(400).json({ success: false, error: 'price (number) es requerido' });
    return;
  }
  try {
    const sp = addStoreProduct({
      businessId: (b['businessId'] as string | undefined) ?? 'default_business',
      barcode: b['barcode'] as string | undefined,
      name: b['name'] as string | undefined,
      description: b['description'] as string | undefined,
      price: b['price'] as number,
      stock: b['stock'] as number | undefined,
      category: b['category'] as string | undefined,
      masterName: b['masterName'] as string | undefined,
      brand: b['brand'] as string | undefined,
      presentation: b['presentation'] as string | undefined,
      requiresRx: b['requiresRx'] as boolean | undefined,
    });
    res.status(201).json({ success: true, data: sp });
  } catch (err) {
    res.status(400).json({ success: false, error: errMsg(err) });
  }
});

// PATCH /catalog/products/:id  → precio / stock / disponibilidad
router.patch('/products/:id', (req: Request, res: Response): void => {
  const b = req.body as Record<string, unknown>;
  try {
    const sp = updateStoreProduct(req.params['id'] as string, {
      price: b['price'] as number | undefined,
      stock: b['stock'] as number | undefined,
      isAvailable: b['isAvailable'] as boolean | undefined,
    });
    res.status(200).json({ success: true, data: sp });
  } catch (err) {
    res.status(404).json({ success: false, error: errMsg(err) });
  }
});

// POST /catalog/products/bulk  → carga masiva CSV/Excel parseada en el cliente
router.post('/products/bulk', (req: Request, res: Response): void => {
  const b = req.body as Record<string, unknown>;
  const rows = b['rows'];
  if (!Array.isArray(rows)) {
    res.status(400).json({ success: false, error: 'rows (array) es requerido' });
    return;
  }
  const result = bulkImport(
    (b['businessId'] as string | undefined) ?? 'default_business',
    rows as Array<{ barcode?: string; name?: string; price: number; stock?: number; category?: string }>
  );
  res.status(200).json({ success: true, data: result });
});

export default router;
