-- El OTP es para login/registro: el teléfono puede no existir todavía en
-- `users` (usuario nuevo). La FK otp_sessions.phone -> users.phone rompía el
-- envío de OTP para cualquier número no registrado (error 400 al enviar OTP).
-- Se elimina la restricción; `phone` queda como columna simple con índice.
ALTER TABLE "otp_sessions" DROP CONSTRAINT IF EXISTS "otp_sessions_phone_fkey";
