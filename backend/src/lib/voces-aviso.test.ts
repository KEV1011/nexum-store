import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canalDeVoz, sonidoIosDeVoz, VOCES_AVISO } from './voces-aviso';
import { avisoCancelacionAlConductor, avisoDeEstado } from './avisos-viaje';
import { entregaConVoz } from '../services/push.service';

const RAIZ = join(__dirname, '../../..');
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

interface Frase { id: string; texto: string; apps: Array<'cliente' | 'conductor'> }
const cfg = JSON.parse(leer('tools/voces/frases.json')) as { frases: Frase[] };
const APPS = { cliente: 'AppCliente', conductor: 'AppTransport' } as const;

describe('las voces que pide el servidor existen en las frases', () => {
  it('la tabla del servidor y tools/voces/frases.json tienen las mismas voces', () => {
    expect([...VOCES_AVISO].sort()).toEqual(cfg.frases.map((f) => f.id).sort());
  });

  it('cero pesos: todas las frases juntas quedan muy por debajo del tope', () => {
    const letras = cfg.frases.reduce((n, f) => n + [...f.texto].length, 0);
    // El script se niega a pasar de 2.000 por corrida; Google regala un millón
    // al mes. Si esto crece mucho, alguien está metiendo texto que no es aviso.
    expect(letras).toBeLessThan(2000);
  });

  it('lo que se le manda al conductor está en la app del conductor', () => {
    const delConductor = new Set(cfg.frases.filter((f) => f.apps.includes('conductor')).map((f) => f.id));
    expect(delConductor.has(avisoCancelacionAlConductor().voz!)).toBe(true);
    expect(delConductor.has('mensaje_nuevo')).toBe(true);
  });
});

describe('cómo viaja la voz en el aviso', () => {
  it('sin voz, el envío es exactamente el de siempre', () => {
    const e = entregaConVoz();
    expect(e.android).toEqual({ priority: 'high' });
    expect(e.apns.payload.aps.sound).toBe('default');
  });

  it('con voz: canal de Android y archivo de iOS de esa frase', () => {
    const e = entregaConVoz('conductor_llego');
    expect(e.android.notification).toEqual({
      channelId: 'zipa_voz_conductor_llego',
      sound: 'zipa_voz_conductor_llego',
    });
    expect(e.apns.payload.aps.sound).toBe('zipa_voz_conductor_llego.wav');
    // La prioridad y el despertar de la app no se pierden por llevar voz.
    expect(e.android.priority).toBe('high');
    expect(e.apns.payload.aps.contentAvailable).toBe(true);
    expect(sonidoIosDeVoz('conductor_llego')).toBe(`${canalDeVoz('conductor_llego')}.wav`);
  });

  it('«tu conductor llegó» habla; en un envío, el repartidor', () => {
    expect(avisoDeEstado('arrived').voz).toBe('conductor_llego');
    expect(avisoDeEstado('arrived', { esEnvio: true }).voz).toBe('repartidor_llego');
    expect(avisoDeEstado('completed')?.voz).toBeUndefined();
  });
});

describe('las apps y el generador dicen lo mismo', () => {
  for (const [app, dir] of Object.entries(APPS)) {
    it(`${dir}: la lista de voces coincide con los audios en res/raw`, () => {
      const raw = join(RAIZ, dir, 'android/app/src/main/res/raw');
      const audios = existsSync(raw)
        ? readdirSync(raw).filter((n) => n.startsWith('zipa_voz_')).map((n) => n.replace(/^zipa_voz_|\.wav$/g, ''))
        : [];
      const dart = leer(`${dir}/lib/core/voces/voces_generadas.dart`);
      const lista = [...dart.matchAll(/^\s*'([a-z0-9_]+)':/gm)].map((m) => m[1]);
      // Un canal sin su audio sonaría en silencio; un audio sin canal no
      // sonaría nunca.
      expect(lista.sort()).toEqual(audios.sort());
      // Y solo las frases que son de esta app.
      const deEstaApp = cfg.frases.filter((f) => f.apps.includes(app as 'cliente')).map((f) => f.id);
      for (const id of lista) expect(deEstaApp).toContain(id);
    });

    it(`${dir}: el encogedor de recursos no puede borrar las voces`, () => {
      const keep = leer(`${dir}/android/app/src/main/res/raw/keep_voces.xml`);
      expect(keep).toContain('tools:keep="@raw/zipa_voz_*"');
    });
  }

  it('las dos apps llaman igual a los canales, y como el servidor', () => {
    const a = leer('AppCliente/lib/core/voces/canales_voz.dart').replace(/nexum_client/g, 'PKG');
    const b = leer('AppTransport/lib/core/voces/canales_voz.dart').replace(/nexum_driver/g, 'PKG');
    expect(a).toBe(b);
    expect(a).toContain("'zipa_voz_$id'");
    expect(canalDeVoz('x')).toBe('zipa_voz_x');
  });
});
