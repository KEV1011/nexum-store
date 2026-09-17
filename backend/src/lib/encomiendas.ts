/**
 * La encomienda: un pedido intermunicipal que viaja en el despacho de una
 * empresa de transporte.
 *
 * CÓMO ENCAJA CON LO QUE YA EXISTE
 * --------------------------------
 * No se inventa un modelo nuevo, y eso es deliberado: construir `CargoTrip` al
 * lado de `FreightRequest` ya fragmentó la trazabilidad una vez (rastro GPS,
 * gastos y tiempos colgaban de uno; remitos y cuenta de cobro del otro). Aquí
 * se reutiliza lo que ya está y ya concilia:
 *
 *   `CargoTrip`      = el despacho de la empresa (la salida del bus)
 *   `FreightManifest`= el remito: UN destinatario, con su referencia y ciudad
 *   `FreightManifestItem` = los bultos de ese remito, conciliables uno a uno
 *
 * Un pedido intermunicipal se convierte en UN remito de un despacho. Con eso
 * hereda gratis el acta firmada al recibir, la conciliación por bulto con
 * faltantes y averiados, el rastro del recorrido y la cuenta de cobro.
 *
 * POR QUÉ LA ENTREGA LA CIERRA LA RECEPCIÓN DEL REMITO
 * ----------------------------------------------------
 * Así opera de verdad una encomienda en bus: el destinatario va a la taquilla
 * del terminal con su cédula y firma. El remito ya guarda quién recibió, su
 * documento y la foto del acta, así que ese es el cierre real —no un apaño
 * mientras llega la última milla—. Llevarlo hasta la puerta es una mejora
 * ENCIMA de esto, no un requisito para que funcione.
 */

/** Estados en los que un pedido ya no puede subirse a un despacho. */
const TERMINALES = new Set(['DELIVERED', 'CANCELLED']);

/**
 * Estados en los que el comercio ya tiene la mercancía lista para entregarla
 * en la taquilla.
 *
 * `PENDING` NO entra: el negocio todavía no ha aceptado el pedido, y subirlo a
 * un despacho comprometería una mercancía que quizá rechace por no tener
 * existencias.
 */
const LISTOS = new Set(['CONFIRMED', 'PREPARING']);

export interface PedidoParaDespachar {
  status: string;
  isIntercity: boolean;
  originCitySlug: string | null;
  destCitySlug: string | null;
  /** Si ya está subido a otro despacho. */
  tieneRemito: boolean;
}

export interface DespachoDestino {
  /** Plaza de salida del despacho. */
  origen: string | null;
  /** Plaza de llegada del despacho. */
  destino: string | null;
  /** Si el despacho ya salió o ya se facturó, no admite más carga. */
  editable: boolean;
}

/**
 * Por qué NO se puede subir este pedido a un despacho, o null si sí se puede.
 *
 * Devuelve el motivo en vez de un booleano porque quien pulsa el botón es el
 * despachador de la empresa con el bus a punto de salir: «no se puede» a secas
 * le obliga a adivinar, y lo que hará es volver a intentarlo.
 */
export function motivoParaNoDespachar(p: PedidoParaDespachar): string | null {
  if (!p.isIntercity) {
    return 'Ese pedido es una entrega dentro de la ciudad, no una encomienda.';
  }
  if (p.tieneRemito) {
    return 'Ese pedido ya va en otro despacho.';
  }
  if (TERMINALES.has(p.status)) {
    return p.status === 'CANCELLED'
      ? 'Ese pedido está cancelado.'
      : 'Ese pedido ya se entregó.';
  }
  if (!LISTOS.has(p.status)) {
    // Cubre PENDING y los estados de reparto urbano, que en una encomienda no
    // deberían darse: si aparece uno, decirlo es mejor que aceptarlo.
    return p.status === 'PENDING'
      ? 'El negocio todavía no ha aceptado ese pedido.'
      : `Ese pedido está en «${p.status}» y no se puede subir a un despacho.`;
  }
  if (!p.destCitySlug) {
    return 'Ese pedido no tiene ciudad de destino resuelta.';
  }
  return null;
}

/**
 * Por qué este despacho NO puede llevar ese pedido, o null si sí.
 *
 * La comprobación de ruta es lo que impide el error caro: subir a un bus que va
 * a Bogotá una caja que tiene que llegar a Bucaramanga. El destinatario se
 * enteraría un día después y en la ciudad equivocada.
 */
export function motivoParaNoAdmitir(
  p: PedidoParaDespachar,
  d: DespachoDestino,
): string | null {
  if (!d.editable) {
    return 'Ese despacho ya salió o ya se facturó: no admite más carga.';
  }
  // Solo se exige coincidencia de lo que SE SABE. Un despacho sin destino
  // declarado no se rechaza —hay flotas que lo llenan después— pero uno con
  // destino declarado y DISTINTO sí: ese es el error que cuesta.
  if (d.destino && p.destCitySlug && d.destino !== p.destCitySlug) {
    return `Ese despacho va a ${d.destino} y el pedido tiene que llegar a ${p.destCitySlug}.`;
  }
  if (d.origen && p.originCitySlug && d.origen !== p.originCitySlug) {
    return `Ese despacho sale de ${d.origen} y el pedido está en ${p.originCitySlug}.`;
  }
  return null;
}

export interface LineaPedido {
  productName: string;
  quantity: number;
  /** Código del producto si el comercio lo maneja (lote, serie, barras). */
  sku?: string | null;
}

export interface ItemRemito {
  position: number;
  measure: number;
  code: string | null;
  note: string | null;
}

/**
 * Convierte las líneas del pedido en bultos del remito.
 *
 * Un renglón por producto, con la cantidad como medida: así el destinatario
 * concilia «me llegaron 2 de 3 camisetas» y queda constancia de cuál faltó, que
 * es para lo que sirve el remito. Meter todo en un bulto de «1 paquete»
 * ahorraría una línea y perdería justo eso.
 */
export function itemsDeRemito(lineas: LineaPedido[]): ItemRemito[] {
  return lineas.map((l, i) => ({
    position: i + 1,
    // La cantidad manda; cero o negativo no existe en un pedido válido, pero si
    // llegara, un bulto de medida cero es inconciliable: se sube a uno.
    measure: Math.max(1, Math.round(l.quantity)),
    code: l.sku?.trim() || null,
    note: l.productName,
  }));
}

/** Total de bultos del remito, que es lo que se sella al despachar. */
export function totalBultos(items: ItemRemito[]): number {
  return items.reduce((s, i) => s + i.measure, 0);
}
