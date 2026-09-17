/**
 * Normaliza una dirección colombiana para que Google la entienda.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * El dueño de un local escribe su dirección como está en el recibo de la luz:
 * «carrera 4a#10-53». Places Autocomplete no predice eso —está afinado para
 * sitios con nombre y direcciones ya conocidas— y el buscador del portal
 * respondía «No encontramos esa dirección» con una dirección que existe.
 *
 * Quien SÍ resuelve ese formato es la Geocoding API, pero le va mucho mejor con
 * la forma canónica: «Carrera 4A # 10-53». Eso es todo lo que hace este módulo.
 *
 * LO QUE NO HACE
 * --------------
 * No inventa. Si el texto no parece una dirección colombiana se devuelve
 * limpio de espacios y nada más: es mejor que Google no encuentre algo a que
 * nosotros le cambiemos la calle al negocio.
 */

/**
 * Las vías, con las abreviaturas que de verdad se escriben.
 *
 * Están sacadas de cómo se abrevia en los recibos y en los letreros, no de un
 * estándar: «kra» y «k» no son oficiales y aparecen a diario.
 */
const VIAS: Array<[RegExp, string]> = [
  [/^(carrera|carr|cra|cr|kra|kr|k)\b\.?/i, 'Carrera'],
  [/^(calle|cll|cl|cle|c)\b\.?/i, 'Calle'],
  [/^(avenida|aven|av)\b\.?/i, 'Avenida'],
  [/^(diagonal|diag|dg)\b\.?/i, 'Diagonal'],
  [/^(transversal|transv|trans|tv|tr)\b\.?/i, 'Transversal'],
  [/^(manzana|mz|mza)\b\.?/i, 'Manzana'],
  [/^(autopista|auto)\b\.?/i, 'Autopista'],
  [/^(circunvalar|circ)\b\.?/i, 'Circunvalar',],
];

/**
 * Cómo se escribe «número» antes del número de la placa.
 *
 * `#` es lo normal, pero en los recibos sale de todas estas formas y Google
 * las trata distinto.
 */
// OJO CON EL ORDEN: las alternativas largas van PRIMERO. Con `num` antes que
// `numero`, la expresión se comía el prefijo y «Calle 5 numero 3-40» salía como
// «Calle 5 # ero 3-40».
const MARCA_NUMERO = /\s*(?:#|número|numero|nro\.?|num\.?|n[°ºo]\.?)\s*/i;

/**
 * Deja la dirección en forma canónica: «Carrera 4A # 10-53».
 *
 * Idempotente: pasarle una dirección ya normalizada la devuelve igual.
 */
export function normalizaDireccion(cruda: string): string {
  const base = (cruda ?? '').trim().replace(/\s+/g, ' ');
  if (!base) return '';

  // La vía es siempre lo primero. Si no se reconoce, no se toca nada más: el
  // texto puede ser «Centro Comercial Ventura», que Places sí resuelve.
  let via: string | null = null;
  let resto = base;
  for (const [patron, canonica] of VIAS) {
    const m = base.match(patron);
    if (m) {
      via = canonica;
      resto = base.slice(m[0].length).trim();
      break;
    }
  }
  if (!via) return base;

  // El marcador de número, con espacios a los lados. Sin ellos, «4a#10-53» le
  // llega a Google como un solo token y falla.
  resto = resto.replace(MARCA_NUMERO, ' # ');

  // La letra del número de la vía en mayúscula: «4a» → «4A». Es como aparece
  // en la nomenclatura oficial, y Google la desambigua mejor.
  resto = resto.replace(/\b(\d+)\s*([a-z])\b/gi, (_s, n, l) => `${n}${String(l).toUpperCase()}`);

  // Si la vía tenía número pero no marcador («Carrera 4A 10-53»), se le pone:
  // dos grupos de dígitos separados solo por espacio son vía y placa.
  const partes = `${via} ${resto}`.replace(/\s+/g, ' ').trim();
  if (!partes.includes('#')) {
    const m = partes.match(/^(\S+ \d+[A-Z]?) (\d+\s*-\s*\d+)(.*)$/);
    if (m) return `${m[1]} # ${m[2].replace(/\s*-\s*/, '-')}${m[3]}`.trim();
  }

  // El guion de la placa, sin espacios: «10 - 53» → «10-53».
  return partes.replace(/(\d)\s*-\s*(\d)/g, '$1-$2');
}

/**
 * Si el texto parece una dirección con nomenclatura, y no el nombre de un sitio.
 *
 * Se usa para decidir si vale la pena intentar geocodificar cuando el
 * autocompletado no devolvió nada: con «Panadería La Espiga» no tiene sentido,
 * con «Calle 5 # 3-40» sí.
 */
export function pareceDireccion(texto: string): boolean {
  const t = (texto ?? '').trim();
  if (t.length < 5) return false;
  const conVia = VIAS.some(([p]) => p.test(t));
  // Una vía reconocida y al menos un número: sin número no hay dónde ir.
  return conVia && /\d/.test(t);
}
