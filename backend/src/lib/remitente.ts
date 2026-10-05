/**
 * Quién manda el envío y qué declara que va dentro.
 *
 * POR QUÉ ESTO NO ES UN FORMULARIO MÁS
 * ------------------------------------
 * Hoy un envío guarda `cargoDescription`, texto libre, y el nombre de la
 * CUENTA que lo pidió. Con eso, si en la carretera abren un camión y dentro
 * hay algo que no debería ir, la plataforma no puede decir quién lo entregó
 * ni qué dijo que era. Operando desde Norte de Santander eso no es un hueco
 * de producto: es exposición penal real para el conductor, para la empresa
 * de transporte y para nosotros.
 *
 * Quien responde por el contenido es el REMITENTE, y el remitente no es
 * siempre el titular de la cuenta: muchas veces es el bodeguero, el
 * empleado o el vecino que lleva el paquete. Por eso se pregunta aparte.
 *
 * LO QUE ESTO SÍ HACE Y LO QUE NO
 * -------------------------------
 * Hace: deja constancia de quién entregó, con documento; de qué declaró;
 * y de que se le mostró la lista de lo que no se transporta y la aceptó.
 *
 * NO hace: comprobar que sea verdad. Nadie puede. El valor de esto es
 * exactamente el de una constancia — que quede por escrito quién dijo qué,
 * para que la responsabilidad caiga donde corresponde en vez de repartirse
 * entre el que manejaba y el que puso la app.
 *
 * TAMPOCO ES UN SEGURO. El valor declarado es lo que el remitente DICE que
 * vale, y se guarda para poder discutir un reclamo con una cifra encima de
 * la mesa. Prometer que lo cubrimos sería prometer plata que nadie apartó.
 *
 * LAS APPS YA INSTALADAS NO LO MANDAN
 * -----------------------------------
 * Por eso no es obligatorio de nacimiento: exigirlo hoy dejaría sin poder
 * enviar a todo el que no haya actualizado. Se guarda cuando viene y la
 * exigencia se enciende con `ENVIO_EXIGIR_REMITENTE` — el mismo patrón de
 * `KYC_ENFORCE`, `DOC_KILL_SWITCH_ENFORCE`, `LEGAL_CONSENT_ENFORCE` y
 * `PASAJEROS_EXIGIR_DOCUMENTO`.
 */

import { TIPOS_DOCUMENTO, type TipoDocumento } from './pasajeros-tiquete';

export class RemitenteInvalido extends Error {}

// ─── Quién entrega ───────────────────────────────────────────────────────────

export interface Remitente {
  tipoDoc: TipoDocumento;
  documento: string;
  nombre: string;
  /** Opcional: el de la cuenta ya se guarda. Este es el de quien ENTREGA. */
  telefono?: string;
}

function esTipo(v: string): v is TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

/**
 * Normaliza un documento para comparar y para guardar limpio.
 *
 * Sin esto «1.090.123-4» y «10901234» serían dos personas distintas, y la
 * constancia dejaría de servir justo cuando hubiera que cruzarla con una
 * cédula de verdad.
 */
export function claveDocumento(d: string): string {
  return d.replace(/[\s.\-]/g, '').toUpperCase();
}

/**
 * `undefined`/`null` = esta app no manda remitente; devuelve `null` y el
 * envío sigue como hasta hoy. Un objeto PRESENTE se valida entero: medio
 * remitente es peor que ninguno, porque parece identificación y no lo es.
 */
export function saneaRemitente(v: unknown): Remitente | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new RemitenteInvalido('Los datos del remitente no tienen el formato esperado.');
  }
  const raw = v as { tipoDoc?: unknown; documento?: unknown; nombre?: unknown; telefono?: unknown };

  const tipoDoc = typeof raw.tipoDoc === 'string' ? raw.tipoDoc.trim().toUpperCase() : '';
  if (!esTipo(tipoDoc)) {
    throw new RemitenteInvalido(
      `El tipo de documento del remitente no es válido (${TIPOS_DOCUMENTO.join(', ')}).`,
    );
  }

  const documento = typeof raw.documento === 'string' ? raw.documento.trim() : '';
  if (claveDocumento(documento).length < 4 || documento.length > 20) {
    throw new RemitenteInvalido('El documento del remitente no parece válido.');
  }

  const nombre = typeof raw.nombre === 'string' ? raw.nombre.trim().replace(/\s+/g, ' ') : '';
  if (nombre.length < 3 || nombre.length > 80) {
    throw new RemitenteInvalido('El nombre del remitente no parece válido.');
  }

  const telCrudo = typeof raw.telefono === 'string' ? raw.telefono.trim() : '';
  const salida: Remitente = { tipoDoc, documento: claveDocumento(documento), nombre };
  if (telCrudo.length > 0) salida.telefono = telCrudo.slice(0, 20);
  return salida;
}

/** «CC 1090123456 · María Torres», para el remito y el manifiesto. */
export function lineaDeRemitente(r: Remitente): string {
  return `${r.tipoDoc} ${r.documento} · ${r.nombre}`;
}

// ─── Qué va dentro ───────────────────────────────────────────────────────────

/**
 * Catálogo CERRADO de lo que se declara.
 *
 * Cerrado y no texto libre por la misma razón que las comodidades del bus:
 * con texto libre uno escribe «repuestos», otro «autopartes» y otro «cosas
 * del carro», y después nadie puede filtrar, ni cruzar, ni responder «¿qué
 * llevaba ese camión?». El texto libre no desaparece —sigue en la
 * descripción— pero deja de ser lo único que hay.
 */
export const CATEGORIAS_CARGA = [
  'mercancia_general',
  'alimentos',
  'bebidas',
  'electrodomesticos',
  'muebles',
  'ropa_calzado',
  'materiales_construccion',
  'repuestos',
  'medicamentos',
  'documentos',
  'mudanza',
  'otro',
] as const;
export type CategoriaCarga = (typeof CATEGORIAS_CARGA)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaCarga, string> = {
  mercancia_general: 'Mercancía general',
  alimentos: 'Alimentos',
  bebidas: 'Bebidas',
  electrodomesticos: 'Electrodomésticos',
  muebles: 'Muebles y enseres',
  ropa_calzado: 'Ropa y calzado',
  materiales_construccion: 'Materiales de construcción',
  repuestos: 'Repuestos y autopartes',
  medicamentos: 'Medicamentos',
  documentos: 'Documentos',
  mudanza: 'Trasteo o mudanza',
  otro: 'Otro',
};

/**
 * La etiqueta en español de lo guardado en la base.
 *
 * Tolerante a propósito: lo que no esté en el catálogo se devuelve
 * `undefined` en vez de tumbar la consulta, y la pantalla dice «sin
 * declarar». Pintar la clave interna («materiales_construccion») sería
 * peor que no pintar nada.
 */
export function etiquetaDeCategoria(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const c = v.trim().toLowerCase();
  return (CATEGORIAS_CARGA as readonly string[]).includes(c)
    ? ETIQUETA_CATEGORIA[c as CategoriaCarga]
    : undefined;
}

/**
 * Lo que NO se transporta, y por qué.
 *
 * Es una lista CERRADA y se le muestra al remitente antes de aceptar. No
 * sirve para impedir que alguien mienta —nada sirve para eso—: sirve para
 * que no pueda decir después que no sabía.
 *
 * El motivo va al lado de cada renglón a propósito. «Prohibido» a secas se
 * lee como burocracia y se salta; «porque el conductor responde penalmente»
 * se lee y se piensa.
 */
export const MERCANCIA_NO_ADMITIDA: ReadonlyArray<{ que: string; porque: string }> = [
  {
    que: 'Armas, municiones y explosivos',
    porque: 'Su transporte sin permiso es delito y responde quien conduce.',
  },
  {
    que: 'Drogas y sustancias para procesarlas',
    porque: 'El vehículo se incauta y el conductor queda detenido.',
  },
  {
    que: 'Mercancía de contrabando o sin factura que la respalde',
    porque: 'La Ley 1762 de 2015 alcanza a quien la transporta, no solo a quien la vende.',
  },
  {
    que: 'Dinero en efectivo, oro o joyas',
    porque: 'No hay forma de custodiarlo ni de responder por él si se pierde.',
  },
  {
    que: 'Animales vivos',
    porque: 'Exigen condiciones y permisos que este servicio no tiene.',
  },
  {
    que: 'Combustibles, gas, químicos y material inflamable',
    porque: 'Son mercancía peligrosa: piden vehículo, rótulos y licencia aparte.',
  },
  {
    que: 'Restos humanos u órganos',
    porque: 'Solo se trasladan con autorización sanitaria y vehículo habilitado.',
  },
  {
    que: 'Documentos de identidad ajenos y tarjetas bancarias',
    porque: 'Si se pierden, el daño no se repone y el reclamo recae en el conductor.',
  },
];

/**
 * Versión de la lista de arriba.
 *
 * Se guarda con cada envío porque una constancia tiene que decir QUÉ se
 * aceptó. Si mañana se añade un renglón, lo firmado ayer sigue siendo lo
 * que se mostró ayer. **Al tocar `MERCANCIA_NO_ADMITIDA`, subir esto.**
 */
export const VERSION_LISTA_NO_ADMITIDA = 1;

export interface DeclaracionCarga {
  categoria: CategoriaCarga;
  /** Lo que vale según el remitente. No es un seguro; ver la cabecera. */
  valorDeclarado?: number;
  /** Versión de la lista de no admitidos que aceptó. */
  versionLista: number;
}

/** Tope de cordura del valor declarado: mil millones. */
export const MAX_VALOR_DECLARADO = 1_000_000_000;

/**
 * `undefined`/`null` = app vieja, no hay declaración y se devuelve `null`.
 *
 * Presente se valida entera, y **sin aceptar la lista no hay declaración**:
 * guardar la categoría y el valor pero no la aceptación dejaría una
 * constancia a medias, que es la que no sirve en un reclamo.
 */
export function saneaDeclaracion(v: unknown): DeclaracionCarga | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new RemitenteInvalido('La declaración de contenido no tiene el formato esperado.');
  }
  const raw = v as { categoria?: unknown; valorDeclarado?: unknown; aceptaRestricciones?: unknown };

  const categoria = typeof raw.categoria === 'string' ? raw.categoria.trim().toLowerCase() : '';
  if (!(CATEGORIAS_CARGA as readonly string[]).includes(categoria)) {
    throw new RemitenteInvalido('Elige qué tipo de mercancía vas a enviar.');
  }

  if (raw.aceptaRestricciones !== true) {
    throw new RemitenteInvalido(
      'Para enviar hay que aceptar la lista de mercancía que no se transporta.',
    );
  }

  const salida: DeclaracionCarga = {
    categoria: categoria as CategoriaCarga,
    versionLista: VERSION_LISTA_NO_ADMITIDA,
  };

  if (raw.valorDeclarado !== undefined && raw.valorDeclarado !== null) {
    const n = typeof raw.valorDeclarado === 'number' ? raw.valorDeclarado : Number(raw.valorDeclarado);
    if (!Number.isFinite(n) || n < 0) {
      throw new RemitenteInvalido('El valor declarado no es válido.');
    }
    if (n > MAX_VALOR_DECLARADO) {
      // Un cero de más es el error típico, y un valor absurdo convierte la
      // constancia en el argumento de la otra parte.
      throw new RemitenteInvalido(
        `El valor declarado no puede superar $${MAX_VALOR_DECLARADO.toLocaleString('es-CO')}.`,
      );
    }
    // Al peso entero: no existen centavos y un decimal colgando solo sirve
    // para que las dos partes lean cifras distintas.
    if (n > 0) salida.valorDeclarado = Math.round(n);
  }

  return salida;
}

/**
 * Si se exige remitente y declaración para poder enviar.
 *
 * Apagado por defecto, y no por duda: encenderlo hoy dejaría sin enviar a
 * quien tenga una app anterior a estos campos. Se enciende cuando los APK
 * nuevos estén repartidos, y `/health` lo publica para que no se quede
 * encendido sin querer.
 */
export function exigirRemitente(): boolean {
  return process.env['ENVIO_EXIGIR_REMITENTE'] === 'true';
}
