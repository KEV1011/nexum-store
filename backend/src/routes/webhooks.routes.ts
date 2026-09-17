import { Router } from 'express';
import { handleWompiWebhook } from '../services/payment.service';
import {
  firmaValida,
  procesarEntrante,
  puedeRecibirWhatsapp,
  respuestaHandshake,
} from '../services/whatsapp.service';

const router = Router();

router.post('/wompi', async (req, res) => {
  const signature = req.headers['x-event-checksum'] as string ?? '';
  const result = await handleWompiWebhook(req.body, signature);
  res.status(result.handled ? 200 : 400).json({ received: result.handled });
});

// ─── WhatsApp Cloud API ───────────────────────────────────────────────────────
//
// El cuerpo de esta ruta llega como Buffer, no como objeto: index.ts le monta
// un parser `raw` propio porque la firma se calcula sobre los bytes EXACTOS que
// mandó Meta. Volver a serializar el JSON ya parseado daría otra firma.

/**
 * Handshake de verificación. Meta lo hace una sola vez, al guardar la URL en
 * el panel, y espera el `challenge` de vuelta en texto plano.
 */
router.get('/whatsapp', (req, res) => {
  const challenge = respuestaHandshake(
    req.query['hub.mode'] as string | undefined,
    req.query['hub.verify_token'] as string | undefined,
    req.query['hub.challenge'] as string | undefined,
  );
  if (challenge === null) {
    res.status(403).send('forbidden');
    return;
  }
  res.status(200).type('text/plain').send(challenge);
});

/**
 * Mensajes entrantes.
 *
 * Tres cosas en orden, y el orden importa:
 *
 * 1. Sin secreto configurado se rechaza. Esta ruta acaba emitiendo una sesión
 *    para el teléfono que diga el cuerpo, así que sin poder comprobar la firma
 *    cualquiera pediría la sesión de cualquiera. Falla cerrado.
 * 2. Se valida la firma antes de mirar el contenido.
 * 3. Se responde 200 enseguida y se procesa después: Meta reintenta si el 200
 *    tarda, y un reintento es otro mensaje cobrado para el pasajero. El
 *    procesamiento no puede lanzar (ver `procesarEntrante`).
 */
router.post('/whatsapp', (req, res) => {
  if (!puedeRecibirWhatsapp()) {
    res.status(503).json({ success: false, error: 'Canal de WhatsApp no configurado' });
    return;
  }

  const crudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!firmaValida(crudo, req.headers['x-hub-signature-256'] as string | undefined)) {
    res.status(401).json({ success: false, error: 'Firma inválida' });
    return;
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(crudo.toString('utf8'));
  } catch {
    // Firmado por Meta pero ilegible: se acepta para que no lo reintente.
    res.status(200).json({ received: true });
    return;
  }

  res.status(200).json({ received: true });
  void procesarEntrante(payload);
});

export default router;
