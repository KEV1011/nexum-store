/**
 * Por qué un conductor no puede ponerse en línea, dicho de forma que se pueda
 * ACTUAR.
 *
 * El mensaje que había era uno solo para todo: «Debes completar la verificación
 * de identidad y documentos antes de conectarte». Con eso el conductor no sabe
 * si le toca hacer algo o esperar, y llama por teléfono. Y son cosas muy
 * distintas:
 *
 *   - «Te falta subir el SOAT»            → puede resolverlo AHORA MISMO.
 *   - «Estamos revisando tu identidad»    → no puede hacer nada, solo esperar.
 *   - «Rechazamos tu licencia porque…»    → tiene que volver a subirla.
 *
 * Distinguirlas es la diferencia entre un conductor que se desatasca solo y uno
 * que abandona. Por eso esto vive suelto y probado: es texto que decide si una
 * persona trabaja hoy o no.
 */

export type EstadoKyc = 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED';

export interface EntradaBloqueo {
  /** Documentos obligatorios que faltan por aprobar, ya con su etiqueta. */
  documentosFaltantes: string[];
  /** Documentos rechazados por el admin, con el motivo que escribió. */
  documentosRechazados: Array<{ label: string; motivo: string | null }>;
  estadoKyc: EstadoKyc;
  /** Motivo del rechazo de identidad, si lo hay. */
  motivoKyc?: string | null;
  /** El kill-switch documental lo tiene bloqueado (documento vencido). */
  documentosVencidos?: string | null;
  /** Si el gate de identidad está activo (`KYC_ENFORCE`). */
  exigeKyc: boolean;
}

export interface MotivoBloqueo {
  /** Código estable para que la app sepa a dónde llevarlo. */
  code: 'documentos_pendientes' | 'identidad_pendiente' | 'documents_expired';
  /** Mensaje listo para enseñar, en español. */
  error: string;
  /**
   * Quién tiene la pelota. Es el dato que evita la llamada de teléfono: con
   * `conductor` la app le enseña un botón para resolverlo; con `nosotros`, le
   * dice que espere y no le pide nada.
   */
  responsable: 'conductor' | 'nosotros';
}

/** Une una lista en español: «a, b y c». */
function enumerar(xs: string[]): string {
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]!}`;
}

/**
 * El motivo por el que NO puede conectarse, o `null` si puede.
 *
 * El orden importa: primero lo que el conductor puede arreglar él mismo. Si le
 * decimos «estamos revisando tu identidad» cuando además le faltan dos
 * documentos, se sienta a esperar algo que nunca va a llegar.
 */
export function motivoDeBloqueo(e: EntradaBloqueo): MotivoBloqueo | null {
  // 1. Documentos vencidos: es lo más urgente y lo paga él sin saberlo — deja
  //    de recibir viajes y no entiende por qué.
  if (e.documentosVencidos) {
    return {
      code: 'documents_expired',
      error:
        `Tu cuenta está suspendida: ${e.documentosVencidos}. ` +
        'Renueva tus documentos en Verificación para volver a conectarte.',
      responsable: 'conductor',
    };
  }

  // 2. Documentos rechazados: tiene que volver a subirlos, y con el motivo.
  if (e.documentosRechazados.length > 0) {
    const detalle = e.documentosRechazados
      .map((d) => (d.motivo ? `${d.label} (${d.motivo})` : d.label))
      .join('; ');
    return {
      code: 'documentos_pendientes',
      error: `Tenemos que rechazar estos documentos: ${detalle}. Vuelve a subirlos en Verificación.`,
      responsable: 'conductor',
    };
  }

  // 3. Documentos que aún no ha subido o que nadie ha aprobado.
  if (e.documentosFaltantes.length > 0) {
    return {
      code: 'documentos_pendientes',
      error: `Te falta que aprobemos: ${enumerar(e.documentosFaltantes)}. Súbelos en Verificación si aún no lo has hecho.`,
      // Aquí la pelota es de los dos: puede que no los haya subido, o que estén
      // esperando revisión. El texto lo dice sin culpar a nadie, y la app le
      // deja el botón porque subir de nuevo nunca sobra.
      responsable: 'conductor',
    };
  }

  // 4. Identidad. Solo si el gate está encendido.
  if (e.exigeKyc && e.estadoKyc !== 'VERIFIED') {
    if (e.estadoKyc === 'PENDING') {
      return {
        code: 'identidad_pendiente',
        error: 'Falta verificar tu identidad. Tómate la selfie en Verificación para terminar.',
        responsable: 'conductor',
      };
    }
    if (e.estadoKyc === 'REJECTED') {
      return {
        code: 'identidad_pendiente',
        error: e.motivoKyc
          ? `No pudimos verificar tu identidad: ${e.motivoKyc}. Vuelve a intentarlo en Verificación.`
          : 'No pudimos verificar tu identidad. Vuelve a intentarlo en Verificación.',
        responsable: 'conductor',
      };
    }
    // IN_REVIEW: ya hizo todo. No se le pide nada más — sería mentirle.
    return {
      code: 'identidad_pendiente',
      error:
        'Estamos revisando tu identidad. Ya no tienes que hacer nada: te avisamos '
        + 'en cuanto quede lista y podrás conectarte.',
      responsable: 'nosotros',
    };
  }

  return null;
}
