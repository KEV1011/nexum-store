/**
 * Caché con tope de tamaño y caducidad, que expulsa lo usado hace más tiempo.
 *
 * Se escribió para las teselas del mapa: una vista son 15-25 imágenes y todo el
 * mundo mira el mismo centro del pueblo, así que sin caché cada una viajaba otra
 * vez hasta Google y el mapa entraba a trozos.
 *
 * Vive aquí y no dentro de `geo.service` porque el riesgo real de una caché no
 * es que falle un acierto —eso solo la hace inútil— sino que **no expulse
 * nunca**: en la instancia pequeña de Render eso es una fuga de memoria que
 * nadie nota hasta que el servicio se reinicia solo. Eso hay que poder probarlo.
 */
export class LruCache<T> {
  /**
   * @param maxEntradas Cuántas caben. Se cuenta por número y no por bytes
   *   porque las teselas pesan todas parecido (10-40 KB) y pesar cada valor
   *   obligaría a serializarlo.
   * @param ttlMs Cuánto vale una entrada.
   * @param ahora Reloj inyectable, para que las pruebas no duerman.
   */
  constructor(
    private readonly maxEntradas: number,
    private readonly ttlMs: number,
    private readonly ahora: () => number = Date.now,
  ) {
    if (maxEntradas < 1) throw new Error('maxEntradas debe ser al menos 1');
  }

  private readonly datos = new Map<string, { valor: T; guardadaEn: number }>();

  get size(): number {
    return this.datos.size;
  }

  get(clave: string): T | null {
    const hit = this.datos.get(clave);
    if (!hit) return null;
    if (this.ahora() - hit.guardadaEn > this.ttlMs) {
      this.datos.delete(clave);
      return null;
    }
    // `Map` conserva el orden de inserción: reinsertar la marca como la más
    // reciente, así lo que se expulsa es lo más viejo EN USO y no lo más viejo
    // en llegar. Sin esto, la tesela del centro —la que todos piden— acabaría
    // expulsada por teselas de las afueras que nadie vuelve a mirar.
    this.datos.delete(clave);
    this.datos.set(clave, hit);
    return hit.valor;
  }

  set(clave: string, valor: T): void {
    // Si ya estaba, se borra primero para que vuelva a entrar como la más
    // reciente (y para no contarla dos veces en el tope).
    this.datos.delete(clave);
    while (this.datos.size >= this.maxEntradas) {
      const masVieja = this.datos.keys().next();
      if (masVieja.done) break;
      this.datos.delete(masVieja.value);
    }
    this.datos.set(clave, { valor, guardadaEn: this.ahora() });
  }

  clear(): void {
    this.datos.clear();
  }
}
