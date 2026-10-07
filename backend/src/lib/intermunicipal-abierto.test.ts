import { describe, it, expect, afterEach } from 'vitest';
import {
  INTERMUNICIPAL_APLAZADO,
  intermunicipalAbierto,
  motivoParaNoPedirIntermunicipal,
} from './intermunicipal-abierto';

const previo = process.env['INTERMUNICIPAL_ABIERTO'];
afterEach(() => {
  if (previo === undefined) delete process.env['INTERMUNICIPAL_ABIERTO'];
  else process.env['INTERMUNICIPAL_ABIERTO'] = previo;
});

describe('intermunicipalAbierto', () => {
  it('está CERRADO por defecto', () => {
    // Al revés que los otros interruptores del repositorio, que nacen
    // apagados para no cambiar nada de golpe. Aquí la decisión ya está tomada
    // y el riesgo es el contrario: dejarlo abierto deja solicitudes colgadas
    // que nadie va a despachar.
    delete process.env['INTERMUNICIPAL_ABIERTO'];
    expect(intermunicipalAbierto()).toBe(false);
  });

  it('solo lo abre el valor exacto', () => {
    // Un `'1'`, un `'si'` o un `'TRUE'` no cuentan: si cualquier valor
    // abriera, un `INTERMUNICIPAL_ABIERTO=false` escrito a mano lo abriría,
    // que es exactamente lo contrario de lo que quien lo escribió pretendía.
    for (const v of ['1', 'si', 'yes', 'TRUE', 'True', '', 'false']) {
      process.env['INTERMUNICIPAL_ABIERTO'] = v;
      expect(intermunicipalAbierto(), v).toBe(false);
    }
    process.env['INTERMUNICIPAL_ABIERTO'] = 'true';
    expect(intermunicipalAbierto()).toBe(true);
  });
});

describe('motivoParaNoPedirIntermunicipal', () => {
  it('cerrado devuelve el motivo; abierto, null', () => {
    delete process.env['INTERMUNICIPAL_ABIERTO'];
    expect(motivoParaNoPedirIntermunicipal()).toBe(INTERMUNICIPAL_APLAZADO);
    process.env['INTERMUNICIPAL_ABIERTO'] = 'true';
    expect(motivoParaNoPedirIntermunicipal()).toBeNull();
  });

  it('el motivo dice por qué y ofrece lo que SÍ se puede', () => {
    // «No disponible» a secas se lee como un fallo de la app y se reintenta
    // tres veces. Y no se promete una fecha, que es lo único que todavía no
    // se puede saber.
    expect(INTERMUNICIPAL_APLAZADO).toMatch(/pronto/i);
    expect(INTERMUNICIPAL_APLAZADO).toMatch(/habilitando/i);
    expect(INTERMUNICIPAL_APLAZADO).toMatch(/dentro de tu ciudad/i);
    expect(INTERMUNICIPAL_APLAZADO).not.toMatch(/\b(enero|febrero|semana|mes que viene)\b/i);
  });
});
