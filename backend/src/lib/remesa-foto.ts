/**
 * Leer una remesa desde la foto del papel.
 *
 * QUÉ AHORRA. Hoy, al subir una remesa, el conductor teclea el número y la
 * fecha con el papel en una mano y el teléfono en la otra, muchas veces en
 * la bodega o en la vía. Son los dos datos que de verdad hacen falta para
 * que el documento sirva: sin número no se puede citar en la cuenta de
 * cobro, y sin fecha no se puede ordenar nada.
 *
 * LO QUE ESTO NO HACE, Y ES LO MÁS IMPORTANTE. No guarda nada. PROPONE, y
 * la persona aprueba. Es la misma regla que la carta del restaurante, y
 * aquí pesa más: un número de remesa equivocado viaja hasta la cuenta de
 * cobro, el cliente no lo encuentra en sus papeles y la factura se devuelve.
 *
 * DE AHÍ LA REGLA QUE MANDA SOBRE TODAS: **ante la duda, se deja vacío**.
 * Un campo en blanco es medio minuto de teclear; un número inventado es una
 * factura devuelta tres semanas después, cuando ya nadie recuerda de dónde
 * salió. Si hay dos candidatos a número, no se elige ninguno.
 *
 * El motor es el mismo lector de texto que la carta (`carta-ocr.service`):
 * leer un papel impreso es la misma capacidad contratada, y tener dos
 * proveedores para lo mismo obligaría a configurar la misma llave dos veces
 * y a que una se quedara atrás.
 */

export interface RemesaLeida {
  /** El número del documento, tal cual aparece. Vacío = no se pudo. */
  numero?: string;
  /** La fecha del documento en ISO (solo el día). */
  fechaISO?: string;
  /** A quién va dirigida, si el papel lo dice con una etiqueta clara. */
  destinatario?: string;
  /**
   * Qué NO se pudo sacar y por qué, para enseñarlo al lado del formulario.
   * Sin esto, un campo vacío se lee como «el lector no sirve» en vez de
   * como «esto lo tienes que escribir tú».
   */
  avisos: string[];
}

/**
 * Las etiquetas con las que un papel colombiano anuncia su número.
 *
 * Lista CERRADA a propósito: coger «cualquier número grande del papel»
 * agarraría el NIT, el teléfono o el valor del flete. Se exige que el
 * número venga precedido de una etiqueta que lo nombre.
 */
const ETIQUETAS_NUMERO = [
  'remesa', 'remision', 'remisión', 'manifiesto', 'guia', 'guía',
  'cuenta de cobro', 'factura', 'documento', 'planilla',
];

/**
 * Lo que puede haber entre la etiqueta y el número.
 *
 * SIN DÍGITOS y como mucho 25 caracteres. Eso deja pasar lo que de verdad
 * se escribe —«REMESA TERRESTRE DE CARGA No.», «Manifiesto de carga N°»,
 * «Guía:»— y a la vez impide que el relleno salte por encima del papel
 * hasta el primer número que encuentre, que sería el NIT o el valor del
 * flete. Es perezoso: coge el número MÁS CERCANO a la etiqueta.
 */
const RELLENO = String.raw`[^\d\n]{0,25}?`;

/**
 * Busca el número del documento.
 *
 * Devuelve `undefined` cuando hay CERO o MÁS DE UN candidato distinto. Lo
 * segundo es lo que de verdad protege: un papel que dice «REMESA 066» y
 * «FACTURA 1234» tiene dos números, y elegir uno por nosotros es
 * exactamente el error caro.
 */
export function numeroDeRemesa(texto: string): string | undefined {
  const encontrados = new Set<string>();
  const plano = texto.replace(/[ \t]+/g, ' ');
  for (const etiqueta of ETIQUETAS_NUMERO) {
    const re = new RegExp(
      `${etiqueta}${RELLENO}([A-Z]{0,4}-?\\d{1,10})(?![\\d-])`,
      'gi',
    );
    for (const m of plano.matchAll(re)) {
      const v = (m[1] ?? '').trim().toUpperCase();
      // Un «número» de un solo dígito casi siempre es basura de la lectura
      // (una viñeta, un número de página). Los consecutivos reales tienen
      // al menos dos.
      if (/\d/.test(v) && v.replace(/\D/g, '').length >= 2) encontrados.add(v);
    }
  }
  return encontrados.size === 1 ? [...encontrados][0] : undefined;
}

/**
 * Busca la fecha del documento.
 *
 * **Día primero, siempre.** En Colombia 03/04/2026 es el 3 de abril, no el
 * 4 de marzo. No se intenta adivinar por contexto: una convención fija y
 * escrita es mejor que una heurística que acierte el 80 % de las veces y
 * cambie el mes del 20 % restante sin que nadie lo note.
 *
 * Una fecha FUTURA se descarta: el papel ya está en la mano, así que es un
 * dedazo del lector o del año, y una remesa fechada mañana no sirve en un
 * retén. (El mismo criterio que `saneaDatosDocumento`.)
 */
export function fechaDeRemesa(texto: string, ahora = new Date()): string | undefined {
  const re = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g;
  const limite = ahora.getTime() + 24 * 3600 * 1000;
  const validas: string[] = [];
  for (const m of texto.matchAll(re)) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    let a = Number(m[3]);
    if (a < 100) a += 2000;
    if (d < 1 || d > 31 || mes < 1 || mes > 12) continue;
    // Año de cuatro cifras fuera de lo razonable: es una lectura mala.
    if (a < 2015 || a > ahora.getFullYear() + 1) continue;
    const f = new Date(Date.UTC(a, mes - 1, d));
    // `getUTCDate` distinto = el día no existe en ese mes (31 de febrero).
    if (f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1) continue;
    if (f.getTime() > limite) continue;
    validas.push(f.toISOString().slice(0, 10));
  }
  const unicas = new Set(validas);
  // Varias fechas distintas en el papel (emisión, vencimiento, entrega) y no
  // hay forma de saber cuál es la del documento: se deja al humano.
  return unicas.size === 1 ? [...unicas][0] : undefined;
}

/** Etiquetas con las que un papel nombra a quién va dirigido. */
const ETIQUETAS_DESTINATARIO = [
  'destinatario', 'cliente', 'senor', 'señor', 'senores', 'señores',
  'razon social', 'razón social',
];

/**
 * Busca el destinatario.
 *
 * Solo con etiqueta explícita y en la MISMA línea: coger «la línea que
 * parece un nombre» traería el remitente, la transportadora o el nombre del
 * conductor, y un destinatario equivocado manda la mercancía a otro sitio.
 */
export function destinatarioDeRemesa(texto: string): string | undefined {
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    for (const etiqueta of ETIQUETAS_DESTINATARIO) {
      // `(?![a-záéíóúñ])` y no `\b`: en JS el límite de palabra se basa en
      // `\w` ASCII, así que con «señores» vería un corte dentro de la ñ.
      // Sin esto, «SEÑORES Distribuidora» casaba con la etiqueta «señor» y
      // el destinatario salía como «ES Distribuidora».
      const re = new RegExp(`^${etiqueta}(?![a-záéíóúñ])\\s*:?\\s*(.+)$`, 'i');
      const m = re.exec(l);
      if (!m) continue;
      const v = (m[1] ?? '').trim().replace(/\s+/g, ' ');
      // Dos caracteres no son un nombre, y una línea larguísima es que la
      // etiqueta estaba dentro de un párrafo.
      if (v.length >= 3 && v.length <= 80) return v;
    }
  }
  return undefined;
}

/**
 * Lo que se le propone a la persona a partir del texto leído.
 *
 * Cada campo que no se pudo sacar lleva su aviso. El aviso importa tanto
 * como el dato: sin él, tres campos vacíos se leen como «el lector está
 * roto» y la persona repite la foto, cuando lo que pasa es que el papel no
 * dice el número con una etiqueta reconocible.
 */
export function leerRemesa(texto: string, ahora = new Date()): RemesaLeida {
  const r: RemesaLeida = { avisos: [] };

  const numero = numeroDeRemesa(texto);
  if (numero) r.numero = numero;
  else r.avisos.push('No encontramos un número claro en el papel. Escríbelo tú.');

  const fecha = fechaDeRemesa(texto, ahora);
  if (fecha) r.fechaISO = fecha;
  else r.avisos.push('No encontramos una sola fecha clara. Escríbela tú.');

  const dest = destinatarioDeRemesa(texto);
  if (dest) r.destinatario = dest;

  if (texto.trim().length === 0) {
    return {
      avisos: [
        'No se leyó ningún texto en la foto. Prueba con más luz, de frente '
        + 'y que el papel llene la pantalla.',
      ],
    };
  }
  return r;
}
