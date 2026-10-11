/**
 * Qué herramientas y qué campos tienen sentido según el tipo de local.
 *
 * POR QUÉ EXISTE. Hasta ahora la ÚNICA diferenciación del catálogo era
 * `manejaInventario()`, un booleano sobre cuatro categorías, y de ahí colgaban
 * cuatro `if` en la misma pantalla. El resultado medido: un local de
 * electrodomésticos, un restaurante y un supermercado veían el mismo
 * formulario — y, peor, **la carta por foto acabó en el cajón equivocado**.
 *
 * Estaba escrita dentro del bloque del inventario, con un comentario que lo
 * explicaba sin querer: «va junto al inventario porque es el mismo tipo de
 * negocio». Es justo al revés. Un supermercado recibe un CSV de su proveedor;
 * **el que tiene una carta impresa es el restaurante** — que era exactamente
 * para quien se construyó esa función, y era el único que no la veía.
 *
 * Un booleano no puede sostener esto. Lo que distingue a estos negocios no es
 * «¿cuenta existencias?»: es que venden cosas distintas y se catalogan
 * distinto.
 *
 * LAS DOS REGLAS QUE LO SOSTIENEN:
 *
 *   1. **Lo que no aplica no existe, no se esconde a medias.** Un campo oculto
 *      que sigue guardando valor deja productos con datos que nadie puso y que
 *      nadie puede corregir, porque no ve el campo.
 *   2. **El perfil decide qué se MUESTRA, nunca qué se puede guardar.** Un
 *      supermercado que ayer estaba registrado como «otro» no puede perder las
 *      existencias que ya tenía por cambiar de categoría. El backend sigue
 *      aceptando y devolviendo todos los campos.
 *
 * `Record<BusinessCategory, PerfilCatalogo>` a propósito: añadir una categoría
 * sin decidir su perfil NO COMPILA. Es el mismo patrón de los mapas de
 * `business.service`, y es lo que evita que la próxima categoría herede por
 * accidente el cajón de otra — que es el defecto que esto viene a corregir.
 */

export type CategoriaComercio =
  | 'restaurant' | 'supermarket' | 'pharmacy' | 'store' | 'other'

/** Qué se le pide a un producto de este tipo de local. */
export type DatosDeMarca =
  /** Un plato no tiene marca. */
  | 'ninguno'
  /** Un producto de supermercado o farmacia tiene marca («Alpina»). */
  | 'marca'
  /** Un electrodoméstico tiene marca, modelo y garantía. */
  | 'marca-modelo-garantia'

export interface PerfilCatalogo {
  /** Subir la carta impresa como foto y que el OCR proponga los platos. */
  cartaPorFoto: boolean
  /** Carga masiva por CSV: miles de referencias que nadie teclea. */
  csvMasivo: boolean
  /** Escáner y campo de código de barras. */
  codigoDeBarras: boolean
  /**
   * Contar unidades.
   *
   * Un restaurante NO cuenta: el plato se agota y se marca agotado, pero nadie
   * lleva «quedan 7 bandejas paisas». Pedirle un número es pedirle que lo
   * mantenga, y un stock que nadie actualiza deja de vender lo que sí hay.
   */
  existencias: boolean
  /** Variantes con precio: tamaño, adiciones, término de la carne. */
  opciones: boolean
  marca: DatosDeMarca
  /** Cómo se llama una sección en ESTE negocio, en singular y en plural. */
  seccion: { una: string; varias: string }
  /** El ejemplo del campo «sección», para que no haya que inventarlo. */
  ejemploSeccion: string
}

const RESTAURANTE: PerfilCatalogo = {
  cartaPorFoto: true,
  csvMasivo: false,
  codigoDeBarras: false,
  existencias: false,
  opciones: true,
  marca: 'ninguno',
  seccion: { una: 'Sección de la carta', varias: 'Secciones' },
  ejemploSeccion: 'Hamburguesas, Bebidas, Postres',
}

const SUPERMERCADO: PerfilCatalogo = {
  cartaPorFoto: false,
  csvMasivo: true,
  codigoDeBarras: true,
  existencias: true,
  opciones: false,
  marca: 'marca',
  seccion: { una: 'Pasillo', varias: 'Pasillos' },
  ejemploSeccion: 'Lácteos, Aseo, Bebidas',
}

const TIENDA: PerfilCatalogo = {
  cartaPorFoto: false,
  csvMasivo: true,
  codigoDeBarras: true,
  existencias: true,
  // Talla y color son variantes con precio distinto, igual que el tamaño de
  // una pizza: es el mismo mecanismo, no uno nuevo.
  opciones: true,
  marca: 'marca-modelo-garantia',
  seccion: { una: 'Departamento', varias: 'Departamentos' },
  ejemploSeccion: 'Electrodomésticos, Ropa, Hogar',
}

/**
 * El perfil de cada categoría.
 *
 * `other` hereda el de tienda y NO el de restaurante, a propósito: es el cajón
 * donde cae quien no se reconoció en los otros cuatro, y de los dos extremos
 * el de inventario es el que menos daño hace — enseñar un campo de existencias
 * a quien no lo necesita es ruido; esconderle el código de barras a una
 * ferretería es dejarla sin la herramienta por la que vino.
 *
 * `pharmacy` es supermercado con otro nombre en sus secciones: una droguería
 * cuenta unidades, escanea códigos y no tiene carta.
 */
export const PERFIL_CATALOGO: Record<CategoriaComercio, PerfilCatalogo> = {
  restaurant: RESTAURANTE,
  supermarket: SUPERMERCADO,
  pharmacy: { ...SUPERMERCADO, seccion: { una: 'Sección', varias: 'Secciones' }, ejemploSeccion: 'Analgésicos, Cuidado personal' },
  store: TIENDA,
  other: TIENDA,
}

/**
 * El perfil de un local, con un respaldo honesto mientras no se sabe cuál es.
 *
 * La categoría llega de una petición que puede no haber vuelto todavía. Antes
 * de saberla se usa el de tienda: es el que más herramientas enseña, y que
 * aparezca un campo de más durante un instante es mucho menos grave que
 * esconder el que la persona vino a usar y que no vuelva a aparecer.
 */
export function perfilDe(categoria?: string | null): PerfilCatalogo {
  if (categoria && categoria in PERFIL_CATALOGO) {
    return PERFIL_CATALOGO[categoria as CategoriaComercio]
  }
  return TIENDA
}
