// ── La caja del turno ──────────────────────────────────────────────────────
//
// LA PREGUNTA QUE RESPONDE: al final del turno, ¿lo que hay en el cajón es lo
// que debería? La diferencia entre lo contado y lo esperado es el dato — un
// faltante de veinte mil repetido tres días no es mala suerte.
//
// LA REGLA QUE LO HACE ÚTIL, y la que más se hace mal: **solo cuenta el
// EFECTIVO**. Lo que se pagó con tarjeta o con Nequi no está en el cajón, y
// meterlo daría un faltante gigante todos los días; a la semana nadie miraría
// el arqueo y la función sobraría. Lo mismo con los DOMICILIOS pagados en
// efectivo: esa plata la cobró el repartidor en la puerta del cliente y vive
// en su saldo, no en el cajón del local.
//
// Entra al cajón, entonces: las cuentas de mesa y los pedidos para llevar que
// se cobraron EN EFECTIVO durante el turno.

/** Un cobro, para lo poco que la caja necesita saber. */
export interface CobroDeTurno {
  /** Lo que se cobró. */
  monto: number;
  /** Con qué se pagó. Null = no se declaró. */
  metodo: string | null;
}

/**
 * Los métodos que dejan billetes en el cajón.
 *
 * Lista CERRADA a propósito: si se tratara «lo que no reconozco» como
 * efectivo, un método nuevo (un código QR de un banco, por ejemplo) empezaría
 * a sumar al esperado sin que nadie lo decidiera, y el arqueo daría faltante
 * todos los días sin motivo aparente.
 */
const EN_EFECTIVO = ['efectivo', 'cash'];

export function esEfectivo(metodo: string | null): boolean {
  if (!metodo) {
    // Sin método declarado se asume EFECTIVO. En un restaurante lo que no se
    // anota es lo que se pagó en la mano; darlo por electrónico haría que la
    // caja esperara menos de lo que tiene y el sobrante parecería un error
    // del cajero. Es el mismo criterio que el saldo del conductor.
    return true;
  }
  return EN_EFECTIVO.includes(metodo.trim().toLowerCase());
}

/** Lo que entró al cajón durante el turno. */
export function efectivoDelTurno(cobros: CobroDeTurno[]): number {
  return cobros.filter((c) => esEfectivo(c.metodo)).reduce((s, c) => s + c.monto, 0);
}

/** Lo que se cobró por otros medios. Se enseña aparte, no suma al cajón. */
export function electronicoDelTurno(cobros: CobroDeTurno[]): number {
  return cobros.filter((c) => !esEfectivo(c.metodo)).reduce((s, c) => s + c.monto, 0);
}

/** Lo que DEBERÍA haber en el cajón: la base más lo cobrado en efectivo. */
export function esperadoEnCaja(base: number, cobros: CobroDeTurno[]): number {
  return base + efectivoDelTurno(cobros);
}

/**
 * Contado menos esperado. Negativo = falta plata.
 *
 * Se redondea al peso: el cajero cuenta billetes y monedas, no céntimos, y
 * una diferencia de 0,3 pesos arrastrada de un cálculo haría que NINGÚN
 * arqueo cuadrara nunca.
 */
export function diferenciaDeCaja(contado: number, esperado: number): number {
  return Math.round(contado - esperado);
}

/**
 * Cómo se lee la diferencia.
 *
 * El faltante se dice con su palabra, no con un signo menos que alguien puede
 * pasar por alto. Y el cuadre exacto se celebra: es lo normal y verlo escrito
 * es lo que hace que el cajero siga contando bien.
 */
export function veredictoDeCaja(diferencia: number): {
  estado: 'cuadra' | 'sobra' | 'falta';
  texto: string;
} {
  if (diferencia === 0) return { estado: 'cuadra', texto: 'La caja cuadra exacta' };
  if (diferencia > 0) return { estado: 'sobra', texto: `Sobran ${diferencia}` };
  return { estado: 'falta', texto: `Faltan ${Math.abs(diferencia)}` };
}

/** ¿Se puede abrir caja? */
export function motivoParaNoAbrir(hayAbierta: boolean): string | null {
  if (hayAbierta) {
    // Dos cajas abiertas reparten las ventas del turno entre dos arqueos:
    // ninguno cuadra, y el faltante de una es el sobrante de la otra.
    return 'Ya hay una caja abierta. Ciérrala antes de abrir otra.';
  }
  return null;
}

/** ¿Se puede cerrar? */
export function motivoParaNoCerrar(c: {
  cerrada: boolean;
  contado: number | null;
}): string | null {
  if (c.cerrada) return 'Esta caja ya está cerrada.';
  if (c.contado == null || !Number.isFinite(c.contado) || c.contado < 0) {
    // Sin contar no hay arqueo: cerrar «a ojo» daría una diferencia
    // inventada, que es peor que no tener la función.
    return 'Cuenta el efectivo del cajón antes de cerrar.';
  }
  return null;
}

/**
 * Avisos al cerrar que NO bloquean.
 *
 * Las mesas abiertas son el caso típico: esa plata todavía no entró, así que
 * el arqueo dará faltante respecto de lo que el local vendió. Pero bloquear
 * el cierre sería peor — el turno de la mañana deja mesas al de la tarde
 * todos los días, y el cajero no puede quedarse hasta que el último cliente
 * pague.
 */
export function avisosAlCerrar(mesasAbiertas: number): string[] {
  if (mesasAbiertas === 0) return [];
  return [
    mesasAbiertas === 1
      ? 'Hay 1 mesa sin cobrar. Lo que consuma no entra en este turno.'
      : `Hay ${mesasAbiertas} mesas sin cobrar. Lo que consuman no entra en este turno.`,
  ];
}
