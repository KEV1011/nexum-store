/**
 * Las siluetas de van, buseta y bus viven POR TRIPLICADO y tienen que coincidir.
 *
 *  · `AppCliente/lib/app/theme/zipa_vehiculos.dart` — lo que ve el pasajero.
 *  · `app/empresa/SiluetaVehiculo.tsx` — lo que ve la empresa al publicar.
 *  · `tools/previsualizar-vehiculos.py` — con lo que se diseñaron.
 *
 * Son tres plataformas que no comparten código, así que la geometría está
 * copiada. Copiada y sin vigilar, diverge: alguien afina el dibujo en la app,
 * el portal se queda con el viejo, y la empresa publica «buseta» viendo un
 * dibujo distinto del que verá su pasajero. Eso no lo caza ningún compilador —
 * los tres archivos compilan perfectamente con números distintos.
 *
 * Esta prueba lee los tres y compara las medidas que definen cada silueta.
 * Comprobada rompiéndola: cambiar las ventanas del bus en uno solo la hace
 * fallar diciendo cuál difiere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');

const DART = join(RAIZ, 'AppCliente', 'lib', 'app', 'theme', 'zipa_vehiculos.dart');
const TSX = join(RAIZ, 'app', 'empresa', 'SiluetaVehiculo.tsx');
const PY = join(RAIZ, 'tools', 'previsualizar-vehiculos.py');

interface Medidas {
  largo: number;
  ventanas: number;
  morro: number;
  techoAlto: boolean;
}

const TIPOS = ['van', 'buseta', 'bus'] as const;

/** `ZipaVehiculo.van: _Medidas(largo: 60, ventanas: 2, morro: 9, techoAlto: false)` */
function leerDart(): Record<string, Medidas> {
  const src = readFileSync(DART, 'utf8');
  const out: Record<string, Medidas> = {};
  const re =
    /ZipaVehiculo\.(\w+):\s*_Medidas\(largo:\s*([\d.]+),\s*ventanas:\s*(\d+),\s*morro:\s*([\d.]+),\s*techoAlto:\s*(true|false)\)/g;
  for (const m of src.matchAll(re)) {
    out[m[1]!] = {
      largo: Number(m[2]),
      ventanas: Number(m[3]),
      morro: Number(m[4]),
      techoAlto: m[5] === 'true',
    };
  }
  return out;
}

/** `VAN: { largo: 60, ventanas: 2, morro: 9, techoAlto: false },` */
function leerTsx(): Record<string, Medidas> {
  const src = readFileSync(TSX, 'utf8');
  const out: Record<string, Medidas> = {};
  const re =
    /(VAN|BUSETA|BUS):\s*\{\s*largo:\s*([\d.]+),\s*ventanas:\s*(\d+),\s*morro:\s*([\d.]+),\s*techoAlto:\s*(true|false)\s*\}/g;
  for (const m of src.matchAll(re)) {
    out[m[1]!.toLowerCase()] = {
      largo: Number(m[2]),
      ventanas: Number(m[3]),
      morro: Number(m[4]),
      techoAlto: m[5] === 'true',
    };
  }
  return out;
}

/** `'van': dict(largo=60, ventanas=2, morro=9, techo_alto=False),` */
function leerPy(): Record<string, Medidas> {
  const src = readFileSync(PY, 'utf8');
  const out: Record<string, Medidas> = {};
  const re =
    /'(\w+)':\s*dict\(largo=([\d.]+),\s*ventanas=(\d+),\s*morro=([\d.]+),\s*techo_alto=(True|False)\)/g;
  for (const m of src.matchAll(re)) {
    out[m[1]!] = {
      largo: Number(m[2]),
      ventanas: Number(m[3]),
      morro: Number(m[4]),
      techoAlto: m[5] === 'True',
    };
  }
  return out;
}

describe('siluetas de vehículo: las tres copias coinciden', () => {
  const dart = leerDart();
  const tsx = leerTsx();
  const py = leerPy();

  // Si el parser deja de encontrar los tres, la comparación pasaría por
  // vacuidad y la prueba no vigilaría nada. Se exige el juego completo.
  it('cada archivo declara los tres vehículos', () => {
    for (const [nombre, tabla] of [['dart', dart], ['tsx', tsx], ['py', py]] as const) {
      expect(Object.keys(tabla).sort(), `${nombre} no declara los tres`).toEqual([
        'bus',
        'buseta',
        'van',
      ]);
    }
  });

  for (const tipo of TIPOS) {
    it(`${tipo}: mismas medidas en app, portal y script`, () => {
      expect(tsx[tipo], `el portal difiere de la app en ${tipo}`).toEqual(dart[tipo]);
      expect(py[tipo], `el script difiere de la app en ${tipo}`).toEqual(dart[tipo]);
    });
  }

  // Las tres siluetas tienen que ser DISTINGUIBLES. Si alguien iguala las
  // ventanas o las proporciones, el dibujo compila igual pero deja de decir
  // nada: un pasajero no puede saber si le toca una van de doce o un bus de
  // cuarenta, que es justo el dato por el que existen.
  it('las tres se distinguen por ventanas y por proporción', () => {
    const ventanas = TIPOS.map((t) => dart[t]!.ventanas);
    expect(new Set(ventanas).size, 'dos vehículos con las mismas ventanas').toBe(3);

    const proporciones = TIPOS.map((t) => 44 / dart[t]!.largo);
    // La van tiene que ser claramente más rechoncha que el bus; si no, en un
    // cuadro cuadrado los dos se ven igual de largos.
    expect(proporciones[0]! - proporciones[2]!).toBeGreaterThan(0.2);
  });
});
