import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// El paso que pone el google-services.json en su sitio antes de compilar el APK.
//
// Vive en un script y no dentro del YAML porque el bash de un workflow no lo
// comprueba nadie: solo se rompe cuando el build ya va por la mitad, y son dos
// minutos de espera por intento. Tres builds murieron seguidos en este paso.
//
// Lo que está en juego si pasa mal: un APK que se construye entero, se firma,
// se instala, y NO recibe una sola notificación. Al conductor no le suena
// ninguna oferta y no hay nada en el log que lo diga. Por eso el script falla
// ruidosamente en vez de seguir, y por eso distingue entre «esto no es el
// archivo» y «es el archivo de la OTRA app», que son dos errores distintos con
// dos arreglos distintos.
//
// Estas pruebas EJECUTAN el script. Leerlo no vale: media palabra como
// «estonoesnada» está en el alfabeto base64 y decodifica a basura sin error.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..', '..');
const SCRIPT = join(RAIZ, 'tools', 'preparar-google-services.sh');
const PAQUETE = 'com.nexum.driver_app';
const OTRO_PAQUETE = 'com.nexum.nexum_client';

function archivoFirebase(paquete: string): string {
  return JSON.stringify(
    {
      project_info: { project_number: '1', project_id: 'zipa' },
      client: [
        {
          client_info: {
            mobilesdk_app_id: '1:1:android:abc',
            android_client_info: { package_name: paquete },
          },
          api_key: [{ current_key: 'AIza-falsa' }],
        },
      ],
      configuration_version: '1',
    },
    null,
    2,
  );
}

interface Resultado {
  codigo: number;
  salida: string;
  /** Contenido del destino, o null si el script no lo escribió. */
  escrito: string | null;
  /** Temporales que el script se dejó olvidados. */
  basura: string[];
}

function correr(valor: string | null, paquete = PAQUETE): Resultado {
  const dir = mkdtempSync(join(tmpdir(), 'gs-'));
  const destino = join(dir, 'salida', 'google-services.json');
  const entorno: NodeJS.ProcessEnv = { ...process.env };
  if (valor === null) delete entorno['SECRETO'];
  else entorno['SECRETO'] = valor;

  let codigo = 0;
  let salida = '';
  try {
    salida = execFileSync('bash', [SCRIPT, 'SECRETO', paquete, destino], {
      env: entorno,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    codigo = err.status ?? -1;
    salida = (err.stdout ?? '') + (err.stderr ?? '');
  }
  const escrito = existsSync(destino) ? readFileSync(destino, 'utf8') : null;
  const basura = readdirSync(dir).filter((f) => f !== 'salida');
  rmSync(dir, { recursive: true, force: true });
  return { codigo, salida, escrito, basura };
}

const bueno = archivoFirebase(PAQUETE);
const ajeno = archivoFirebase(OTRO_PAQUETE);
const enBase64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('preparar-google-services.sh', () => {
  it('el script existe (los workflows lo invocan por ruta)', () => {
    expect(existsSync(SCRIPT), `falta ${SCRIPT}`).toBe(true);
  });

  describe('lo acepta como venga', () => {
    it('el archivo pegado tal cual', () => {
      const r = correr(bueno);
      expect(r.codigo).toBe(0);
      expect(r.escrito).toContain(PAQUETE);
    });

    it('en base64', () => {
      const r = correr(enBase64(bueno));
      expect(r.codigo).toBe(0);
      expect(JSON.parse(r.escrito!).project_info.project_id).toBe('zipa');
    });

    // El editor mete el salto; la llave inicial deja de ser el primer carácter.
    // Con la detección por «empieza con {» esto se iba por la rama de base64.
    it('el archivo con un salto de línea delante', () => {
      const r = correr('\n  ' + bueno);
      expect(r.codigo).toBe(0);
      expect(r.escrito).toContain(PAQUETE);
    });

    it('base64 partido en líneas de 64', () => {
      const partido = enBase64(bueno).replace(/(.{64})/g, '$1\n');
      expect(correr(partido).codigo).toBe(0);
    });

    it('base64 entre comillas, como lo pega quien copia de un script', () => {
      expect(correr(`"${enBase64(bueno)}"`).codigo).toBe(0);
    });

    it('base64 sin el relleno de "=" final', () => {
      const sinRelleno = enBase64(bueno).replace(/=+$/, '');
      expect(correr(sinRelleno).codigo).toBe(0);
    });

    it('base64 de URL (con - y _ en vez de + y /)', () => {
      const url = enBase64(bueno).replace(/\+/g, '-').replace(/\//g, '_');
      expect(correr(url).codigo).toBe(0);
    });

    it('el archivo con el BOM del Bloc de notas delante', () => {
      expect(correr('\uFEFF' + bueno).codigo).toBe(0);
    });
  });

  describe('sin secreto el build sigue, pero avisando', () => {
    it('sale con 0 y no escribe nada', () => {
      const r = correr(null);
      expect(r.codigo).toBe(0);
      expect(r.escrito).toBeNull();
      expect(r.salida).toMatch(/sin Firebase/i);
    });
  });

  describe('cuando no sirve, dice cuál de los dos problemas es', () => {
    // «estonoesnada» son letras del alfabeto base64: `base64` lo decodifica sin
    // rechistar y devuelve basura. Si solo se mirara el código de salida de
    // base64, esto pasaría por bueno.
    it('basura que parece base64 no pasa por buena', () => {
      const r = correr('estonoesnada');
      expect(r.codigo).toBe(1);
      expect(r.escrito).toBeNull();
      expect(r.salida).toContain('Secreto ilegible');
    });

    it('algo que no es ni base64 ni JSON', () => {
      const r = correr('no tengo ni idea de qué pegar aquí!!');
      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('Secreto ilegible');
    });

    // Este es el peligroso: decodifica perfecto, es un google-services.json de
    // verdad, y produce un APK que se instala y no recibe un solo aviso.
    it('el archivo de la OTRA app se rechaza nombrando el paquete', () => {
      const r = correr(ajeno);
      expect(r.codigo).toBe(1);
      expect(r.escrito).toBeNull();
      expect(r.salida).toContain('de otra app');
      expect(r.salida).toContain(PAQUETE);
    });

    it('el archivo de la otra app en base64, igual', () => {
      const r = correr(enBase64(ajeno));
      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('de otra app');
    });
  });

  describe('el error describe el secreto sin imprimirlo', () => {
    const CONFIG_WEB = JSON.stringify({
      apiKey: 'AIza-falsa',
      authDomain: 'zipa.firebaseapp.com',
      projectId: 'zipa',
    });

    // Se pega de dos formas: el objeto JSON solo, o el fragmento de JavaScript
    // entero que la consola ofrece copiar. Las dos tienen que reconocerse.
    it('reconoce la config web pegada como JSON', () => {
      const r = correr(CONFIG_WEB);
      expect(r.codigo).toBe(1);
      expect(r.salida).toMatch(/config web/i);
    });

    it('reconoce el fragmento de JavaScript de la consola', () => {
      const r = correr(`const firebaseConfig = ${CONFIG_WEB};`);
      expect(r.codigo).toBe(1);
      expect(r.salida).toMatch(/config web/i);
    });

    it('reconoce una cuenta de servicio y dice a qué secreto pertenece', () => {
      const r = correr('{"type":"service_account","private_key":"---"}');
      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    });

    it('reconoce una ruta de Windows pegada en vez del contenido', () => {
      const r = correr('C:\\Users\\kevin\\Downloads\\google-services.json');
      expect(r.codigo).toBe(1);
      expect(r.salida).toContain('RUTA');
    });

    it('dice el largo y cuántos caracteres no pueden estar en un base64', () => {
      const r = correr('no tengo ni idea!!');
      expect(r.salida).toContain('largo: 18 caracteres');
      expect(r.salida).toMatch(/imposibles en un base64: [1-9]/);
    });

    // El valor va por variable de entorno y no por argv precisamente para que
    // no lo vea un `ps`; el diagnóstico no puede deshacer eso imprimiéndolo.
    it('no imprime el secreto', () => {
      const secreto = 'PEGUE-AQUI-ALGO-QUE-NO-VA!!';
      const r = correr(secreto);
      expect(r.salida).not.toContain(secreto);
    });
  });

  describe('no deja restos', () => {
    it('ni cuando funciona ni cuando falla', () => {
      expect(correr(bueno).basura).toEqual([]);
      expect(correr('estonoesnada').basura).toEqual([]);
      expect(correr('no es nada!!').basura).toEqual([]);
      expect(correr(ajeno).basura).toEqual([]);
    });
  });

  describe('los dos workflows lo usan', () => {
    const workflows = [
      ['build-apk.yml', 'GOOGLE_SERVICES_BASE64', PAQUETE, 'AppTransport'],
      ['build-apk-cliente.yml', 'GOOGLE_SERVICES_CLIENTE_BASE64', OTRO_PAQUETE, 'AppCliente'],
    ] as const;

    for (const [fichero, variable, paquete, app] of workflows) {
      it(`${fichero} invoca el script con ${paquete}`, () => {
        const yml = readFileSync(join(RAIZ, '.github', 'workflows', fichero), 'utf8');
        expect(yml).toContain('tools/preparar-google-services.sh');
        expect(yml).toContain(variable);
        expect(yml).toContain(paquete);
        // Cada app tiene SU archivo: cruzarlos da un APK mudo sin un solo error.
        expect(yml).toContain(`${app}/android/app/google-services.json`);
      });
    }
  });
});
