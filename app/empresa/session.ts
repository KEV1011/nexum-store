// ── Sesión del portal de empresa ─────────────────────────────────────────────
//
// El token vivía en `sessionStorage`, y `sessionStorage` es POR PESTAÑA. Los
// tres enlaces que abren una página aparte —informe del viaje, cuenta de cobro
// y remito— usan `target="_blank" rel="noreferrer"`, así que la pestaña nueva
// nace con un almacén vacío: el informe respondía "Abre el portal e inicia
// sesión" a alguien que ACABABA de iniciar sesión, en la pestaña de al lado.
//
// Se pasa a `localStorage`, que sí es compartido entre pestañas del mismo
// origen. Es el mismo nivel de exposición frente a XSS —ambos son legibles
// desde JavaScript—; lo único que cambia es que la sesión sobrevive al cierre
// del navegador, y para eso está el botón de cerrar sesión.
//
// Se sigue LEYENDO de `sessionStorage` como respaldo para no echar a quien
// tenga una sesión abierta cuando se despliegue este cambio.

const CLAVE_TOKEN = 'nx_operator_token';
const CLAVE_INFO = 'nx_operator_info';

/** El token de la sesión, o `null` si no hay ninguna abierta. */
export function leerToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CLAVE_TOKEN) ?? sessionStorage.getItem(CLAVE_TOKEN);
}

/** Los datos de la empresa guardados junto al token. */
export function leerInfo(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CLAVE_INFO) ?? sessionStorage.getItem(CLAVE_INFO);
}

export function guardarSesion(token: string, info: string): void {
  localStorage.setItem(CLAVE_TOKEN, token);
  localStorage.setItem(CLAVE_INFO, info);
}

/** Borra la sesión de los DOS almacenes: si solo se limpiara uno, el respaldo
 *  la resucitaría en la siguiente carga y "cerrar sesión" no cerraría nada. */
export function borrarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_INFO);
  sessionStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_INFO);
}
