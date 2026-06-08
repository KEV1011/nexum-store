import { Router } from 'express';
import { handleWompiWebhook } from '../services/payment.service';

const router = Router();

router.post('/wompi', async (req, res) => {
  const signature = req.headers['x-event-checksum'] as string ?? '';
  const result = await handleWompiWebhook(req.body, signature);
  res.status(result.handled ? 200 : 400).json({ received: result.handled });
});

export default router;
