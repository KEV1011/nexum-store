/**
 * Las cifras del piloto, en un archivo que se puede guardar.
 *
 * El panel las enseña, pero un piloto de un mes se juzga COMPARANDO: la semana
 * tres contra la uno, esta ciudad contra la otra. Eso no se hace mirando una
 * pantalla que solo sabe del presente — se hace con la serie delante, y para
 * eso hay que poder sacarla.
 *
 * El separador es `;` y el decimal la coma, porque el Excel en español abre
 * así: con `,` la hoja llega con todo apelotonado en la primera columna y
 * quien la recibe supone que el archivo está roto.
 */
import type { MetricasNegocio } from '../services/admin.service';

/** Una celda segura para CSV: comillas dobladas si hace falta entrecomillar. */
export function celda(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Un número con coma decimal, o vacío si no hay dato. Cero SÍ es un dato. */
export function numero(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return String(v).replace('.', ',');
}

/**
 * La serie diaria, una fila por día.
 *
 * Van TODOS los días, también los de cero: si los vacíos se saltaran, un mes
 * con dos semanas muertas se leería como un mes entero de actividad. El
 * resumen viaja en un pie, no en columnas repetidas en cada fila, para que la
 * hoja se pueda ordenar y graficar sin arrastrar basura.
 */
export function metricasACsv(m: MetricasNegocio, ciudad?: string | null): string {
  const lineas: string[] = [];
  lineas.push(['Fecha', 'Solicitados', 'Completados'].join(';'));
  for (const d of m.serie) {
    lineas.push([celda(d.dia), d.solicitados, d.completados].join(';'));
  }

  lineas.push('');
  lineas.push(['Resumen', 'Valor'].join(';'));
  lineas.push(['Plaza', celda(ciudad || 'Toda la plataforma')].join(';'));
  lineas.push(['Desde', celda(m.desde)].join(';'));
  lineas.push(['Hasta', celda(m.hasta)].join(';'));
  lineas.push(['Solicitados', m.emparejamiento.solicitados].join(';'));
  lineas.push(['Con conductor', m.emparejamiento.conConductor].join(';'));
  lineas.push(['Sin conductor disponible', m.emparejamiento.sinConductor].join(';'));
  // Vacío, no cero: sin solicitudes no hubo tasa que medir, y un 0 % ahí
  // acusaría al despacho de un fallo que no cometió.
  lineas.push(['Tasa de emparejamiento %', numero(m.emparejamiento.tasa)].join(';'));
  lineas.push(['Pasajeros activos', m.pasajerosActivos].join(';'));
  lineas.push(['Retención: base semana previa', m.retencion.base].join(';'));
  lineas.push(['Retención: volvieron', m.retencion.volvieron].join(';'));
  lineas.push(['Retención %', numero(m.retencion.pct)].join(';'));
  // Que la muestra sea pequeña tiene que viajar CON el número: quien abra esta
  // hoja dentro de un mes no se acordará de que eran dos personas.
  lineas.push([
    'Retención fiable',
    m.retencion.fiable ? 'sí' : `no (base de ${m.retencion.base})`,
  ].join(';'));

  return lineas.join('\n');
}
