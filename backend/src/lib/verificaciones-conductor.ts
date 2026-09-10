// ── Lo que el pasajero ve antes de subirse al carro de un desconocido ────────
//
// Esta lista es una promesa. Si dice «Antecedentes verificados» y no lo están,
// alguien se sube confiando en algo que no comprobamos — y ese es exactamente
// el momento en el que una plataforma de transporte deja de ser útil y pasa a
// ser peligrosa. Así que la regla es una sola y no admite excepciones:
//
//   **Ante la duda, NO está verificado.**
//
// De ahí las decisiones que parecen severas y no lo son:
//
//  - Un documento **vencido no está verificado**, aunque el administrador lo
//    haya aprobado en su día. El SOAT del año pasado no cubre al pasajero de
//    hoy. Aprobado y vigente son dos cosas.
//  - Un antecedente **sin consultar** (`UNCHECKED`) no es «limpio», es
//    desconocido. Y un `HIT` desde luego que no.
//  - La identidad **en revisión** no está verificada todavía. Está en camino,
//    que no es lo mismo.
//
// Todo lo que hay aquí sale de datos que ya guardamos. Nada se infiere ni se
// da por bueno «porque el conductor está activo».

export type EstadoDocumento = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DocumentoParaVerificar {
  tipo: string;
  estado: EstadoDocumento;
  /**
   * Null = no vence (una cédula) o no se registró la fecha. Se admite texto
   * porque así está guardado en la base.
   */
  venceEl?: string | Date | null;
}

export interface EntradaVerificaciones {
  kycStatus?: string | null;
  backgroundStatus?: string | null;
  tieneFotoDePerfil: boolean;
  tieneSelfie: boolean;
  documentos: DocumentoParaVerificar[];
}

export interface Verificacion {
  clave: string;
  etiqueta: string;
  verificada: boolean;
}

export interface ResumenVerificaciones {
  items: Verificacion[];
  /** Cuántas están verificadas. */
  cumplidas: number;
  /** De cuántas. Siempre el total, para que se lea «4 de 6». */
  total: number;
}

/**
 * Un documento cuenta solo si está APROBADO **y vigente**.
 *
 * [ahora] se recibe para poder probar el vencimiento sin depender del reloj.
 */
export function documentoVigente(
  doc: DocumentoParaVerificar | undefined,
  ahora: Date,
): boolean {
  if (!doc) return false;
  if (doc.estado !== 'APPROVED') return false;
  // Sin fecha de vencimiento se toma como vigente: hay documentos que no
  // vencen, y no se puede castigar por un dato que nunca se pidió.
  if (!doc.venceEl) return true;

  const vence = doc.venceEl instanceof Date ? doc.venceEl : new Date(doc.venceEl);
  // Una fecha que no se entiende NO cuenta como vigente. Aquí perder una marca
  // le cuesta al conductor un visto bueno, no su trabajo — el kill-switch de
  // documentos es otra cosa y sigue su propio criterio. Enseñarle al pasajero
  // «SOAT vigente» cuando no sabemos hasta cuándo es lo que no se puede hacer.
  if (Number.isNaN(vence.getTime())) return false;
  return vence.getTime() > ahora.getTime();
}

export function verificacionesDeConductor(
  e: EntradaVerificaciones,
  ahora: Date = new Date(),
): ResumenVerificaciones {
  const porTipo = new Map(e.documentos.map((d) => [d.tipo, d]));

  const items: Verificacion[] = [
    {
      clave: 'identidad',
      etiqueta: 'Identidad verificada',
      // En revisión NO cuenta: está en camino, que no es lo mismo.
      verificada: e.kycStatus === 'VERIFIED',
    },
    {
      clave: 'antecedentes',
      etiqueta: 'Antecedentes consultados',
      // Sin consultar no es «limpio», es desconocido.
      verificada: e.backgroundStatus === 'CLEAR',
    },
    {
      clave: 'licencia',
      etiqueta: 'Licencia de conducción',
      verificada: documentoVigente(porTipo.get('LICENSE'), ahora),
    },
    {
      clave: 'soat',
      etiqueta: 'SOAT vigente',
      verificada: documentoVigente(porTipo.get('SOAT'), ahora),
    },
    {
      clave: 'tarjeta',
      etiqueta: 'Tarjeta de propiedad',
      verificada: documentoVigente(porTipo.get('PROPERTY_CARD'), ahora),
    },
    {
      clave: 'foto',
      etiqueta: 'Foto de perfil',
      // La selfie del KYC también sirve: es una foto suya que revisamos.
      verificada: e.tieneFotoDePerfil || e.tieneSelfie,
    },
  ];

  return {
    items,
    cumplidas: items.filter((i) => i.verificada).length,
    total: items.length,
  };
}
