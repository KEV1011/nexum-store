-- El equipo del negocio: meseros, cocina, caja y encargado con su propio
-- acceso al portal, y quién tomó cada pedido en la mesa.
CREATE TYPE "StaffRole" AS ENUM ('ENCARGADO', 'CAJA', 'MESERO', 'COCINA');

CREATE TABLE "business_staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_staff_token_key" ON "business_staff"("token");

CREATE INDEX "business_staff_businessId_idx" ON "business_staff"("businessId");

ALTER TABLE "business_staff" ADD CONSTRAINT "business_staff_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "takenByStaffId" TEXT;
ALTER TABLE "orders" ADD COLUMN "takenByName" TEXT;
