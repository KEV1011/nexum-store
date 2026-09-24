-- Las vans recogen en la casa; los buses, no.
--
-- Nullable A PROPÓSITO: null significa «la empresa no lo declaró» y entonces se
-- deduce del vehículo (VAN sí, buseta y bus no, salida sin vehículo declarado
-- sí, que es como han funcionado todas hasta hoy). Poner un default fijo
-- mentiría para la mitad de las salidas que ya existen: o un bus prometiendo
-- recoger en casa, o una van negándolo.

-- AlterTable
ALTER TABLE "pooled_trips" ADD COLUMN     "doorToDoor" BOOLEAN;

