/**
 * Un servicio que lleva demasiado tiempo esperando conductor, y qué se puede
 * hacer con él.
 *
 * POR QUÉ EXISTE. Reportado: «hay viajes de usuarios que no les salen para
 * cancelar o que desde administrador la podamos eliminar para liberar al
 * usuario». Medido: el panel ya CONTABA los servicios colgados —«3 servicios
 * sin conductor desde hace más de 30 minutos»— y no ofrecía ni un botón. La
 * única acción que había, `releaseDriver`, trabaja a través del CONDUCTOR, así
 * que para un servicio que nunca tuvo ninguno no hay nada que liberar. El
 * aviso mandaba a mirar un diagnóstico y ahí se acababa.
 *
 * SE CANCELA, NO SE BORRA. El reporte decía «eliminar»; cancelar es lo
 * correcto y no es lo mismo. Borrar la fila libera al usuario y de paso
 * destruye la única prueba de que pidió algo y nadie se lo atendió: ni se
 * puede contar en las métricas de emparejamiento, ni reclamar, ni saber
 * después si la plaza se quedó sin conductores esa tarde. Cancelar con motivo
 * libera igual y deja el rastro.
 *
 * LO QUE ESTE ARCHIVO NO DECIDE: si al usuario se le sanciona. Eso depende de
 * si el servicio se prestó o no, y de si hubo pago — y es una decisión de
 * producto con consecuencias sobre una persona real, no una regla que se
 * deduzca de un estado en la base.
 */

/** Los cuatro servicios que pueden quedarse esperando conductor. */
export const TIPOS_ATASCABLES = ['viaje', 'mandado', 'pedido', 'intermunicipal'] as const;

export type TipoAtascado = (typeof TIPOS_ATASCABLES)[number];

export function esTipoAtascado(v: unknown): v is TipoAtascado {
  return typeof v === 'string' && (TIPOS_ATASCABLES as readonly string[]).includes(v);
}

/** Cómo se nombra cada uno en el panel. */
export const ETIQUETA_TIPO: Record<TipoAtascado, string> = {
  viaje: 'Viaje',
  mandado: 'Mandado',
  pedido: 'Pedido',
  intermunicipal: 'Intermunicipal',
};

/**
 * El motivo que queda escrito en el servicio cancelado.
 *
 * Dice QUIÉN lo canceló y POR QUÉ, porque meses después esa fila es lo único
 * que queda: «CANCELLED» a secas no distingue a quien se arrepintió de alguien
 * a quien dejamos tirado una hora.
 */
export const MOTIVO_ATASCADO = 'Cancelado por el administrador: nadie lo tomó';

/**
 * Lo que se le dice al usuario, que es la mitad que de verdad lo libera.
 *
 * Una cancelación de la que no se entera no sirve de nada: sigue esperando y
 * el teléfono le sigue diciendo que hay un servicio en curso. Y dice que NO se
 * le cobró, porque es la primera pregunta de cualquiera a quien le cancelan
 * algo.
 */
export function avisoDeCancelacion(tipo: TipoAtascado): { title: string; body: string } {
  return {
    title: 'No encontramos quién lo atendiera',
    body:
      `Cancelamos tu ${ETIQUETA_TIPO[tipo].toLowerCase()}: no apareció nadie disponible. `
      + 'No se te cobró nada y puedes volver a pedirlo cuando quieras.',
  };
}

/**
 * Minutos a partir de los cuales un servicio sin conductor se considera
 * colgado.
 *
 * Es el mismo umbral con el que el panel los CUENTA. Si fueran dos números
 * distintos, el aviso diría «hay 3» y la lista traería otra cantidad — y
 * nadie sabría cuál de las dos mirar.
 */
export function minParaAtascado(): number {
  const v = Number(process.env['DISPATCH_RECOVERY_MAX_AGE_MIN']);
  return Number.isFinite(v) && v > 0 ? v : 30;
}
