-- Los códigos OTP se crean durante el login/registro tanto de conductores como
-- de clientes, antes de que exista necesariamente el usuario. La FK
-- otp_sessions.phone -> users.phone obligaba a que cada teléfono fuera un
-- usuario registrado, así que el login del conductor (que es un driver, no un
-- user) fallaba con un error de constraint (500). Se elimina la FK; `phone`
-- queda como columna simple.
ALTER TABLE "otp_sessions" DROP CONSTRAINT IF EXISTS "otp_sessions_phone_fkey";
