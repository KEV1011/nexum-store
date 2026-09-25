import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Que la política de privacidad diga la verdad sobre lo que hace el código.
 *
 * POR QUÉ HACE FALTA. El texto es una cadena dentro de un `.ts`: no lo compila
 * nadie, no lo lee ningún linter, y se queda obsoleto en cuanto alguien
 * integra un proveedor nuevo. La consecuencia no es un fallo de pantalla —es
 * una política incompleta ante la SIC y ante la ficha de Seguridad de los
 * datos de Play, que es causa de suspensión.
 *
 * LO QUE ESTA PRUEBA SÍ CAZA: que se retire de la política un proveedor que
 * sigue integrado, o que se retire del código uno que la política nombra (las
 * dos direcciones dejan el documento mintiendo).
 *
 * LO QUE NO CAZA, y conviene saberlo: integrar un proveedor que no esté en
 * esta lista. Para eso no hay atajo automático; la regla es que quien añade
 * una llave de un tercero añade su renglón aquí y en la política.
 */

const RAIZ = join(__dirname, '..', '..');

function politica(): string {
  // Se lee el FUENTE y no se llama al servicio: invocarlo tocaría la base y
  // devolvería lo que se sembró, no lo que dice el código de hoy.
  return readFileSync(join(RAIZ, 'src', 'services', 'legal.service.ts'), 'utf8');
}

function fuente(rel: string): string {
  return readFileSync(join(RAIZ, rel), 'utf8');
}

/** Proveedor integrado, el nombre que la política debe usar, y la prueba de que sigue vivo. */
const TERCEROS: ReadonlyArray<{
  nombre: string;
  enLaPolitica: string;
  archivo: string;
  marca: RegExp;
}> = [
  {
    nombre: 'Google Maps Platform',
    enLaPolitica: 'Google (Maps Platform)',
    archivo: 'src/services/geo.service.ts',
    marca: /maps\.googleapis\.com|GOOGLE_MAPS_API_KEY/,
  },
  {
    nombre: 'Firebase Cloud Messaging',
    enLaPolitica: 'Google Firebase (Cloud Messaging)',
    archivo: 'src/services/push.service.ts',
    marca: /firebase/i,
  },
  {
    nombre: 'WhatsApp Cloud API',
    enLaPolitica: 'Meta Platforms (WhatsApp Business Cloud API)',
    archivo: 'src/services/whatsapp-pedido.service.ts',
    marca: /whatsapp/i,
  },
  {
    nombre: 'Twilio',
    enLaPolitica: 'Twilio',
    archivo: 'src/services/otp.service.ts',
    marca: /twilio/i,
  },
  {
    nombre: 'Wompi',
    enLaPolitica: 'Wompi',
    archivo: 'src/services/payment.service.ts',
    marca: /wompi/i,
  },
  {
    nombre: 'Almacenamiento de objetos (S3 / R2)',
    enLaPolitica: 'Cloudflare R2',
    archivo: 'src/lib/upload.ts',
    marca: /S3_BUCKET|multer-s3|aws-sdk|@aws-sdk/,
  },
];

describe('la política de privacidad no puede quedarse corta', () => {
  it('nombra UNO A UNO a los terceros que tratan datos', () => {
    const texto = politica();
    const sinNombrar = TERCEROS.filter((t) => !texto.includes(t.enLaPolitica));
    expect(sinNombrar.map((t) => t.nombre)).toEqual([]);
  });

  it('cada tercero que nombra sigue integrado de verdad', () => {
    // La otra dirección: una política que nombra a un proveedor que ya no se
    // usa autoriza una transferencia que no ocurre, y eso también es falso.
    const muertos = TERCEROS.filter((t) => !t.marca.test(fuente(t.archivo)));
    expect(muertos.map((t) => t.nombre)).toEqual([]);
  });

  it('declara qué datos se recogen y para qué', () => {
    const texto = politica();
    for (const dato of ['Identificación', 'Ubicación', 'Documentos e imágenes', 'Datos de pago']) {
      expect(texto).toContain(dato);
    }
  });

  it('declara el uso de inteligencia artificial y el derecho a revisión humana', () => {
    const texto = politica();
    expect(texto).toContain('INTELIGENCIA ARTIFICIAL');
    expect(texto).toContain('revisión humana');
  });

  it('declara la transferencia internacional, que es lo que exige el art. 26', () => {
    // Todos los proveedores de arriba tienen servidores fuera de Colombia. Sin
    // esta cláusula la autorización no cubre sacar el dato del país.
    const texto = politica();
    expect(texto).toContain('TRANSFERENCIA INTERNACIONAL');
    expect(texto).toContain('artículo 26');
  });

  it('dice CÓMO se borra la cuenta, no solo que existe el derecho', () => {
    const texto = politica();
    expect(texto).toContain('HABEAS DATA');
    expect(texto).toContain('Eliminar mi cuenta');
  });

  it('cita la ley colombiana que la rige', () => {
    expect(politica()).toContain('Ley 1581 de 2012');
  });
});
