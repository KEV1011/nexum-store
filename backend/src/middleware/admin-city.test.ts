import { describe, it, expect, afterEach } from 'vitest';
import type { Request } from 'express';
import { getAdminPhones, isAdminPhone, adminCityOf, plazaDeLaPeticion } from './admin.middleware';

/**
 * Un admin atado a una ciudad no es una comodidad de la pantalla: es su
 * alcance. Si el filtro viviera solo en el desplegable, cambiar la URL a mano
 * bastaría para ver la operación de otra plaza — y a alguien de fuera se le
 * está dando acceso al panel precisamente porque NO va a ver el resto.
 */
const ORIGINAL = process.env['ADMIN_PHONES'];

function conPhones(v: string | undefined): void {
  if (v === undefined) delete process.env['ADMIN_PHONES'];
  else process.env['ADMIN_PHONES'] = v;
}

afterEach(() => conPhones(ORIGINAL));

const peticion = (query: Record<string, unknown>, adminCity?: string | null): Request =>
  ({ query, adminCity } as unknown as Request);

describe('alcance del administrador', () => {
  describe('cómo se lee ADMIN_PHONES', () => {
    it('un teléfono a secas ve toda la plataforma', () => {
      conPhones('+573001112233');
      expect(isAdminPhone('+573001112233')).toBe(true);
      expect(adminCityOf('+573001112233')).toBeNull();
    });

    it('con «:ciudad» queda atado a esa plaza', () => {
      conPhones('+573001112233,+573004445566:cucuta');
      expect(adminCityOf('+573001112233')).toBeNull();
      expect(adminCityOf('+573004445566')).toBe('cucuta');
    });

    it('acepta espacios y mayúsculas — se escribe a mano en un panel de Render', () => {
      conPhones(' +573004445566 : Cucuta , +573001112233 ');
      expect(isAdminPhone('+573004445566')).toBe(true);
      expect(adminCityOf('+573004445566')).toBe('cucuta');
      expect(isAdminPhone('+573001112233')).toBe(true);
    });

    it('«teléfono:» sin ciudad detrás NO ata a nada', () => {
      // Un dos puntos suelto es un dedazo. Interpretarlo como una plaza
      // llamada «» dejaría a esa persona sin ver absolutamente nada y sin
      // ninguna pista de por qué.
      conPhones('+573001112233:');
      expect(isAdminPhone('+573001112233')).toBe(true);
      expect(adminCityOf('+573001112233')).toBeNull();
    });

    it('un teléfono que no está en la lista no es admin, con ciudad o sin ella', () => {
      conPhones('+573004445566:cucuta');
      expect(isAdminPhone('+573009998877')).toBe(false);
      expect(adminCityOf('+573009998877')).toBeNull();
      expect(getAdminPhones().size).toBe(1);
    });
  });

  describe('qué plaza se aplica a la petición', () => {
    it('el admin global ve todo si no pide nada', () => {
      expect(plazaDeLaPeticion(peticion({}, null))).toBeNull();
    });

    it('el admin global puede pedir una plaza por la URL', () => {
      expect(plazaDeLaPeticion(peticion({ ciudad: 'Pamplona' }, null))).toBe('pamplona');
    });

    it('el admin atado ve la SUYA aunque pida otra', () => {
      // El caso que justifica que esto exista: cambiar la URL a mano.
      expect(plazaDeLaPeticion(peticion({ ciudad: 'bogota' }, 'cucuta'))).toBe('cucuta');
    });

    it('y tampoco puede quitarse el filtro dejándolo vacío', () => {
      expect(plazaDeLaPeticion(peticion({ ciudad: '' }, 'cucuta'))).toBe('cucuta');
      expect(plazaDeLaPeticion(peticion({}, 'cucuta'))).toBe('cucuta');
    });

    it('una ciudad repetida en la URL no se cuela como lista', () => {
      // Express entrega un array cuando el parámetro va dos veces. Sin la
      // comprobación de tipo acabaría en la consulta como objeto.
      expect(plazaDeLaPeticion(peticion({ ciudad: ['cucuta', 'bogota'] }, null))).toBeNull();
    });
  });
});
