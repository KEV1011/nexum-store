-- Enable PostGIS. On the postgis/postgis image (or any superuser-owned DB) this
-- creates the extension; where it already exists (e.g. a DBA pre-created it for
-- a non-superuser role) IF NOT EXISTS makes this a harmless no-op.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Geographic position of the driver for nearest-neighbour matching.
-- Managed outside Prisma (declared Unsupported in schema.prisma); written and
-- queried via raw SQL in matching.service.ts.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "geo" geography(Point, 4326);

-- GIST index powers ST_DWithin / ST_Distance radius searches.
CREATE INDEX IF NOT EXISTS "drivers_geo_idx" ON "drivers" USING GIST ("geo");
