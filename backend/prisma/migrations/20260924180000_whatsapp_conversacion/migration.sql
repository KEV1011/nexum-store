-- La conversación de WhatsApp: por dónde va cada teléfono.
--
-- Antes no hacía falta y era correcto: con dos pasos —pedir ubicación, mandar
-- enlace— bastaba mirar la fila del mensaje anterior en `whatsapp_inbound`.
-- Ahora el pedido entero ocurre dentro del chat (origen, destino, precio y
-- confirmación), así que hay que saber qué se está esperando de cada quien.
--
-- Una fila por teléfono, que se reescribe: esto es dónde está esa persona
-- AHORA, no un historial. El rastro de qué se decidió con cada mensaje sigue
-- en `whatsapp_inbound`, y duplicarlo aquí daría dos versiones de lo mismo.
CREATE TABLE "whatsapp_conversations" (
  "phone"       TEXT NOT NULL,
  "state"       TEXT NOT NULL DEFAULT 'inicio',
  "originLat"   DOUBLE PRECISION,
  "originLng"   DOUBLE PRECISION,
  "originLabel" TEXT,
  "destText"    TEXT,
  "destLat"     DOUBLE PRECISION,
  "destLng"     DOUBLE PRECISION,
  "category"    TEXT,
  "fare"        INTEGER,
  "tripId"      TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("phone")
);
