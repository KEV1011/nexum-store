/**
 * Lo que el decreto municipal fija de verdad: el sobre de la carrera y los
 * recargos.
 *
 * DE DÓNDE SALE ESTO
 * ------------------
 * Del Decreto 049 de 2023 de la Alcaldía de Pamplona (7 de septiembre), que es
 * el que rige el taxi en la plaza donde arranca la operación. Leerlo obligó a
 * corregir una suposición del código:
 *
 *   **Pamplona NO tarifa el taxi por kilómetro.** No hay banderazo ni valor por
 *   km en ninguna parte del decreto. El artículo primero es una TABLA DE
 *   SECTORES con precios fijos ($5.000, $5.500, $6.000, $7.500, $8.500,
 *   $9.500) y el artículo segundo fija la carrera mínima y dos recargos.
 *
 * `tarifa-categoria.ts` exigía el juego completo banderazo + km + mínimo para
 * dar por cargada la tarifa oficial. Con este decreto ese juego NO EXISTE, así
 * que la tarifa oficial no se podía cargar y el taxi se cotizaba con la fórmula
 * genérica — es decir, **con un precio que pone Nexum**, que es exactamente lo
 * que aquel archivo dice que existe para impedir. Rellenar `TAXI_BANDERAZO_COP`
 * y `TAXI_POR_KM_COP` «a ojo» habría sido inventar dos números que la alcaldía
 * nunca fijó, y presentarlos como oficiales.
 *
 * QUÉ RESUELVE ESTE ARCHIVO Y QUÉ NO
 * ----------------------------------
 * Resuelve lo que el decreto fija de forma exacta y sin depender de geografía:
 *
 *   • La carrera mínima ($5.000) y la máxima urbana ($9.500, el tope de la
 *     tabla de sectores). Entre las dos hay un SOBRE: cualquier carrera urbana
 *     autorizada cae dentro. Cotizar fuera de ese rango es, por arriba, cobrar
 *     más de lo que autoriza cualquier fila de la tabla.
 *   • El recargo nocturno y el de domingos y festivos, que hoy no se cobran y
 *     son plata del conductor.
 *
 * NO resuelve cuál de las seis filas de la tabla aplica a un trayecto concreto:
 * eso exige saber en qué sector cae cada punta («San Pedro», «Cristo Rey»,
 * «Ciudadela Universitaria»…) y no tenemos los polígonos de esos barrios.
 * Mientras no los haya, el precio se estima y se ACOTA al sobre, y el modo se
 * publica en `/health` para que nadie crea que es el número exacto del decreto.
 *
 * LO QUE EL DECRETO **NO** TIENE, Y ZANJA UNA PREGUNTA ABIERTA
 * -----------------------------------------------------------
 * No existe recargo por solicitud telefónica, por radio ni por aplicación. El
 * artículo segundo tiene EXACTAMENTE cuatro renglones —carrera mínima, servicio
 * por hora, recargo nocturno y recargo dominical— y ninguno es por pedir el
 * carro. Así que cobrarle al pasajero un «recargo por pedir en la app» sobre la
 * tarifa de taxi sería cobrar por encima de lo autorizado, por el mismo
 * razonamiento que ya impide aplicarle multiplicador por demanda.
 */

import { HORAS_UTC_COLOMBIA } from './horario-tienda';

/** Lee un número del entorno, o null si no está o es ilegible. */
export function leerNumeroEnv(nombre: string): number | null {
  const crudo = process.env[nombre];
  if (crudo == null || crudo.trim() === '') return null;
  const n = Number(crudo);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[Tarifa] ${nombre}="${crudo}" no es un número válido; se ignora.`);
    return null;
  }
  return n;
}

// ─── Festivos de Colombia ─────────────────────────────────────────────────────

/**
 * Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano).
 *
 * Se calcula y no se tabula porque una tabla se acaba el año que nadie la
 * actualiza, y ese día el conductor deja de cobrar su recargo sin que nadie se
 * entere.
 */
export function domingoDePascua(anio: number): { mes: number; dia: number } {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/** Días fijos que NO se trasladan (Ley 51 de 1983 los deja donde caen). */
const FIJOS: ReadonlyArray<[number, number]> = [
  [1, 1],   // Año Nuevo
  [5, 1],   // Día del Trabajo
  [7, 20],  // Independencia
  [8, 7],   // Batalla de Boyacá
  [12, 8],  // Inmaculada Concepción
  [12, 25], // Navidad
];

/** Días que la Ley Emiliani corre al lunes siguiente. */
const TRASLADABLES: ReadonlyArray<[number, number]> = [
  [1, 6],   // Reyes Magos
  [3, 19],  // San José
  [6, 29],  // San Pedro y San Pablo
  [8, 15],  // Asunción
  [10, 12], // Día de la Raza
  [11, 1],  // Todos los Santos
  [11, 11], // Independencia de Cartagena
];

/**
 * Días móviles atados a la Pascua, en días DESDE el domingo de Pascua.
 *
 * Jueves y Viernes Santo no se trasladan. Ascensión, Corpus Christi y Sagrado
 * Corazón sí, y los desplazamientos de abajo (+43, +64, +71) ya incluyen el
 * traslado al lunes — por eso no vuelven a pasar por la Ley Emiliani.
 */
const DESDE_PASCUA: readonly number[] = [
  -3,  // Jueves Santo
  -2,  // Viernes Santo
  43,  // Ascensión del Señor (trasladado)
  64,  // Corpus Christi (trasladado)
  71,  // Sagrado Corazón (trasladado)
];

function clave(mes: number, dia: number): string {
  return `${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Fecha UTC «plana» de un día colombiano, para hacer aritmética de días. */
function diaUtc(anio: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

const _cacheFestivos = new Map<number, Set<string>>();

/** Los festivos colombianos de un año, como claves «MM-DD». */
export function festivosDeColombia(anio: number): Set<string> {
  const guardado = _cacheFestivos.get(anio);
  if (guardado) return guardado;

  const dias = new Set<string>();
  for (const [m, d] of FIJOS) dias.add(clave(m, d));

  for (const [m, d] of TRASLADABLES) {
    const f = diaUtc(anio, m, d);
    // getUTCDay: 0 domingo … 1 lunes. Si no cae lunes, corre al lunes siguiente.
    const diaSemana = f.getUTCDay();
    const aSumar = diaSemana === 1 ? 0 : (8 - diaSemana) % 7;
    const movido = new Date(f.getTime() + aSumar * 86_400_000);
    dias.add(clave(movido.getUTCMonth() + 1, movido.getUTCDate()));
  }

  const p = domingoDePascua(anio);
  const pascua = diaUtc(anio, p.mes, p.dia);
  for (const desplazamiento of DESDE_PASCUA) {
    const f = new Date(pascua.getTime() + desplazamiento * 86_400_000);
    dias.add(clave(f.getUTCMonth() + 1, f.getUTCDate()));
  }

  _cacheFestivos.set(anio, dias);
  return dias;
}

/** Día, mes, año y hora de un instante, en hora de Colombia. */
export function enHoraColombia(instante: Date): {
  anio: number; mes: number; dia: number; hora: number; diaSemana: number;
} {
  const local = new Date(instante.getTime() + HORAS_UTC_COLOMBIA * 3_600_000);
  return {
    anio: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    hora: local.getUTCHours(),
    diaSemana: local.getUTCDay(),
  };
}

/** ¿Es domingo o festivo en Colombia? Se evalúa en hora colombiana. */
export function esDomingoOFestivo(instante: Date): boolean {
  const { anio, mes, dia, diaSemana } = enHoraColombia(instante);
  if (diaSemana === 0) return true;
  return festivosDeColombia(anio).has(clave(mes, dia));
}

// ─── Recargos del decreto ─────────────────────────────────────────────────────

export interface LineaRecargo {
  concepto: string;
  valor: number;
}

export interface RecargosDeCarrera {
  total: number;
  /** Para ENSEÑÁRSELOS al pasajero: un precio $1.000 más alto sin explicación se lee como un cobro de más. */
  lineas: LineaRecargo[];
}

export interface ConfigRecargos {
  nocturnoDesdeHora: number;
  nocturnoValor: number;
  dominicalValor: number;
}

/**
 * Recargos configurados. Cero en ambos = el municipio no los fijó, y entonces
 * no se cobra ninguno (nunca se inventa un recargo).
 */
export function configRecargos(): ConfigRecargos {
  return {
    nocturnoDesdeHora: leerNumeroEnv('TAXI_RECARGO_NOCTURNO_DESDE') ?? 21,
    nocturnoValor: leerNumeroEnv('TAXI_RECARGO_NOCTURNO_COP') ?? 0,
    dominicalValor: leerNumeroEnv('TAXI_RECARGO_DOMINICAL_COP') ?? 0,
  };
}

/**
 * Qué recargos le tocan a una carrera que ocurre en `instante`.
 *
 * LOS DOS SE SUMAN, y lo dice el propio decreto: el nocturno se cobra «a partir
 * de las 9:00 PM TODOS LOS DÍAS», y decir «todos los días» sería redundante si
 * los domingos estuvieran excluidos. Son dos renglones con dos disparadores
 * distintos, así que un domingo a las diez de la noche caen los dos.
 *
 * ⚠ AMBIGÜEDAD REAL DEL TEXTO, resuelta hacia el lado que NO cobra de más: el
 * decreto dice desde cuándo empieza el recargo nocturno pero no hasta cuándo.
 * Aquí se aplica de `nocturnoDesdeHora` hasta la medianoche, o sea que una
 * carrera a las 2 a.m. NO lo lleva. Si la Secretaría de Tránsito confirma que
 * cubre la madrugada, se extiende con `TAXI_RECARGO_NOCTURNO_DESDE` sin tocar
 * código. Dejar de cobrar $1.000 es un error barato; cobrarlo sin autorización
 * en un servicio regulado no lo es.
 */
export function recargosDeCarrera(
  instante: Date,
  cfg: ConfigRecargos = configRecargos(),
): RecargosDeCarrera {
  const lineas: LineaRecargo[] = [];
  const { hora } = enHoraColombia(instante);

  if (cfg.nocturnoValor > 0 && hora >= cfg.nocturnoDesdeHora) {
    lineas.push({
      concepto: `Recargo nocturno (desde las ${cfg.nocturnoDesdeHora}:00)`,
      valor: Math.round(cfg.nocturnoValor),
    });
  }
  if (cfg.dominicalValor > 0 && esDomingoOFestivo(instante)) {
    lineas.push({
      concepto: 'Recargo dominical o festivo',
      valor: Math.round(cfg.dominicalValor),
    });
  }

  return { total: lineas.reduce((s, l) => s + l.valor, 0), lineas };
}

// ─── El sobre de la carrera urbana ────────────────────────────────────────────

export interface SobreDelDecreto {
  /** Carrera mínima: por debajo no se cobra. */
  minimo: number;
  /** La fila más cara de la tabla de sectores. Ninguna carrera urbana la pasa. */
  maximo: number;
  /**
   * Los precios que de verdad existen en la tabla de sectores, ordenados.
   *
   * Sin ellos el precio acotado puede caer en cualquier cifra intermedia —
   * $5.350 para una carrera corta en Pamplona— y ese número NO APARECE en el
   * decreto: la tabla solo tiene 5.000, 5.500, 6.000, 7.500, 8.500 y 9.500.
   * Con ellos, todo lo que cotiza la app es una casilla real del documento.
   */
  escalones: readonly number[];
  /**
   * A qué distancia (km) una carrera urbana llega al escalón más caro.
   *
   * NO sale del decreto: es un dato operativo de la plaza que declara quien la
   * conoce («de Cristo Rey a Los Tanques son unos 7 km»), y se usa SOLO para
   * estimar en qué escalón cae el trayecto mientras no haya polígonos de
   * barrios. Sin él, la pendiente genérica —calibrada para una ciudad grande—
   * satura el techo a los 6 km y cotizaría el sector más caro para casi toda
   * carrera de un pueblo, que es cobrar de más en el caso común.
   */
  kmTope: number | null;
}

/**
 * El rango autorizado para una carrera urbana, si el municipio lo cargó.
 *
 * Hace falta el par completo: con solo el mínimo no hay techo y la fórmula
 * genérica podría cotizar $13.000 donde el decreto no autoriza más de $9.500;
 * con solo el techo, una carrera corta bajaría del mínimo legal.
 */
export function sobreDelDecreto(): SobreDelDecreto | null {
  const minimo = leerNumeroEnv('TAXI_CARRERA_MINIMA_COP');
  const maximo = leerNumeroEnv('TAXI_CARRERA_MAXIMA_COP');
  if (minimo == null || maximo == null) return null;
  // Al revés no se adivina cuál quiso decir: se ignora y se avisa.
  if (maximo < minimo) {
    console.warn(
      `[Tarifa] TAXI_CARRERA_MAXIMA_COP (${maximo}) es menor que la mínima (${minimo}); se ignora el sobre.`,
    );
    return null;
  }
  return {
    minimo,
    maximo,
    escalones: escalonesDelDecreto(minimo, maximo),
    kmTope: leerNumeroEnv('TAXI_KM_CARRERA_MAXIMA') || null,
  };
}

/**
 * Los precios de la tabla de sectores, de `TAXI_TARIFAS_SECTOR_COP`
 * («5000,5500,6000,7500,8500,9500»). Se descarta lo que no sea número o caiga
 * fuera del sobre, y el mínimo y el máximo entran siempre: son escalones por
 * definición.
 */
function escalonesDelDecreto(minimo: number, maximo: number): number[] {
  const crudo = process.env['TAXI_TARIFAS_SECTOR_COP'] ?? '';
  const valores = crudo
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= minimo && n <= maximo);
  return [...new Set([minimo, ...valores, maximo])].sort((a, b) => a - b);
}

/**
 * Lleva un precio al sobre del decreto y lo posa en un escalón REAL de la
 * tabla. Sin sobre cargado lo deja igual.
 *
 * Se baja al escalón, nunca se sube: subir al siguiente cobraría por encima de
 * lo que la estimación justifica, y en una tarifa regulada ese es el error que
 * no se puede cometer. Bajar, como mucho, deja al conductor cobrando el sector
 * de al lado.
 */
/**
 * Reparte el sobre por distancia cuando la plaza declaró a qué km se llega al
 * escalón más caro. Sin ese dato devuelve el precio tal cual y manda la
 * fórmula genérica, que es como funcionaba hasta ahora.
 */
function estimarEnElSobre(
  precio: number,
  sobre: SobreDelDecreto,
  distanciaKm?: number,
): number {
  const tope = sobre.kmTope;
  if (!tope || tope <= 0) return precio;
  if (!Number.isFinite(distanciaKm) || (distanciaKm ?? 0) <= 0) return sobre.minimo;
  const fraccion = Math.min(1, (distanciaKm as number) / tope);
  return sobre.minimo + (sobre.maximo - sobre.minimo) * fraccion;
}

export function acotarAlSobre(
  precio: number,
  sobre: SobreDelDecreto | null,
  // Para repartir el sobre por distancia cuando la plaza declaró su tamaño.
  distanciaKm?: number,
): number {
  if (!sobre) return precio;
  const dentro = Math.min(Math.max(estimarEnElSobre(precio, sobre, distanciaKm), sobre.minimo), sobre.maximo);
  let escalon = sobre.minimo;
  for (const e of sobre.escalones) {
    if (e <= dentro) escalon = e;
    else break;
  }
  return escalon;
}
