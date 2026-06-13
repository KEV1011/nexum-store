-- Números de asiento específicos por reserva, para el mapa de asientos
-- posicional (el pasajero elige qué puesto ocupa). Vacío = reserva por conteo.
ALTER TABLE "seat_bookings"
  ADD COLUMN IF NOT EXISTS "seatNumbers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
