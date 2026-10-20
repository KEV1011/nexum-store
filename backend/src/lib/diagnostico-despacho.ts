/**
 * El motivo, en palabras, por el que un conductor NO recibiría una oferta.
 *
 * Vive suelto y puro porque es lo que lee el operador para decidir qué
 * arreglar, y un motivo equivocado manda a arreglar lo que no está roto. El
 * orden es el del despacho (`findNearestAvailableDrivers`): se dice el PRIMER
 * filtro que falla, que es el único que hace falta corregir primero.
 */

/** Qué tipo de servicio se diagnostica: cada uno tiene su propio interruptor. */
export type TipoDiagnostico = 'trip' | 'errand' | 'order';

const NOMBRE_TIPO: Record<TipoDiagnostico, string> = {
  trip: 'Pasajeros',
  errand: 'Encargos (mandados)',
  order: 'Encargos (pedidos)',
};

/**
 * El primer filtro que falla, en el MISMO orden que el despacho los mira.
 * Suelto y puro para poder probarlo: es lo que el operador lee para decidir
 * qué arreglar, y un motivo equivocado manda a arreglar lo que no está roto.
 */
export function motivoDeDiagnostico(c: {
  status: string;
  enViajeVacio: boolean;
  isVerified: boolean;
  bloqueado: boolean;
  acceptsKind: boolean;
  tipo: TipoDiagnostico;
  geoAge: number | null;
  fresh: boolean;
  dist: number | null;
  inRadius: boolean;
}): string | null {
  if (c.status === 'OFFLINE') return 'Desconectado';
  if (c.status === 'ON_TRIP') {
    return c.enViajeVacio
      ? 'Marcado «en viaje» sin ningún servicio abierto (se corrige solo con su próximo latido de GPS)'
      : 'En un servicio (solo recibe encadenados al terminar)';
  }
  if (c.status !== 'ONLINE') return `Estado ${c.status}`;
  if (!c.isVerified) return 'No verificado';
  if (c.bloqueado) return 'Documentos vencidos';
  if (!c.acceptsKind) return `Tiene apagado «${NOMBRE_TIPO[c.tipo]}» en sus preferencias`;
  if (c.geoAge === null || c.dist === null) return 'Nunca ha reportado GPS';
  if (!c.fresh) return `Sin GPS hace ${Math.round(c.geoAge / 60)} min (la app no está enviando posición)`;
  if (!c.inRadius) return `A ${(c.dist / 1000).toFixed(1)} km: fuera del radio de 5 km`;
  return null;
}

