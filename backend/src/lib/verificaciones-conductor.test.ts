import { describe, it, expect } from 'vitest';
import {
  documentoVigente,
  verificacionesDeConductor,
  type EntradaVerificaciones,
} from './verificaciones-conductor';

const AHORA = new Date('2026-09-10T12:00:00Z');
const AYER = new Date('2026-09-09T12:00:00Z');
const MANANA = new Date('2026-09-11T12:00:00Z');

const TODO_MAL: EntradaVerificaciones = {
  kycStatus: 'PENDING',
  backgroundStatus: 'UNCHECKED',
  tieneFotoDePerfil: false,
  tieneSelfie: false,
  documentos: [],
};

function con(parcial: Partial<EntradaVerificaciones>): EntradaVerificaciones {
  return { ...TODO_MAL, ...parcial };
}

function marca(e: EntradaVerificaciones, clave: string): boolean {
  return verificacionesDeConductor(e, AHORA).items.find((i) => i.clave === clave)!.verificada;
}

describe('documentoVigente', () => {
  it('un documento aprobado y vigente cuenta', () => {
    expect(documentoVigente({ tipo: 'SOAT', estado: 'APPROVED', venceEl: MANANA }, AHORA)).toBe(true);
  });

  it('UN DOCUMENTO VENCIDO NO CUENTA, aunque lo aprobaran en su día', () => {
    // El SOAT del año pasado no cubre al pasajero de hoy. Enseñar «SOAT
    // vigente» con el seguro caducado es la mentira más cara de esta lista.
    expect(documentoVigente({ tipo: 'SOAT', estado: 'APPROVED', venceEl: AYER }, AHORA)).toBe(false);
  });

  it('un documento pendiente o rechazado no cuenta', () => {
    expect(documentoVigente({ tipo: 'SOAT', estado: 'PENDING', venceEl: MANANA }, AHORA)).toBe(false);
    expect(documentoVigente({ tipo: 'SOAT', estado: 'REJECTED', venceEl: MANANA }, AHORA)).toBe(false);
  });

  it('sin fecha de vencimiento se toma como vigente', () => {
    // Hay documentos que no vencen; no se castiga por un dato que no se pidió.
    expect(documentoVigente({ tipo: 'CEDULA', estado: 'APPROVED', venceEl: null }, AHORA)).toBe(true);
  });

  it('un documento que no existe no cuenta', () => {
    expect(documentoVigente(undefined, AHORA)).toBe(false);
  });

  it('acepta la fecha como texto: así está guardada en la base', () => {
    expect(documentoVigente({ tipo: 'SOAT', estado: 'APPROVED', venceEl: '2026-09-11' }, AHORA)).toBe(true);
    expect(documentoVigente({ tipo: 'SOAT', estado: 'APPROVED', venceEl: '2026-09-09' }, AHORA)).toBe(false);
  });

  it('una fecha que no se entiende NO cuenta como vigente', () => {
    // Perder una marca le cuesta al conductor un visto bueno, no su trabajo.
    // Decirle al pasajero «SOAT vigente» sin saber hasta cuándo, sí sería caro.
    expect(documentoVigente({ tipo: 'SOAT', estado: 'APPROVED', venceEl: 'el otro año' }, AHORA)).toBe(false);
  });
});

describe('verificacionesDeConductor', () => {
  it('un conductor recién registrado no tiene ninguna', () => {
    const r = verificacionesDeConductor(TODO_MAL, AHORA);
    expect(r.cumplidas).toBe(0);
    expect(r.total).toBe(6);
    expect(r.items.every((i) => !i.verificada)).toBe(true);
  });

  it('la identidad EN REVISIÓN todavía no está verificada', () => {
    // Está en camino, que no es lo mismo que estar hecha.
    expect(marca(con({ kycStatus: 'IN_REVIEW' }), 'identidad')).toBe(false);
    expect(marca(con({ kycStatus: 'VERIFIED' }), 'identidad')).toBe(true);
  });

  it('unos antecedentes SIN CONSULTAR no son "limpios"', () => {
    // Desconocido no es lo mismo que bueno.
    expect(marca(con({ backgroundStatus: 'UNCHECKED' }), 'antecedentes')).toBe(false);
    expect(marca(con({ backgroundStatus: 'PENDING' }), 'antecedentes')).toBe(false);
    expect(marca(con({ backgroundStatus: 'CLEAR' }), 'antecedentes')).toBe(true);
  });

  it('un HALLAZGO en antecedentes jamás se enseña como verificado', () => {
    expect(marca(con({ backgroundStatus: 'HIT' }), 'antecedentes')).toBe(false);
  });

  it('la selfie del KYC vale como foto', () => {
    expect(marca(con({ tieneSelfie: true }), 'foto')).toBe(true);
    expect(marca(con({ tieneFotoDePerfil: true }), 'foto')).toBe(true);
  });

  it('cuenta las cumplidas sobre el total, para poder decir "4 de 6"', () => {
    const r = verificacionesDeConductor(
      con({
        kycStatus: 'VERIFIED',
        backgroundStatus: 'CLEAR',
        tieneFotoDePerfil: true,
        documentos: [{ tipo: 'LICENSE', estado: 'APPROVED', venceEl: MANANA }],
      }),
      AHORA,
    );
    expect(r.cumplidas).toBe(4);
    expect(r.total).toBe(6);
  });

  it('el conductor completo llega a 6 de 6', () => {
    const r = verificacionesDeConductor(
      con({
        kycStatus: 'VERIFIED',
        backgroundStatus: 'CLEAR',
        tieneFotoDePerfil: true,
        documentos: [
          { tipo: 'LICENSE', estado: 'APPROVED', venceEl: MANANA },
          { tipo: 'SOAT', estado: 'APPROVED', venceEl: MANANA },
          { tipo: 'PROPERTY_CARD', estado: 'APPROVED', venceEl: MANANA },
        ],
      }),
      AHORA,
    );
    expect(r.cumplidas).toBe(6);
  });

  it('el SOAT vencido tumba SOLO su marca, no las demás', () => {
    const r = verificacionesDeConductor(
      con({
        kycStatus: 'VERIFIED',
        backgroundStatus: 'CLEAR',
        tieneFotoDePerfil: true,
        documentos: [
          { tipo: 'LICENSE', estado: 'APPROVED', venceEl: MANANA },
          { tipo: 'SOAT', estado: 'APPROVED', venceEl: AYER },
          { tipo: 'PROPERTY_CARD', estado: 'APPROVED', venceEl: MANANA },
        ],
      }),
      AHORA,
    );
    expect(r.cumplidas).toBe(5);
    expect(r.items.find((i) => i.clave === 'soat')!.verificada).toBe(false);
    expect(r.items.find((i) => i.clave === 'licencia')!.verificada).toBe(true);
  });

  it('siempre devuelve las seis, verificadas o no', () => {
    // Esconder las que faltan haría que «3 verificaciones» pareciera todo.
    expect(verificacionesDeConductor(TODO_MAL, AHORA).items).toHaveLength(6);
  });
});
