import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Que la cuenta del pasajero no vuelva a nacer con un nombre que nadie dijo.
 *
 * EL FALLO QUE ESTO EVITA. La app cliente no tiene registro —teléfono, código
 * y dentro—, así que `verifyClientOtp` creaba la cuenta con el literal
 * 'Usuario ZIPA'. Ese nombre no se quedaba en la pantalla de Cuenta: es el que
 * el conductor lee al aceptar la carrera y al ir a recoger, el del manifiesto
 * de un intermunicipal y el que ve el negocio en su pedido. Todos los
 * pasajeros de la plataforma se llamaban igual.
 *
 * Escrito EN LA COLUMNA, además, destruye la única señal que permite
 * preguntarlo una vez y no volver a molestar: no hay forma de distinguir «no
 * lo ha dicho» de «se llama así». Por eso la columna se deja en NULL y la
 * señal viaja en `needsName`.
 *
 * Se comprueba sobre el fuente porque el fallo no es de ejecución: es una
 * cadena escrita a mano que ningún tipo ni ningún linter mira.
 */

const SRC = join(__dirname, '..');

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      out.push(...archivosTs(ruta));
    } else if (entrada.endsWith('.ts')) {
      out.push(ruta);
    }
  }
  return out;
}

describe('el nombre del pasajero no se inventa', () => {
  it('ningún archivo del backend escribe el relleno de antes', () => {
    // Incluye los .test.ts a propósito: una prueba que AFIRME el literal sería
    // la forma más limpia de que volviera sin que nadie lo notase.
    const culpables = archivosTs(SRC)
      .filter((f) => !f.endsWith('nombre-pasajero.test.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('Usuario ZIPA'))
      .map((f) => f.slice(SRC.length + 1));
    expect(culpables).toEqual([]);
  });

  it('el genérico que se muestra cuando falta es el mismo en todas partes', () => {
    // «Pasajero» es lo que ya usaban el despacho y el historial del conductor.
    // Dos genéricos distintos harían creer que son dos cosas distintas.
    const cliente = readFileSync(join(SRC, 'services', 'client.service.ts'), 'utf8');
    const enlace = readFileSync(join(SRC, 'services', 'enlace-magico.service.ts'), 'utf8');
    expect(cliente).toContain("user.name ?? 'Pasajero'");
    expect(enlace).toContain("user.name ?? 'Pasajero'");
  });

  it('la cuenta se crea sin tocar la columna del nombre', () => {
    const cliente = readFileSync(join(SRC, 'services', 'client.service.ts'), 'utf8');
    const creacion = /prisma\.user\.create\(\{\s*data:\s*\{([^}]*)\}/.exec(cliente);
    expect(creacion, 'no encontré la creación del usuario en verifyClientOtp').not.toBeNull();
    expect(creacion![1]).not.toContain('name');
  });
});
