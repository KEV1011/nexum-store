/**
 * El aviso a los taxistas cuando un pasajero publica un viaje por puestos.
 *
 * POR QUÉ EXISTE. Reportado por el usuario: «se solicita un servicio y no le
 * sale a ningún conductor la reserva». Medido: el viaje SÍ llegaba bien al
 * tablero del conductor (`GET /driver/pool/urbano/sin-conductor`), pero nadie
 * le avisaba de que existía — y ese tablero vive dentro de «Viajes
 * compartidos», en el cajón lateral, sin contador en ninguna parte. O sea que
 * funcionaba solo si al taxista se le ocurría ir a mirar.
 *
 * Es el mismo defecto que el aviso de la reserva en el bus de una empresa
 * (`aviso-reserva-puesto.ts`), y por eso el remedio tiene la misma forma.
 *
 * POR QUÉ SE AVISA A VARIOS Y NO SE OFRECE DE A UNO. El despacho urbano ofrece
 * la carrera a un conductor cada vez, con quince segundos para decidir, porque
 * el pasajero está parado en la calle esperando UN carro. Esto es otra cosa: un
 * tablero donde el viaje se queda publicado y lo toma quien quiera, con la toma
 * atómica para que no se lo lleven dos. Avisar a todos los de la plaza es lo
 * que ese modelo pide — y es como funciona la práctica en la calle, donde el
 * que va pasando se para y recoge.
 */

export interface PuestoPublicado {
  /** De dónde sale, como lo escribió el pasajero. */
  origen: string;
  destino: string;
  /** Lo que cobra por cada silla. */
  precioPorPuesto: number;
  /** Cuántas sillas se venden en total. */
  puestos: number;
  /** Minutos hasta la salida. Negativo o cero = ya. */
  minutosHastaSalida: number;
}

/** El título. Corto: la barra de notificaciones lo corta enseguida. */
export const TITULO_PUESTO_PUBLICADO = 'Viaje por puestos cerca de ti';

/**
 * Cuántos minutos antes se considera «ahora mismo».
 *
 * Por debajo de esto el mensaje dice «sale ya» en vez de una hora: a tres
 * minutos, leer «sale a las 18:42» obliga a mirar el reloj para entender que es
 * inmediato.
 */
export const MINUTOS_PARA_DECIR_YA = 6;

function pesos(v: number): string {
  return `$${Math.round(v).toLocaleString('es-CO')}`;
}

/**
 * Cuándo sale, en palabras.
 *
 * Es lo primero que decide un taxista: si sale ya y está a dos calles, va; si
 * sale en dos horas, lo mira luego. Por eso va en el cuerpo y no se deja a que
 * abra la app.
 */
export function cuandoSale(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= MINUTOS_PARA_DECIR_YA) return 'Sale ya';
  if (minutos < 60) return `Sale en ${Math.round(minutos)} min`;
  const horas = Math.round(minutos / 60);
  return horas === 1 ? 'Sale en 1 hora' : `Sale en ${horas} horas`;
}

/**
 * El cuerpo del aviso.
 *
 * Lleva el trayecto, cuándo y cuánto deja el carro lleno. **El total y no el
 * precio por silla**: un taxista decide con lo que se lleva por el viaje, y
 * «$2.000 el puesto» suena a nada al lado de una carrera mínima de $5.000
 * aunque sean cuatro sillas. Decir «hasta $8.000 por 4 puestos» es el mismo
 * dato dicho de forma que se pueda comparar.
 *
 * «Hasta», porque es lo que deja si se llena, y eso no está garantizado: quien
 * publica compró una silla y las otras pueden quedar vacías. Prometer el total
 * como seguro sería la primera queja.
 */
export function cuerpoDePuestoPublicado(p: PuestoPublicado): string {
  const origen = (p.origen ?? '').trim() || 'un punto de la ciudad';
  const destino = (p.destino ?? '').trim() || 'otro punto';
  const partes = [`${origen} → ${destino}`, cuandoSale(p.minutosHastaSalida)];

  const puestos = Math.max(1, Math.round(p.puestos));
  const precio = Math.round(p.precioPorPuesto);
  if (precio > 0) {
    partes.push(`hasta ${pesos(precio * puestos)} por ${puestos} puestos`);
  }
  return partes.join(' · ');
}
