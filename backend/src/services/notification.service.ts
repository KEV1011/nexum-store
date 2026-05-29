import { WhatsAppNotification, WhatsAppTemplateId, DeliveryOrderSummaryDTO } from '../types';

// ─── WhatsApp message templates (Meta Business API format) ───────────────────

const TEMPLATES: Record<WhatsAppTemplateId, (vars: Record<string, string>) => string> = {
  driver_arriving: (v) =>
    `🛵 *Nexum Envíos*\n\n` +
    `El conductor *${v['driverName']}* está en camino a recoger el pedido *${v['orderRef']}* de tu local.\n\n` +
    `ETA: ~${v['eta']} minutos\n` +
    `📱 ${v['driverPhone']}`,

  order_picked_up: (v) =>
    `📦 *Nexum Envíos — Pedido recogido*\n\n` +
    `El pedido *${v['orderRef']}* para *${v['customerName']}* salió de tu local.\n\n` +
    `📸 Foto de verificación registrada\n` +
    `🕐 ${v['time']}\n\n` +
    `El conductor va en camino al cliente. Tu pedido está protegido.`,

  order_delivered: (v) =>
    `✅ *Nexum Envíos — Entregado*\n\n` +
    `El pedido *${v['orderRef']}* fue entregado a *${v['customerName']}*.\n\n` +
    `🕐 Hora de entrega: ${v['time']}\n` +
    `${v['hasSignature'] === 'true' ? '✍️ Firmado digitalmente' : '📸 Foto de entrega registrada'}\n\n` +
    `Ver cadena de custodia completa:\n` +
    `${v['portalUrl']}`,
};

// ─── In-memory log (replace with Twilio/Meta API in production) ──────────────

const sentNotifications: WhatsAppNotification[] = [];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

const service = {
  /**
   * Sends a WhatsApp notification (mock — logs to console).
   * In production: replace body with Twilio or Meta Cloud API call.
   */
  async send(
    to: string,
    templateId: WhatsAppTemplateId,
    variables: Record<string, string>,
  ): Promise<void> {
    const message = TEMPLATES[templateId](variables);
    const notification: WhatsAppNotification = {
      to,
      templateId,
      variables,
      sentAt: new Date(),
    };

    sentNotifications.push(notification);

    // Production: await twilioClient.messages.create({ to, from: WA_FROM, body: message })
    console.log(`[WhatsApp → ${to}]\n${message}\n`);
  },

  async notifyDriverArriving(
    whatsapp: string,
    order: DeliveryOrderSummaryDTO,
    eta: number,
  ): Promise<void> {
    await this.send(whatsapp, 'driver_arriving', {
      driverName: order.driverName,
      orderRef: order.orderRef,
      driverPhone: order.driverPhone,
      eta: String(eta),
    });
  },

  async notifyOrderPickedUp(
    whatsapp: string,
    order: DeliveryOrderSummaryDTO,
  ): Promise<void> {
    await this.send(whatsapp, 'order_picked_up', {
      orderRef: order.orderRef,
      customerName: order.customerName,
      time: formatTime(new Date(order.pickedUpAt ?? new Date())),
    });
  },

  async notifyOrderDelivered(
    whatsapp: string,
    order: DeliveryOrderSummaryDTO,
    portalUrl: string,
  ): Promise<void> {
    await this.send(whatsapp, 'order_delivered', {
      orderRef: order.orderRef,
      customerName: order.customerName,
      time: formatTime(new Date(order.deliveredAt ?? new Date())),
      hasSignature: String(order.hasSignature),
      portalUrl,
    });
  },

  getSentLog(): WhatsAppNotification[] {
    return [...sentNotifications];
  },
};

export function getNotificationService() {
  return service;
}
