// ── ¿Sigue vigente el modo piloto? ───────────────────────────────────────────
//
// `PILOT_SKIP_VERIFICATION=true` deja que un conductor reciba viajes sin que
// nadie le haya mirado la cédula, la licencia ni el SOAT. Es razonable para
// arrancar con gente que el operador conoce en persona; es indefendible tres
// meses después, cuando ya nadie recuerda que el interruptor existe.
//
// Un booleano no caduca solo. Por eso el modo exige además una FECHA de fin:
// llegada esa fecha, la verificación vuelve a exigirse sin que nadie tenga que
// acordarse. Es lo contrario de un interruptor olvidado — un permiso que se
// vence.
//
// Dos decisiones sobre cómo falla:
//
//  · Encender el piloto SIN fecha aborta el arranque (en producción). Pedir una
//    fecha es barato; descubrir seis meses tarde que cualquiera despachaba sin
//    documentos, no.
//  · Una fecha ya pasada NO aborta: simplemente el piloto deja de aplicar. Caer
//    del lado seguro es volver a exigir verificación, no tumbar el servicio a
//    medianoche por un vencimiento previsto.

/** Días que dura el piloto por defecto cuando no se fija fecha (solo dev). */
export const PILOT_DEFAULT_DAYS = 30;

export interface EntornoPiloto {
  production: boolean;
  /** PILOT_SKIP_VERIFICATION=true */
  encendido: boolean;
  /** PILOT_SKIP_VERIFICATION_UNTIL en crudo (YYYY-MM-DD o ISO). */
  hasta: string | undefined;
  /** Momento de referencia (inyectado para poder probarlo). */
  ahora: Date;
}

export type VeredictoPiloto =
  /** El piloto no aplica: apagado o ya vencido. Verificación normal. */
  | { activo: false; vencido: boolean; hasta: string | null }
  /** Piloto vigente: los conductores despachan sin verificar. */
  | { activo: true; vencido: false; hasta: string; diasRestantes: number }
  /** Configuración inválida: el proceso no debe arrancar. */
  | { activo: false; abortar: string };

const MS_DIA = 24 * 60 * 60 * 1000;

export function evaluarPiloto(env: EntornoPiloto): VeredictoPiloto {
  if (!env.encendido) return { activo: false, vencido: false, hasta: null };

  const crudo = (env.hasta ?? '').trim().replace(/^["']|["']$/g, '');

  if (!crudo) {
    if (env.production) {
      const sugerida = new Date(env.ahora.getTime() + PILOT_DEFAULT_DAYS * MS_DIA)
        .toISOString()
        .slice(0, 10);
      return {
        activo: false,
        abortar:
          'PILOT_SKIP_VERIFICATION=true deja que los conductores reciban viajes sin cédula, ' +
          'licencia ni SOAT aprobados. Un permiso así tiene que caducar: define ' +
          `PILOT_SKIP_VERIFICATION_UNTIL con la fecha en que termina el piloto (p. ej. ${sugerida}). ` +
          'Llegada esa fecha la verificación vuelve a exigirse sola.',
      };
    }
    // Fuera de producción no se pide nada: la ventana por defecto basta.
    const fin = new Date(env.ahora.getTime() + PILOT_DEFAULT_DAYS * MS_DIA);
    return {
      activo: true,
      vencido: false,
      hasta: fin.toISOString(),
      diasRestantes: PILOT_DEFAULT_DAYS,
    };
  }

  // Una fecha suelta (YYYY-MM-DD) se toma hasta el final de ese día: si no, el
  // piloto moriría a las 00:00 del día que el operador escribió como último.
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(crudo)
    ? new Date(`${crudo}T23:59:59.999Z`)
    : new Date(crudo);

  if (Number.isNaN(fin.getTime())) {
    return {
      activo: false,
      abortar:
        `PILOT_SKIP_VERIFICATION_UNTIL="${crudo}" no es una fecha válida. Usa YYYY-MM-DD ` +
        '(por ejemplo 2026-09-15) o una fecha ISO completa.',
    };
  }

  const restanteMs = fin.getTime() - env.ahora.getTime();
  if (restanteMs <= 0) return { activo: false, vencido: true, hasta: fin.toISOString() };

  return {
    activo: true,
    vencido: false,
    hasta: fin.toISOString(),
    // Días ENTEROS que quedan, que es como los cuenta quien lee el aviso: si
    // vence hoy a medianoche son 0 ("caduca hoy"), no 1. Redondear hacia
    // arriba haría que un piloto de doce horas se anunciara como un día más.
    diasRestantes: Math.floor(restanteMs / MS_DIA),
  };
}
