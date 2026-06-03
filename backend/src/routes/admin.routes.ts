import { Router, Request, Response } from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  approveAccount,
  listAccounts,
  rejectAccount,
  suspendAccount,
  updateCommission,
} from '../services/account.service';
import { AccountRole, AccountStatus } from '../types';

const router = Router();

router.use(adminMiddleware);

const VALID_STATUS: AccountStatus[] = ['pending', 'approved', 'suspended', 'rejected'];
const VALID_ROLES: AccountRole[] = ['driver_car', 'driver_moto', 'business', 'admin'];

router.get('/accounts', async (req: Request, res: Response): Promise<void> => {
  const { search, status, role } = req.query as { search?: string; status?: string; role?: string };
  const statusFilter = status && VALID_STATUS.includes(status as AccountStatus) ? (status as AccountStatus) : undefined;
  const roleFilter = role && VALID_ROLES.includes(role as AccountRole) ? (role as AccountRole) : undefined;
  const data = await listAccounts({ search: search?.trim() || undefined, status: statusFilter, role: roleFilter });
  res.status(200).json({ success: true, data });
});

router.post('/accounts/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await approveAccount(req.params['id'] as string);
    res.status(200).json({ success: true, data });
  } catch (err) { res.status(404).json({ success: false, error: errMsg(err) }); }
});

router.post('/accounts/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { reason } = (req.body ?? {}) as { reason?: string };
  try {
    const data = await rejectAccount(req.params['id'] as string, reason);
    res.status(200).json({ success: true, data });
  } catch (err) { res.status(404).json({ success: false, error: errMsg(err) }); }
});

router.post('/accounts/:id/suspend', async (req: Request, res: Response): Promise<void> => {
  const { reason } = (req.body ?? {}) as { reason?: string };
  try {
    const data = await suspendAccount(req.params['id'] as string, reason);
    res.status(200).json({ success: true, data });
  } catch (err) { res.status(404).json({ success: false, error: errMsg(err) }); }
});

router.patch('/accounts/:id/commission', async (req: Request, res: Response): Promise<void> => {
  const { commissionRate } = (req.body ?? {}) as { commissionRate?: number };
  if (typeof commissionRate !== 'number') {
    res.status(400).json({ success: false, error: 'commissionRate (number) is required' });
    return;
  }
  try {
    const data = await updateCommission(req.params['id'] as string, commissionRate);
    res.status(200).json({ success: true, data });
  } catch (err) { res.status(400).json({ success: false, error: errMsg(err) }); }
});

function errMsg(err: unknown): string { return err instanceof Error ? err.message : 'Error'; }

export default router;
