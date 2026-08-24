// Formato de fecha y hora del portal.
//
// Existe porque dos paneles mostraban SOLO la hora (`toLocaleTimeString`) sobre
// datos que abarcan varios días: las alertas de ruta se guardan 180 días en la
// base y la bitácora de un flete Pamplona→Bogotá cruza la medianoche. Con solo
// «03:13 p. m.» una lista ordenada de más reciente a más antigua se lee
// desordenada —02:58, 04:30, 03:13— porque son días distintos, y quien vigila
// la flota no puede distinguir una alerta de hace diez minutos de una de la
// semana pasada. Que es justo lo que tiene que distinguir.

const HORA: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * «03:13 p. m.» si es de hoy, «ayer 04:30 p. m.», y con el día para lo demás:
 * «12 ago, 02:58 p. m.». La hora sola se reserva para hoy, que es cuando no
 * hace falta la fecha para entenderla.
 */
export function momento(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  const hora = d.toLocaleTimeString('es-CO', HORA);
  const ahora = new Date();
  if (mismoDia(d, ahora)) return hora;

  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${hora}`;

  const dia = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  // Un año distinto se dice entero: si no, un 12 ago de 2025 se confunde con
  // el de este año en cualquier informe que se mire en enero.
  const anio = d.getFullYear() !== ahora.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${dia}${anio}, ${hora}`;
}
