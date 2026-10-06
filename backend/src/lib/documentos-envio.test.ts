import { describe, it, expect } from 'vitest';
import {
  saneaDatosDocumento,
  duenoDeDocumento,
  faltantesEnVia,
  motivoParaNoBorrar,
  etiquetaDocumentoEnvio,
  esTipoDocumentoEnvio,
  TIPOS_DOCUMENTO_ENVIO,
  ETIQUETA_DOCUMENTO_ENVIO,
  SUELEN_IR_FIRMADOS,
  DocumentoEnvioInvalido,
} from './documentos-envio';

describe('saneaDatosDocumento', () => {
  it('toma el tipo del catálogo, en cualquier caja', () => {
    expect(saneaDatosDocumento({ tipo: 'remesa' }).tipo).toBe('REMESA');
    expect(saneaDatosDocumento({ tipo: ' Manifiesto ' }).tipo).toBe('MANIFIESTO');
  });

  it('el tipo es OBLIGATORIO y no cae a SOPORTE', () => {
    // Un montón de fotos sin tipo es la carpeta de la cabina otra vez: el
    // valor de esto era poder preguntar «¿falta el manifiesto?».
    expect(() => saneaDatosDocumento({})).toThrow(DocumentoEnvioInvalido);
    expect(() => saneaDatosDocumento({ tipo: 'papelito' })).toThrow(DocumentoEnvioInvalido);
    expect(() => saneaDatosDocumento(null)).toThrow(DocumentoEnvioInvalido);
  });

  it('el número se conserva TAL CUAL', () => {
    // «066» no es «66»: normalizar un consecutivo ajeno es inventarse el
    // número de un documento que existe en papel.
    expect(saneaDatosDocumento({ tipo: 'REMESA', numero: ' 066 ' }).numero).toBe('066');
    expect(saneaDatosDocumento({ tipo: 'FACTURA', numero: 'FE-1234' }).numero).toBe('FE-1234');
    expect(saneaDatosDocumento({ tipo: 'REMESA', numero: '   ' }).numero).toBeUndefined();
  });

  it('una fecha futura se rechaza', () => {
    // Un papel que ya se tiene en la mano no puede estar fechado mañana:
    // es un dedazo en el año, y no sirve en un retén.
    const manana = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    expect(() => saneaDatosDocumento({ tipo: 'REMESA', fechaDocumento: manana.toISOString() }))
      .toThrow(DocumentoEnvioInvalido);
    expect(() => saneaDatosDocumento({ tipo: 'REMESA', fechaDocumento: 'ayer' }))
      .toThrow(DocumentoEnvioInvalido);
  });

  it('una fecha de hace unas horas pasa, aunque el huso la adelante', () => {
    // El margen de un día existe para que un documento fechado hoy en
    // Colombia no se rechace porque el servidor va en UTC.
    const hace2h = new Date(Date.now() - 2 * 3600 * 1000);
    expect(saneaDatosDocumento({ tipo: 'REMESA', fechaDocumento: hace2h.toISOString() })
      .fechaDocumento).toBeInstanceOf(Date);
  });

  it('la fecha vacía no es un error, es que no la pusieron', () => {
    expect(saneaDatosDocumento({ tipo: 'GUIA', fechaDocumento: '' }).fechaDocumento)
      .toBeUndefined();
    expect(saneaDatosDocumento({ tipo: 'GUIA', fechaDocumento: null }).fechaDocumento)
      .toBeUndefined();
  });

  it('una nota larga se recorta en vez de reventar', () => {
    const r = saneaDatosDocumento({ tipo: 'SOPORTE', nota: 'x'.repeat(900) });
    expect(r.nota!.length).toBe(300);
  });
});

describe('duenoDeDocumento', () => {
  it('acepta los tres dueños posibles', () => {
    expect(duenoDeDocumento('cargoTrip', 'c1')).toEqual({ clase: 'cargoTrip', id: 'c1' });
    expect(duenoDeDocumento('freight', 'f1')).toEqual({ clase: 'freight', id: 'f1' });
    expect(duenoDeDocumento('trip', 't1')).toEqual({ clase: 'trip', id: 't1' });
  });

  it('rechaza una clase inventada y un id vacío', () => {
    expect(() => duenoDeDocumento('pedido', 'x')).toThrow(DocumentoEnvioInvalido);
    expect(() => duenoDeDocumento('trip', '  ')).toThrow(DocumentoEnvioInvalido);
    expect(() => duenoDeDocumento('trip', undefined)).toThrow(DocumentoEnvioInvalido);
  });
});

describe('faltantesEnVia', () => {
  it('dice cuáles faltan de los dos que se piden en la carretera', () => {
    expect(faltantesEnVia([])).toEqual(['REMESA', 'MANIFIESTO']);
    expect(faltantesEnVia(['REMESA'])).toEqual(['MANIFIESTO']);
    expect(faltantesEnVia(['MANIFIESTO', 'REMESA'])).toEqual([]);
  });

  it('una factura no sustituye a un manifiesto', () => {
    expect(faltantesEnVia(['FACTURA', 'GUIA'])).toEqual(['REMESA', 'MANIFIESTO']);
  });

  it('lo desconocido no cuenta como presente', () => {
    // Si una fila vieja tuviera un tipo que ya no existe, no puede hacer
    // creer que el manifiesto está.
    expect(faltantesEnVia(['remesa_vieja', null, 42])).toEqual(['REMESA', 'MANIFIESTO']);
  });

  it('la lista es CORTA a propósito', () => {
    // Pedir seis documentos convierte el aviso en ruido y se deja de leer.
    expect(faltantesEnVia([]).length).toBeLessThanOrEqual(2);
  });
});

describe('motivoParaNoBorrar', () => {
  it('un documento sin firmar se puede retirar', () => {
    expect(motivoParaNoBorrar({})).toBeNull();
    expect(motivoParaNoBorrar({ signedAt: null })).toBeNull();
  });

  it('un documento FIRMADO no se borra, y se dice qué hacer', () => {
    // Misma regla del pago anulado y de la cuenta emitida: un papel firmado
    // que desaparece deja de probar nada, y el reclamo en el que haría
    // falta llega meses después.
    const m = motivoParaNoBorrar({ signedAt: new Date() });
    expect(m).toBeTruthy();
    expect(m!.toLowerCase()).toContain('versión corregida');
  });
});

describe('el catálogo', () => {
  it('todo tipo tiene etiqueta en español', () => {
    for (const t of TIPOS_DOCUMENTO_ENVIO) {
      expect(ETIQUETA_DOCUMENTO_ENVIO[t]).toBeTruthy();
    }
    expect(Object.keys(ETIQUETA_DOCUMENTO_ENVIO).length).toBe(TIPOS_DOCUMENTO_ENVIO.length);
  });

  it('lo guardado se traduce, y lo desconocido no tumba la consulta', () => {
    expect(etiquetaDocumentoEnvio('REMESA')).toBe('Remesa terrestre de carga');
    expect(etiquetaDocumentoEnvio('OTRA_COSA')).toBeUndefined();
    expect(etiquetaDocumentoEnvio(null)).toBeUndefined();
    expect(esTipoDocumentoEnvio('GUIA')).toBe(true);
    expect(esTipoDocumentoEnvio('guia')).toBe(false);
  });

  it('los que suelen ir firmados salen del mismo catálogo', () => {
    // Una entrada suelta aquí que no exista en el catálogo sería una pista
    // que la pantalla no podría mostrar nunca.
    for (const t of SUELEN_IR_FIRMADOS) {
      expect(TIPOS_DOCUMENTO_ENVIO).toContain(t);
    }
  });
});
