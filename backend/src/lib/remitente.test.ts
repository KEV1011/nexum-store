import { describe, it, expect } from 'vitest';
import {
  saneaRemitente,
  saneaDeclaracion,
  claveDocumento,
  lineaDeRemitente,
  RemitenteInvalido,
  MERCANCIA_NO_ADMITIDA,
  VERSION_LISTA_NO_ADMITIDA,
  CATEGORIAS_CARGA,
  ETIQUETA_CATEGORIA,
  MAX_VALOR_DECLARADO,
  exigirRemitente,
} from './remitente';

const BUENO = { tipoDoc: 'CC', documento: '1090123456', nombre: 'María Torres' };
const DECLARA = { categoria: 'mercancia_general', aceptaRestricciones: true };

describe('saneaRemitente', () => {
  it('una app vieja que no lo manda sigue enviando', () => {
    // La que de verdad importa: exigirlo de nacimiento dejaría sin enviar a
    // todo el que no haya actualizado el APK.
    expect(saneaRemitente(undefined)).toBeNull();
    expect(saneaRemitente(null)).toBeNull();
  });

  it('toma los datos y limpia el documento', () => {
    const r = saneaRemitente({ ...BUENO, documento: ' 1.090.123-456 ' });
    expect(r?.documento).toBe('1090123456');
    expect(r?.nombre).toBe('María Torres');
    expect(r?.tipoDoc).toBe('CC');
  });

  it('acepta los cuatro documentos con los que se vive en la frontera', () => {
    for (const t of ['CC', 'TI', 'CE', 'PA']) {
      expect(saneaRemitente({ ...BUENO, tipoDoc: t })?.tipoDoc).toBe(t);
    }
  });

  it('medio remitente se RECHAZA, no se guarda a medias', () => {
    // Un remitente con nombre y sin documento parece identificación y no lo
    // es: en un reclamo no sirve para nada y nadie se habría enterado.
    expect(() => saneaRemitente({ nombre: 'María Torres' })).toThrow(RemitenteInvalido);
    expect(() => saneaRemitente({ ...BUENO, documento: '12' })).toThrow(RemitenteInvalido);
    expect(() => saneaRemitente({ ...BUENO, nombre: 'Jo' })).toThrow(RemitenteInvalido);
    expect(() => saneaRemitente({ ...BUENO, tipoDoc: 'NIT' })).toThrow(RemitenteInvalido);
  });

  it('un documento de solo puntos no cuela', () => {
    // `'....'` tiene cuatro caracteres pero cero dígitos: la longitud se mide
    // sobre el documento NORMALIZADO, no sobre lo que se escribió.
    expect(() => saneaRemitente({ ...BUENO, documento: '....' })).toThrow(RemitenteInvalido);
  });

  it('el teléfono es opcional y no se inventa', () => {
    expect(saneaRemitente(BUENO)?.telefono).toBeUndefined();
    expect(saneaRemitente({ ...BUENO, telefono: '  ' })?.telefono).toBeUndefined();
    expect(saneaRemitente({ ...BUENO, telefono: '+573001112233' })?.telefono)
      .toBe('+573001112233');
  });

  it('la línea del remito es legible', () => {
    expect(lineaDeRemitente(saneaRemitente(BUENO)!)).toBe('CC 1090123456 · María Torres');
  });

  it('claveDocumento iguala lo que es la misma persona', () => {
    expect(claveDocumento('1.090.123-456')).toBe(claveDocumento('1090123456'));
  });
});

describe('saneaDeclaracion', () => {
  it('una app vieja sigue enviando', () => {
    expect(saneaDeclaracion(undefined)).toBeNull();
    expect(saneaDeclaracion(null)).toBeNull();
  });

  it('sin aceptar la lista NO hay declaración', () => {
    // Guardar categoría y valor sin la aceptación dejaría la constancia a
    // medias, que es justo la que no sirve en un reclamo.
    expect(() => saneaDeclaracion({ categoria: 'alimentos' })).toThrow(RemitenteInvalido);
    expect(() => saneaDeclaracion({ categoria: 'alimentos', aceptaRestricciones: false }))
      .toThrow(RemitenteInvalido);
    // Y un 'true' de texto no es aceptar: se exige el booleano.
    expect(() => saneaDeclaracion({ categoria: 'alimentos', aceptaRestricciones: 'true' }))
      .toThrow(RemitenteInvalido);
  });

  it('la categoría sale del catálogo cerrado', () => {
    expect(saneaDeclaracion(DECLARA)?.categoria).toBe('mercancia_general');
    expect(saneaDeclaracion({ ...DECLARA, categoria: 'ALIMENTOS' })?.categoria).toBe('alimentos');
    expect(() => saneaDeclaracion({ ...DECLARA, categoria: 'cositas' }))
      .toThrow(RemitenteInvalido);
  });

  it('sella la versión de la lista que se aceptó', () => {
    // Sin la versión, añadir un renglón mañana haría creer que lo firmado
    // ayer incluía algo que nadie vio.
    expect(saneaDeclaracion(DECLARA)?.versionLista).toBe(VERSION_LISTA_NO_ADMITIDA);
  });

  it('el valor declarado se redondea al peso y es opcional', () => {
    expect(saneaDeclaracion(DECLARA)?.valorDeclarado).toBeUndefined();
    expect(saneaDeclaracion({ ...DECLARA, valorDeclarado: 250000.4 })?.valorDeclarado)
      .toBe(250000);
    // Cero no es un valor declarado: es no haberlo declarado.
    expect(saneaDeclaracion({ ...DECLARA, valorDeclarado: 0 })?.valorDeclarado).toBeUndefined();
  });

  it('un cero de más se rechaza diciendo el tope', () => {
    expect(() => saneaDeclaracion({ ...DECLARA, valorDeclarado: MAX_VALOR_DECLARADO + 1 }))
      .toThrow(RemitenteInvalido);
    expect(() => saneaDeclaracion({ ...DECLARA, valorDeclarado: -5 }))
      .toThrow(RemitenteInvalido);
    expect(() => saneaDeclaracion({ ...DECLARA, valorDeclarado: 'mucho' }))
      .toThrow(RemitenteInvalido);
  });
});

describe('la lista de lo que no se transporta', () => {
  it('cada renglón dice QUÉ y POR QUÉ', () => {
    // «Prohibido» a secas se lee como burocracia y se salta.
    expect(MERCANCIA_NO_ADMITIDA.length).toBeGreaterThan(5);
    for (const r of MERCANCIA_NO_ADMITIDA) {
      expect(r.que.length).toBeGreaterThan(5);
      expect(r.porque.length).toBeGreaterThan(20);
    }
  });

  it('nombra lo que de verdad pasa en la frontera', () => {
    const todo = MERCANCIA_NO_ADMITIDA.map((r) => `${r.que} ${r.porque}`).join(' ').toLowerCase();
    expect(todo).toContain('contrabando');
    expect(todo).toContain('arma');
    expect(todo).toContain('efectivo');
  });
});

describe('el catálogo de categorías', () => {
  it('toda categoría tiene su etiqueta en español', () => {
    // Una categoría sin etiqueta se pintaría con su clave interna
    // («materiales_construccion») en la pantalla del cliente.
    for (const c of CATEGORIAS_CARGA) {
      expect(ETIQUETA_CATEGORIA[c]).toBeTruthy();
    }
    expect(Object.keys(ETIQUETA_CATEGORIA).length).toBe(CATEGORIAS_CARGA.length);
  });
});

describe('exigirRemitente', () => {
  it('apagado por defecto', () => {
    const antes = process.env['ENVIO_EXIGIR_REMITENTE'];
    delete process.env['ENVIO_EXIGIR_REMITENTE'];
    expect(exigirRemitente()).toBe(false);
    process.env['ENVIO_EXIGIR_REMITENTE'] = 'true';
    expect(exigirRemitente()).toBe(true);
    // Solo el literal exacto, como el resto de los interruptores del repo.
    process.env['ENVIO_EXIGIR_REMITENTE'] = 'TRUE';
    expect(exigirRemitente()).toBe(false);
    if (antes === undefined) delete process.env['ENVIO_EXIGIR_REMITENTE'];
    else process.env['ENVIO_EXIGIR_REMITENTE'] = antes;
  });
});
