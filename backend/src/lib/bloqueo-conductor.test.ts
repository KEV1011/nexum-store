import { describe, it, expect } from 'vitest';
import { motivoDeBloqueo, type EntradaBloqueo } from './bloqueo-conductor';

const base: EntradaBloqueo = {
  documentosFaltantes: [],
  documentosRechazados: [],
  estadoKyc: 'VERIFIED',
  exigeKyc: true,
};

describe('por qué el conductor no puede conectarse', () => {
  it('con todo en regla, puede', () => {
    expect(motivoDeBloqueo(base)).toBeNull();
  });

  it('con el gate de identidad APAGADO, la identidad no bloquea', () => {
    // Es lo que permite encender el gate sin dejar a todo el mundo fuera de
    // golpe: con `KYC_ENFORCE=false` el comportamiento es el de siempre.
    expect(
      motivoDeBloqueo({ ...base, estadoKyc: 'PENDING', exigeKyc: false }),
    ).toBeNull();
  });

  describe('lo que puede arreglar él', () => {
    it('dice QUÉ documentos faltan, por su nombre', () => {
      const m = motivoDeBloqueo({
        ...base,
        documentosFaltantes: ['SOAT vigente', 'Licencia de conducción'],
      })!;
      expect(m.error).toContain('SOAT vigente');
      expect(m.error).toContain('Licencia de conducción');
      expect(m.responsable).toBe('conductor');
    });

    it('los enumera en español, con «y»', () => {
      const m = motivoDeBloqueo({
        ...base,
        documentosFaltantes: ['Cédula', 'SOAT', 'Licencia'],
      })!;
      expect(m.error).toContain('Cédula, SOAT y Licencia');
    });

    it('un rechazo trae el motivo que escribió el admin', () => {
      // Sin el motivo, el conductor vuelve a subir exactamente la misma foto
      // borrosa y el ciclo se repite.
      const m = motivoDeBloqueo({
        ...base,
        documentosRechazados: [{ label: 'SOAT vigente', motivo: 'la foto está cortada' }],
      })!;
      expect(m.error).toContain('la foto está cortada');
    });

    it('y funciona sin motivo', () => {
      const m = motivoDeBloqueo({
        ...base,
        documentosRechazados: [{ label: 'SOAT vigente', motivo: null }],
      })!;
      expect(m.error).toContain('SOAT vigente');
      expect(m.error).not.toContain('null');
    });
  });

  describe('la identidad', () => {
    it('PENDING le pide la selfie', () => {
      const m = motivoDeBloqueo({ ...base, estadoKyc: 'PENDING' })!;
      expect(m.error).toMatch(/selfie/i);
      expect(m.responsable).toBe('conductor');
    });

    it('IN_REVIEW le dice que NO tiene que hacer nada', () => {
      // Es la distinción que evita la llamada de teléfono: ya hizo todo, la
      // pelota es nuestra. Pedirle algo aquí sería mentirle.
      const m = motivoDeBloqueo({ ...base, estadoKyc: 'IN_REVIEW' })!;
      expect(m.responsable).toBe('nosotros');
      expect(m.error).toMatch(/no tienes que hacer nada/i);
      expect(m.error).not.toMatch(/selfie|sube|súbelos/i);
    });

    it('REJECTED trae el motivo', () => {
      const m = motivoDeBloqueo({
        ...base,
        estadoKyc: 'REJECTED',
        motivoKyc: 'la selfie no coincide con la cédula',
      })!;
      expect(m.error).toContain('la selfie no coincide con la cédula');
      expect(m.responsable).toBe('conductor');
    });
  });

  describe('el orden', () => {
    it('los documentos vencidos van PRIMERO', () => {
      // Es lo que lo saca del despacho sin que lo sepa.
      const m = motivoDeBloqueo({
        ...base,
        documentosVencidos: 'SOAT vencido el 01/09',
        documentosFaltantes: ['Licencia'],
        estadoKyc: 'PENDING',
      })!;
      expect(m.code).toBe('documents_expired');
    });

    it('los documentos van ANTES que la identidad en revisión', () => {
      // Si le decimos «estamos revisando tu identidad» cuando además le faltan
      // documentos, se sienta a esperar algo que nunca va a llegar.
      const m = motivoDeBloqueo({
        ...base,
        documentosFaltantes: ['SOAT vigente'],
        estadoKyc: 'IN_REVIEW',
      })!;
      expect(m.code).toBe('documentos_pendientes');
      expect(m.responsable).toBe('conductor');
    });

    it('un rechazo pesa más que un simple pendiente', () => {
      const m = motivoDeBloqueo({
        ...base,
        documentosFaltantes: ['Licencia'],
        documentosRechazados: [{ label: 'SOAT vigente', motivo: 'ilegible' }],
      })!;
      expect(m.error).toContain('ilegible');
    });
  });
});
