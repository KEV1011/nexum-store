-- El negocio controla su tienda: horario que cierra de verdad, pausa temporal,
-- promoción con vigencia — y una calificación que deja de mentir.

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "hours" JSONB,
ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedUntil" TIMESTAMP(3),
ADD COLUMN     "promoFrom" TIMESTAMP(3),
ADD COLUMN     "promoUntil" TIMESTAMP(3),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "rating" DROP DEFAULT;

-- El 5.0 que traen todas las filas es el valor POR DEFECTO de la columna: no
-- salió de ninguna calificación, porque nunca hubo forma de calificar un
-- negocio. Dejarlo sería seguir enseñando una nota que nadie dio, así que se
-- borra. Sin calificaciones, la app dirá «Nuevo» en vez de inventar un número.
UPDATE "businesses" SET "rating" = NULL WHERE "ratingCount" = 0;
