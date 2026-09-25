// ─────────────────────────────────────────────────────────────────────────────
// Tarifa por categoría de vehículo.
//
// Hasta ahora la plataforma tenía UNA fórmula para todo (lib/fare.ts): el mismo
// precio por kilómetro para un taxi, un particular y una moto. Eso servía
// mientras solo había un botón, pero en cuanto el pasajero elige entre
// categorías —como en cualquier plataforma— cobrar lo mismo por las tres es
// mentirle: la moto es más barata de operar y el taxi tiene tarifa REGULADA.
//
// Las dos reglas que sostienen este archivo:
//
//  1. **El taxi no lo tarifamos nosotros.** Su tarifa la fija el decreto
//     municipal (banderazo, unidades, carrera mínima, recargos). Nexum solo
//     puede CARGARLA por entorno. Mientras no se carguen los valores del
//     decreto, se usa la fórmula genérica y se avisa por consola y en /health
//     (`tarifaTaxi: generica`) — nunca se inventa un número y se presenta como
//     si fuera oficial.
//
//  2. **A la tarifa regulada no se le aplica multiplicador por demanda.**
//     Subir un 50 % un precio fijado por decreto no es dinámico, es cobrar por
//     encima de lo autorizado. `admiteSurge: false` en TAXI lo impide en el
//     único sitio donde se calcula el precio, no a base de acordarse.
//
// Todo aquí es puro y determinista: sin base de datos, sin red, sin reloj.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FARE_BASE, FARE_PER_KM, FARE_PER_MIN, FARE_MINIMUM,
} from '../config/constants';
import {
  acotarAlSobre, leerNumeroEnv, sobreDelDecreto, type SobreDelDecreto,
} from './tarifa-decreto';

/** Categorías que el pasajero puede elegir para un viaje urbano. */
export type CategoriaViaje = 'TAXI' | 'PARTICULAR' | 'MOTO';

export const CATEGORIAS: readonly CategoriaViaje[] = ['TAXI', 'PARTICULAR', 'MOTO'] as const;

export interface TarifaCategoria {
  categoria: CategoriaViaje;
  /** Nombre visible en la app. */
  nombre: string;
  /** Una línea que explica para qué sirve, en la tarjeta de la categoría. */
  descripcion: string;
  /** Pasajeros que caben. La moto lleva uno. */
  capacidad: number;
  /** Arranque de la carrera (banderazo). */
  banderazo: number;
  porKm: number;
  porMin: number;
  /** Carrera mínima: por debajo de esto no se cobra menos. */
  minimo: number;
  /** Se redondea el total a este múltiplo (el efectivo no tiene monedas de $7). */
  redondeoA: number;
  /** Falso ⇒ el multiplicador por demanda NO se aplica (tarifa regulada). */
  admiteSurge: boolean;
  /** Verdadero ⇒ la fija una autoridad, no Nexum. */
  regulada: boolean;
  /** Tipos de vehículo de la flota que atienden esta categoría. */
  tiposVehiculo: readonly string[];
  /**
   * Rango autorizado por el decreto para una carrera urbana. Solo lo tiene el
   * taxi, y solo si el municipio lo cargó. Ver `lib/tarifa-decreto.ts`.
   */
  sobre: SobreDelDecreto | null;
}

// ─── Lectura de la tarifa del decreto desde el entorno ────────────────────────

/**
 * Tarifa oficial del taxi, si el operador la cargó.
 *
 * Se exige el juego COMPLETO (banderazo + km + mínimo): media tarifa cargada
 * —el banderazo del decreto con el precio por kilómetro genérico— produce un
 * número que no es ni el nuestro ni el oficial, y nadie lo notaría.
 */
export function tarifaTaxiDelDecreto(): {
  banderazo: number; porKm: number; porMin: number; minimo: number;
} | null {
  const banderazo = leerNumeroEnv('TAXI_BANDERAZO_COP');
  const porKm = leerNumeroEnv('TAXI_POR_KM_COP');
  const minimo = leerNumeroEnv('TAXI_CARRERA_MINIMA_COP');
  if (banderazo == null || porKm == null || minimo == null) return null;
  // El tiempo es opcional: muchos decretos solo tarifan distancia.
  const porMin = leerNumeroEnv('TAXI_POR_MIN_COP') ?? 0;
  return { banderazo, porKm, porMin, minimo };
}

export type ModoTarifaTaxi = 'decreto-por-km' | 'decreto-por-zonas' | 'generica';

/**
 * Cómo se está cobrando el taxi. Son TRES modos, no dos, porque hay decretos
 * —el de Pamplona entre ellos— que no tarifan por kilómetro sino por una tabla
 * de sectores: de esos solo se puede cargar el sobre (mínima y máxima), y el
 * precio dentro de él es una estimación, no la casilla exacta del decreto.
 * Llamar a eso «tarifa oficial» sería afirmar de más.
 */
export function modoTarifaTaxi(): ModoTarifaTaxi {
  if (tarifaTaxiDelDecreto()) return 'decreto-por-km';
  if (sobreDelDecreto()) return 'decreto-por-zonas';
  return 'generica';
}

// ─── Catálogo de categorías ───────────────────────────────────────────────────

/**
 * Tabla de tarifas vigente. Se lee del entorno en cada llamada a propósito: así
 * cargar la tarifa del decreto en Render surte efecto al reiniciar sin tocar
 * código, y las pruebas pueden cambiarla sin reimportar el módulo.
 */
export function tablaTarifas(): Record<CategoriaViaje, TarifaCategoria> {
  const decreto = tarifaTaxiDelDecreto();
  const sobre = sobreDelDecreto();

  return {
    TAXI: {
      categoria: 'TAXI',
      nombre: 'Taxi',
      // Solo se dice «autorizada» cuando la tarifa del decreto está
      // REALMENTE cargada. Con la genérica, decirlo sería afirmar que el
      // precio es el oficial del municipio cuando lo estamos poniendo
      // nosotros — y eso, en un servicio público regulado, no es un matiz.
      descripcion: decreto != null
        ? 'Servicio público con tarifa autorizada'
        : sobre != null
          // Dentro del rango del decreto, pero no es su casilla exacta: la
          // tabla de sectores necesita saber en qué barrio cae cada punta.
          ? 'Servicio público · precio dentro de la tarifa oficial'
          : 'Servicio público',
      capacidad: 4,
      banderazo: decreto?.banderazo ?? FARE_BASE,
      porKm: decreto?.porKm ?? FARE_PER_KM,
      porMin: decreto?.porMin ?? FARE_PER_MIN,
      minimo: decreto?.minimo ?? sobre?.minimo ?? FARE_MINIMUM,
      redondeoA: 50,
      // Regulada: el precio no sube porque haya cola.
      admiteSurge: false,
      // Con la tabla de sectores cargada la tarifa TAMBIÉN es regulada: la fija
      // la alcaldía aunque nosotros solo sepamos el rango.
      regulada: decreto != null || sobre != null,
      tiposVehiculo: ['TAXI'],
      sobre,
    },
    PARTICULAR: {
      categoria: 'PARTICULAR',
      nombre: 'Particular',
      descripcion: 'Carro afiliado a la plataforma',
      capacidad: 4,
      banderazo: FARE_BASE,
      porKm: FARE_PER_KM,
      porMin: FARE_PER_MIN,
      minimo: FARE_MINIMUM,
      redondeoA: 50,
      admiteSurge: true,
      regulada: false,
      tiposVehiculo: ['PARTICULAR'],
      sobre: null,
    },
    MOTO: {
      categoria: 'MOTO',
      nombre: 'Moto',
      descripcion: 'Lo más rápido y económico, una persona',
      capacidad: 1,
      // Una moto gasta menos y ocupa menos: cobrar lo mismo que un carro haría
      // que la categoría no tuviera sentido para nadie.
      banderazo: Math.round(FARE_BASE * 0.6),
      porKm: Math.round(FARE_PER_KM * 0.55),
      porMin: Math.round(FARE_PER_MIN * 0.6),
      minimo: Math.round(FARE_MINIMUM * 0.7),
      redondeoA: 50,
      admiteSurge: true,
      regulada: false,
      tiposVehiculo: ['MOTO'],
      sobre: null,
    },
  };
}

/** La tarifa de una categoría, o null si el nombre no es una categoría. */
export function tarifaDe(categoria: string | null | undefined): TarifaCategoria | null {
  if (!categoria) return null;
  const clave = categoria.toUpperCase() as CategoriaViaje;
  return tablaTarifas()[clave] ?? null;
}

/**
 * Categoría que corresponde al `serviceType` guardado en el viaje.
 * ENVIOS y MANDADO no son categorías de pasajero: los cubre cualquier vehículo
 * y siguen con la fórmula genérica.
 */
export function categoriaDeServicio(serviceType: string | null | undefined): CategoriaViaje | null {
  switch ((serviceType ?? '').toUpperCase()) {
    case 'TAXI': return 'TAXI';
    case 'PARTICULAR': return 'PARTICULAR';
    case 'MOTO': return 'MOTO';
    default: return null;
  }
}

// ─── Cálculo ──────────────────────────────────────────────────────────────────

export interface PrecioCategoria {
  /** Lo que paga el pasajero, ya redondeado. */
  fare: number;
  /** Antes de aplicar demanda: sirve para mostrar el desglose. */
  base: number;
  /** El multiplicador REALMENTE aplicado (1 en tarifa regulada). */
  surgeAplicado: number;
  /** Recargos del decreto sumados a la carrera (nocturno, dominical). */
  recargos: number;
}

function redondear(valor: number, multiplo: number): number {
  if (multiplo <= 1) return Math.round(valor);
  return Math.round(valor / multiplo) * multiplo;
}

/**
 * Precio de una categoría para un trayecto.
 *
 * La carrera mínima se aplica ANTES del multiplicador y del redondeo: el
 * mínimo es un piso de la tarifa, no del total cobrado, y aplicarlo al final
 * dejaría carreras cortas por debajo del mínimo cuando el redondeo baja.
 */
export function precioCategoria(
  tarifa: TarifaCategoria,
  distanciaKm: number,
  minutos: number,
  surge = 1,
  // Ya calculados por el que llama, que es quien tiene reloj. Este archivo
  // sigue siendo puro: mismo argumento, mismo precio.
  recargos = 0,
): PrecioCategoria {
  const km = Number.isFinite(distanciaKm) && distanciaKm > 0 ? distanciaKm : 0;
  const min = Number.isFinite(minutos) && minutos > 0 ? minutos : 0;

  const crudo = tarifa.banderazo + km * tarifa.porKm + min * tarifa.porMin;
  const base = Math.max(crudo, tarifa.minimo);

  const surgeAplicado = tarifa.admiteSurge
    ? Math.max(1, Number.isFinite(surge) ? surge : 1)
    : 1;

  // El sobre acota la CARRERA, no el total: los recargos del decreto van por
  // encima y por eso se suman después de acotar y de redondear. Sumarlos antes
  // haría que el techo se comiera el recargo y el conductor lo perdiera justo
  // en las carreras largas de domingo por la noche.
  const carrera = acotarAlSobre(base * surgeAplicado, tarifa.sobre, km);
  const extra = Number.isFinite(recargos) && recargos > 0 ? Math.round(recargos) : 0;

  return {
    fare: redondear(carrera, tarifa.redondeoA) + extra,
    recargos: extra,
    base: redondear(base, tarifa.redondeoA),
    surgeAplicado,
  };
}

/**
 * Marca la opción más barata, pero SOLO si hay con qué compararla: poner
 * "la más barata" en una lista de una sola opción no informa de nada, y en un
 * empate marcaría una cualquiera como si fuera mejor que la otra.
 */
export function marcarMasBarata<T extends { fare: number; cheapest?: boolean }>(
  opciones: T[],
): T[] {
  if (opciones.length < 2) return opciones.map((o) => ({ ...o, cheapest: false }));
  const minimo = Math.min(...opciones.map((o) => o.fare));
  const cuantas = opciones.filter((o) => o.fare === minimo).length;
  return opciones.map((o) => ({ ...o, cheapest: cuantas === 1 && o.fare === minimo }));
}
