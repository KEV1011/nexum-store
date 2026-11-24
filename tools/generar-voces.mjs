#!/usr/bin/env node
// Genera los audios de las notificaciones con la voz de Google (Cloud
// Text-to-Speech) y los deja dentro de las dos apps.
//
//   GOOGLE_TTS_API_KEY=... node tools/generar-voces.mjs
//
// Lo corre el workflow «Generar voces» (manual). Las frases salen de
// tools/voces/frases.json.
//
// COSTO: CERO. Google cobra por letras y regala el primer millón al mes en las
// voces Chirp 3 HD. Todas las frases juntas son unas 200 letras, y el script se
// NIEGA a pedir más de TOPE_LETRAS en una corrida: aunque alguien escriba un
// texto enorme por error, nunca se acerca a lo que se cobra.
//
// Qué escribe:
//   <App>/android/app/src/main/res/raw/zipa_voz_<id>.wav  — el sonido del canal
//   <App>/lib/core/voces/voces_generadas.dart             — qué voces trae la app
// Solo en la app a la que va cada frase (campo `apps`).
//
// iOS todavía no: el sonido tiene que ir en el paquete de la app, y eso exige
// registrarlo en el proyecto de Xcode. Mientras no esté, el servidor pide el
// archivo igual y el iPhone, que no lo encuentra, toca su sonido normal.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOPE_LETRAS = 2000;
const APPS = {
  cliente: { dir: 'AppCliente', paquete: 'nexum_client' },
  conductor: { dir: 'AppTransport', paquete: 'nexum_driver' },
};
// Si la voz elegida no existe para el idioma, se prueban estas en orden.
const RESPALDOS = ['es-US-Chirp3-HD-Aoede', 'es-US-Neural2-A', 'es-US-Standard-A'];

const llave = process.env.GOOGLE_TTS_API_KEY;
if (!llave) {
  console.error('Falta GOOGLE_TTS_API_KEY (secret del repositorio).');
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(join(RAIZ, 'tools/voces/frases.json'), 'utf8'));
const frases = cfg.frases;
const ids = new Set();
for (const f of frases) {
  if (!/^[a-z][a-z0-9_]*$/.test(f.id)) throw new Error(`id inválido: ${f.id}`);
  if (ids.has(f.id)) throw new Error(`id repetido: ${f.id}`);
  ids.add(f.id);
  for (const a of f.apps) if (!APPS[a]) throw new Error(`app desconocida en ${f.id}: ${a}`);
}
const letras = frases.reduce((n, f) => n + [...f.texto].length, 0);
if (letras > TOPE_LETRAS) {
  console.error(`Son ${letras} letras y el tope es ${TOPE_LETRAS}: no se pide nada.`);
  process.exit(1);
}
console.log(`${frases.length} frases, ${letras} letras (gratis: el primer millón del mes no se cobra).`);

async function sintetizar(texto, voz) {
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': llave },
    body: JSON.stringify({
      input: { text: texto },
      voice: { languageCode: voz.slice(0, 5), name: voz },
      // WAV (PCM 16 bits): lo aceptan como sonido de notificación Android e
      // iOS sin convertir nada. 24 kHz mono son ~50 KB por frase.
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(cuerpo?.error?.message ?? `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return Buffer.from(cuerpo.audioContent, 'base64');
}

/** La primera voz que el servicio acepta. Un 403 no se reintenta: es la llave. */
async function vozQueFunciona(texto) {
  const candidatas = [cfg.voz, ...RESPALDOS.filter((v) => v !== cfg.voz)];
  for (const voz of candidatas) {
    try {
      const audio = await sintetizar(texto, voz);
      return { voz, audio };
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        throw new Error(
          `Google rechazó la llave (${e.status}): ${e.message}\n` +
          'Revisa que la API «Cloud Text-to-Speech» esté habilitada en el proyecto ' +
          'y que la llave no esté restringida a otras APIs.',
        );
      }
      console.warn(`  la voz ${voz} no sirvió (${e.message}); pruebo la siguiente`);
    }
  }
  throw new Error('Ninguna voz funcionó.');
}

function esWav(buf) {
  return buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
}

function segundos(buf) {
  // Cabecera WAV estándar: bytes por segundo en el offset 28.
  const bps = buf.readUInt32LE(28);
  return bps ? (buf.length - 44) / bps : 0;
}

const primera = await vozQueFunciona(frases[0].texto);
console.log(`Voz: ${primera.voz}`);

const porApp = { cliente: [], conductor: [] };
for (const f of frases) {
  const audio = f === frases[0] ? primera.audio : await sintetizar(f.texto, primera.voz);
  if (!esWav(audio)) throw new Error(`«${f.id}» no volvió como WAV`);
  const dur = segundos(audio);
  // iOS no reproduce sonidos de más de 30 s; uno de menos de medio segundo
  // es que algo salió mal.
  if (dur < 0.5 || dur > 30) throw new Error(`«${f.id}» dura ${dur.toFixed(1)} s`);
  for (const a of f.apps) porApp[a].push({ ...f, audio, dur });
  console.log(`  ${f.id}: «${f.texto}» (${dur.toFixed(1)} s)`);
}

for (const [app, lista] of Object.entries(porApp)) {
  const base = join(RAIZ, APPS[app].dir);
  const raw = join(base, 'android/app/src/main/res/raw');
  mkdirSync(raw, { recursive: true });
  // Se borran las voces viejas: una frase retirada no puede quedarse sonando.
  if (existsSync(raw)) {
    for (const n of readdirSync(raw)) if (n.startsWith('zipa_voz_')) rmSync(join(raw, n));
  }
  for (const f of lista) {
    writeFileSync(join(raw, `zipa_voz_${f.id}.wav`), f.audio);
  }
  const dart = join(base, 'lib/core/voces/voces_generadas.dart');
  mkdirSync(dirname(dart), { recursive: true });
  writeFileSync(dart, [
    '// GENERADO por tools/generar-voces.mjs — no editar a mano.',
    '//',
    '// Las voces que esta app trae como sonido de notificación. La app crea un',
    '// canal de Android por cada una; el servidor elige cuál suena.',
    '',
    `/// Voz de Google usada: ${primera.voz}. Clave: id de la voz; valor: la frase.`,
    'const Map<String, String> kVocesGeneradas = <String, String>{',
    ...lista.map((f) => `  '${f.id}': '${f.texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$')}',`),
    '};',
    '',
  ].join('\n'));
  console.log(`${APPS[app].dir}: ${lista.length} voces`);
}
