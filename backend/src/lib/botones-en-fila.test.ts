import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// LOS BOTONES DEL TEMA TIENEN ANCHO MÍNIMO INFINITO.
//
// Las dos apps definen `ElevatedButton` y `OutlinedButton` con
// `minimumSize: Size.fromHeight(...)`, o sea `Size(double.infinity, alto)`:
// así un botón de acción ocupa todo el ancho sin que nadie lo pida. En una
// columna está bien. DENTRO DE UNA FILA es un bug: el botón exige ancho
// infinito, y en el APK (modo release) Flutter no se cae — el botón se come la
// fila y lo que va al lado se queda sin ancho.
//
// Se vio en producción tres veces sin saber por qué:
//  · «¿Cómo estuvo tu pedido?» salía letra por letra hacia abajo y el botón
//    «Calificar» no se veía (order_tracking_screen).
//  · El conductor no podía tocar «Iniciar» ni «Finalizar viaje» en un viaje
//    compartido: el botón de tiquete y el de cancelar, a su lado, los dejaban
//    sin ancho (my_pooled_trips_screen). El reporte «no permite iniciar el
//    viaje publicado» llevaba meses sin causa.
//  · «Contraoferta» dejaba sin ancho a «Aceptar» en la oferta «Pon tu precio».
//
// Ni el compilador ni el analizador lo ven: es código válido. Esta prueba
// busca, en el fuente de las dos apps, un botón del tema cuyo contenedor de
// diseño más cercano sea una fila (`Row`/`Wrap`) sin `minimumSize`/`fixedSize`
// propio y sin un `Expanded`/`Flexible`/`SizedBox` de por medio. También los
// que salen de un método auxiliar (`Widget _boton() => OutlinedButton(...)`)
// usado dentro de la fila: así se escapó el de los tiquetes.
//
// El arreglo es darle un ancho mínimo finito con la misma altura táctil:
//   style: OutlinedButton.styleFrom(minimumSize: const Size(0, kMinInteractiveDimension))
// o envolverlo en `Expanded` si debe repartirse la fila.

const RAIZ = join(__dirname, '..', '..', '..');
const APPS = ['AppCliente/lib', 'AppTransport/lib'];

const BOTON = /\b(ElevatedButton|OutlinedButton|FilledButton)(\.icon|\.tonal|\.tonalIcon)?\s*\(/g;
const FILAS = new Set(['Row', 'Wrap']);
// Un contenedor de estos ACOTA el ancho del botón (o lo saca de la fila): si es
// el ancestro de diseño más cercano, el botón no está suelto en una fila.
const ACOTAN = new Set([
  'Column', 'ListView', 'Expanded', 'Flexible', 'SizedBox', 'ConstrainedBox',
  'IntrinsicWidth', 'FractionallySizedBox', 'Stack', 'Positioned', 'Align',
  'Center', 'UnconstrainedBox', 'LimitedBox', 'FittedBox', 'Container',
]);

function dartsDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...dartsDe(ruta));
    else if (entrada.endsWith('.dart')) salida.push(ruta);
  }
  return salida;
}

/** Nombres de los constructores que encierran la posición, del más cercano al más lejano. */
function ancestros(src: string, pos: number): string[] {
  const nombres: string[] = [];
  let nivel = 0;
  for (let j = pos - 1; j >= 0; j--) {
    const c = src[j];
    if (c === ')') nivel++;
    else if (c === '(') {
      if (nivel === 0) {
        let k = j - 1;
        while (k >= 0 && /\s/.test(src[k]!)) k--;
        const fin = k + 1;
        while (k >= 0 && /[\w.]/.test(src[k]!)) k--;
        nombres.push(src.slice(k + 1, fin));
      } else nivel--;
    }
  }
  return nombres;
}

/** El cuerpo entre los paréntesis del constructor que empieza en `inicio`. */
function cuerpoDe(src: string, inicio: number): string {
  const i = src.indexOf('(', inicio);
  let n = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '(') n++;
    else if (src[j] === ')' && --n === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

/** El ancestro de diseño más cercano que decide el ancho: una fila o algo que lo acota. */
function padreDeDiseno(src: string, pos: number): string | null {
  for (const a of ancestros(src, pos)) {
    const nombre = a.split('.')[0]!;
    if (FILAS.has(nombre) || ACOTAN.has(nombre)) return nombre;
  }
  return null;
}

const tieneAnchoPropio = (cuerpo: string) => /\bminimumSize\b|\bfixedSize\b/.test(cuerpo);

/** Todos los botones del tema sueltos en una fila, directos o vía método auxiliar. */
export function botonesSueltosEnFila(src: string, nombre: string): string[] {
  const malos: string[] = [];
  const linea = (p: number) => src.slice(0, p).split('\n').length;

  for (const m of src.matchAll(BOTON)) {
    if (tieneAnchoPropio(cuerpoDe(src, m.index!))) continue;
    if (FILAS.has(padreDeDiseno(src, m.index!) ?? '')) {
      malos.push(`${nombre}:${linea(m.index!)} → ${m[1]}${m[2] ?? ''} suelto en una fila`);
    }
  }

  // Métodos que DEVUELVEN un botón del tema: el botón no está escrito dentro
  // de la fila, pero acaba ahí por la llamada.
  for (const m of src.matchAll(/Widget\s+(_?\w+)\s*\([^)]*\)\s*(=>|\{)/g)) {
    const fin = m.index! + m[0].length;
    const trozo = src.slice(fin, fin + 220);
    BOTON.lastIndex = 0;
    const b = BOTON.exec(trozo);
    BOTON.lastIndex = 0;
    if (!b || b.index > 60) continue; // tiene que ser lo que devuelve
    if (tieneAnchoPropio(cuerpoDe(src, fin + b.index))) continue;
    const declaracion = m.index! + m[0].indexOf(m[1]!);
    for (const c of src.matchAll(new RegExp(`\\b${m[1]}\\s*\\(`, 'g'))) {
      if (c.index === declaracion) continue;
      if (FILAS.has(padreDeDiseno(src, c.index!) ?? '')) {
        malos.push(`${nombre}:${linea(c.index!)} → ${m[1]}() devuelve ${b[1]} y se usa en una fila`);
      }
    }
  }
  return malos;
}

describe('botones del tema dentro de una fila', () => {
  it('ningún ElevatedButton/OutlinedButton queda suelto en una fila sin ancho propio', () => {
    const malos: string[] = [];
    let revisados = 0;
    for (const app of APPS) {
      for (const f of dartsDe(join(RAIZ, app))) {
        revisados++;
        malos.push(...botonesSueltosEnFila(readFileSync(f, 'utf8'), f.slice(RAIZ.length + 1)));
      }
    }
    // Si esto baja de golpe, la prueba dejó de mirar las apps y pasaría vacía.
    expect(revisados).toBeGreaterThan(300);
    expect(
      malos,
      'Con el tema (ancho mínimo infinito) estos botones dejan sin ancho a su fila en el APK.\n' +
        'Dales `minimumSize: const Size(0, kMinInteractiveDimension)` o envuélvelos en `Expanded`:\n' +
        malos.join('\n'),
    ).toEqual([]);
  });

  // Las dos que siguen impiden que el detector se rompa en silencio: una regla
  // que no encuentra nada también «pasa».
  it('caza el caso que rompió la calificación (botón al lado del texto)', () => {
    const src = `
      Row(children: [
        Expanded(child: Column(children: [Text('¿Cómo estuvo tu pedido?')])),
        const SizedBox(width: 16),
        Builder(builder: (ctx) => OutlinedButton(onPressed: f, child: const Text('Calificar'))),
      ])`;
    expect(botonesSueltosEnFila(src, 'x.dart')).toHaveLength(1);
  });

  it('caza el botón que viene de un método auxiliar y no marca los que están bien', () => {
    const src = `
      Widget _botonTiquete() => OutlinedButton(onPressed: f, child: const Icon(Icons.x));
      Widget build() => Row(children: [Expanded(child: ElevatedButton(onPressed: f, child: t)), _botonTiquete()]);
      Widget bien() => Row(children: [OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)), onPressed: f, child: t)]);
      Widget columna() => Column(children: [ElevatedButton(onPressed: f, child: t)]);`;
    const malos = botonesSueltosEnFila(src, 'x.dart');
    expect(malos).toHaveLength(1);
    expect(malos[0]).toContain('_botonTiquete()');
  });
});
