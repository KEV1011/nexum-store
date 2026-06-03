import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getMaxFarePerSeat, getIntercityRoute } from '../src/config/constants';
import { isValidColombianPhone } from '../src/services/auth.service';

test('getIntercityRoute resuelve ambos sentidos de una ruta conocida', () => {
  const ida = getIntercityRoute('pamplona', 'cucuta');
  const vuelta = getIntercityRoute('cucuta', 'pamplona');
  assert.ok(ida);
  assert.ok(vuelta);
  assert.equal(ida?.distanceKm, vuelta?.distanceKm);
});

test('getIntercityRoute devuelve null para rutas desconocidas', () => {
  assert.equal(getIntercityRoute('bogota', 'malaga'), null);
});

test('getMaxFarePerSeat reparte el costo y respeta el tope legal', () => {
  // Con más asientos el costo por puesto baja (se reparte entre más ocupantes).
  const oneSeat = getMaxFarePerSeat('pamplona', 'cucuta', 1);
  const threeSeats = getMaxFarePerSeat('pamplona', 'cucuta', 3);
  assert.ok(oneSeat > 0);
  assert.ok(threeSeats > 0);
  assert.ok(threeSeats < oneSeat);
});

test('getMaxFarePerSeat devuelve 0 para ruta desconocida o asientos inválidos', () => {
  assert.equal(getMaxFarePerSeat('bogota', 'malaga', 3), 0);
  assert.equal(getMaxFarePerSeat('pamplona', 'cucuta', 0), 0);
});

test('getMaxFarePerSeat redondea a múltiplos de 500', () => {
  const fare = getMaxFarePerSeat('pamplona', 'bucaramanga', 2);
  assert.equal(fare % 500, 0);
});

test('isValidColombianPhone acepta celulares válidos (con y sin espacios)', () => {
  assert.equal(isValidColombianPhone('+573124567890'), true);
  assert.equal(isValidColombianPhone('+57 312 456 7890'), true);
});

test('isValidColombianPhone rechaza formatos inválidos', () => {
  assert.equal(isValidColombianPhone('3124567890'), false); // sin +57
  assert.equal(isValidColombianPhone('+57 212 456 7890'), false); // no empieza en 3
  assert.equal(isValidColombianPhone('+57 312 456 789'), false); // dígitos de menos
});
