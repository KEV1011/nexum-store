import { Router } from 'express';
import { handleWompiWebhook } from '../services/payment.service';

const router = Router();

router.post('/wompi', (req, res) => {
  const signature = req.headers['x-event-checksum'] as string ?? '';
  const result = handleWompiWebhook(req.body, signature);
  res.status(result.handled ? 200 : 400).json({ received: result.handled });
});

export default router;
