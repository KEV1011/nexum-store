-- Municipios como TABLA, no como enum.
--
-- El enum tenía siete valores escritos a mano: cada pueblo nuevo exigía una
-- migración y un despliegue, y las empresas de transporte mueven a todos los
-- pueblos. Ahora agregar uno es insertar una fila.
--
-- Las columnas se convierten EN SITIO (PAMPLONA → 'pamplona'): un DROP+ADD
-- habría borrado el origen y el destino de todas las reservas existentes.

-- CreateTable
CREATE TABLE "municipalities" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "daneCode" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "municipalities_department_idx" ON "municipalities"("department");
CREATE INDEX "municipalities_name_idx" ON "municipalities"("name");

-- AlterTable: enum → texto, preservando los datos.
ALTER TABLE "intercity_bookings" ALTER COLUMN "origin" TYPE TEXT USING lower("origin"::text);
ALTER TABLE "intercity_bookings" ALTER COLUMN "destination" TYPE TEXT USING lower("destination"::text);
ALTER TABLE "pooled_trips" ALTER COLUMN "origin" TYPE TEXT USING lower("origin"::text);
ALTER TABLE "pooled_trips" ALTER COLUMN "destination" TYPE TEXT USING lower("destination"::text);

-- DropEnum
DROP TYPE "IntercityCity";

-- Siembra: los 40 municipios de Norte de Santander (donde opera el piloto) más
-- las capitales a las que ya se viaja. Las coordenadas son el centroide del
-- casco urbano, aproximado: sirven de sobra para un radio de matching de 25 km,
-- y se pueden corregir desde el panel sin desplegar nada.
INSERT INTO "municipalities" ("slug", "name", "department", "lat", "lng") VALUES
  ('pamplona',           'Pamplona',            'Norte de Santander',  7.3754, -72.6486),
  ('cucuta',             'Cúcuta',              'Norte de Santander',  7.8939, -72.5078),
  ('los-patios',         'Los Patios',          'Norte de Santander',  7.8339, -72.5064),
  ('villa-del-rosario',  'Villa del Rosario',   'Norte de Santander',  7.8339, -72.4739),
  ('el-zulia',           'El Zulia',            'Norte de Santander',  7.9364, -72.6031),
  ('san-cayetano',       'San Cayetano',        'Norte de Santander',  7.8756, -72.6250),
  ('puerto-santander',   'Puerto Santander',    'Norte de Santander',  8.3617, -72.4083),
  ('chinacota',          'Chinácota',           'Norte de Santander',  7.6047, -72.6006),
  ('bochalema',          'Bochalema',           'Norte de Santander',  7.6122, -72.6486),
  ('durania',            'Durania',             'Norte de Santander',  7.7178, -72.6644),
  ('ragonvalia',         'Ragonvalia',          'Norte de Santander',  7.5761, -72.4772),
  ('herran',             'Herrán',              'Norte de Santander',  7.5011, -72.4933),
  ('toledo',             'Toledo',              'Norte de Santander',  7.3092, -72.4808),
  ('labateca',           'Labateca',            'Norte de Santander',  7.2983, -72.4967),
  ('chitaga',            'Chitagá',             'Norte de Santander',  7.1364, -72.6667),
  ('silos',              'Silos',               'Norte de Santander',  7.2003, -72.7581),
  ('mutiscua',           'Mutiscua',            'Norte de Santander',  7.3006, -72.7450),
  ('cacota',             'Cácota',              'Norte de Santander',  7.2669, -72.6386),
  ('pamplonita',         'Pamplonita',          'Norte de Santander',  7.4361, -72.6389),
  ('salazar',            'Salazar de Las Palmas','Norte de Santander', 7.7736, -72.8114),
  ('arboledas',          'Arboledas',           'Norte de Santander',  7.6425, -72.8000),
  ('cucutilla',          'Cucutilla',           'Norte de Santander',  7.5406, -72.7767),
  ('gramalote',          'Gramalote',           'Norte de Santander',  7.8917, -72.7981),
  ('lourdes',            'Lourdes',             'Norte de Santander',  7.9469, -72.8419),
  ('villa-caro',         'Villa Caro',          'Norte de Santander',  7.9147, -72.9744),
  ('santiago',           'Santiago',            'Norte de Santander',  7.8636, -72.7169),
  ('sardinata',          'Sardinata',           'Norte de Santander',  8.0806, -72.8022),
  ('bucarasica',         'Bucarasica',          'Norte de Santander',  8.0417, -72.8681),
  ('tibu',               'Tibú',                'Norte de Santander',  8.6392, -72.7358),
  ('el-tarra',           'El Tarra',            'Norte de Santander',  8.5764, -73.0872),
  ('convencion',         'Convención',          'Norte de Santander',  8.4708, -73.3389),
  ('teorama',            'Teorama',             'Norte de Santander',  8.4372, -73.2872),
  ('el-carmen',          'El Carmen',           'Norte de Santander',  8.5100, -73.4569),
  ('san-calixto',        'San Calixto',         'Norte de Santander',  8.4022, -73.2081),
  ('hacari',             'Hacarí',              'Norte de Santander',  8.3222, -73.1489),
  ('la-playa',           'La Playa de Belén',   'Norte de Santander',  8.2131, -73.2419),
  ('abrego',             'Ábrego',              'Norte de Santander',  8.0797, -73.2222),
  ('ocana',              'Ocaña',               'Norte de Santander',  8.2375, -73.3561),
  ('cachira',            'Cachirá',             'Norte de Santander',  7.7419, -73.0489),
  ('la-esperanza',       'La Esperanza',        'Norte de Santander',  7.6394, -73.3175),
  -- Capitales y destinos frecuentes fuera del departamento.
  ('bucaramanga',        'Bucaramanga',         'Santander',           7.1193, -73.1227),
  ('malaga',             'Málaga',              'Santander',           6.6983, -72.7333),
  ('bogota',             'Bogotá',              'Cundinamarca',        4.7110, -74.0721),
  ('valledupar',         'Valledupar',          'Cesar',              10.4631, -73.2532),
  ('aguachica',          'Aguachica',           'Cesar',               8.3094, -73.6144)
ON CONFLICT ("slug") DO NOTHING;
