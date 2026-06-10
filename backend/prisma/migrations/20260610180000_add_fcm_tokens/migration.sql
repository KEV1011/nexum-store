-- Token FCM por dispositivo para notificaciones push (conductores y clientes).
ALTER TABLE "drivers" ADD COLUMN "fcmToken" TEXT;
ALTER TABLE "users" ADD COLUMN "fcmToken" TEXT;
