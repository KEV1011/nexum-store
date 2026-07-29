// ── Carga masiva de productos por CSV ────────────────────────────────────────
//
// Un supermercado no teclea 3.000 referencias. Sube un archivo, ve exactamente
// qué va a pasar y recién ahí confirma.
//
// La vista previa NO es un adorno: un CSV con la columna de precio corrida
// destrozaría el catálogo entero, y el dueño solo lo notaría cuando un cliente
// comprara algo por el precio equivocado.

/** Columnas de la plantilla, en el orden en que se descargan. */
export const CSV_COLUMNS = [
  'nombre',
  'precio',
  'seccion',
  'descripcion',
  'codigo_barras',
  'marca',
  'unidad',
  'existencias',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface CsvProductRow {
  /** Número de línea en el archivo (1 = primera fila de datos). */
  linea: number;
  nombre: string;
  precio: number;
  seccion: string;
  descripcion?: string;
  barcode?: string;
  brand?: string;
  unit?: string;
  stock?: number | null;
}

export interface CsvPreview {
  /** Filas válidas que crearán un producto nuevo. */
  nuevos: CsvProductRow[];
  /** Filas válidas que actualizarán un producto existente (por código). */
  actualizaciones: Array<CsvProductRow & { productId: string; nombreActual: string }>;
  /** Filas descartadas, con el motivo en español. */
  errores: Array<{ linea: number; motivo: string; contenido: string }>;
}

/**
 * Divide una línea CSV respetando comillas dobles, para que una descripción con
 * comas ("Arroz, 500g") no se parta en dos columnas.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Comilla doble escapada dentro de un campo entrecomillado.
      if (enComillas && line[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if ((c === ',' || c === ';') && !enComillas) {
      out.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  out.push(actual);
  return out.map((v) => v.trim());
}

/** Plantilla que descarga el negocio, con una fila de ejemplo. */
export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(','),
    'Arroz Diana 500g,3500,Granos,Arroz blanco,7702001234567,Diana,unidad,40',
  ].join('\n');
}

/**
 * Interpreta el CSV y clasifica cada fila. NO toca la base de datos: devuelve
 * lo que pasaría, para que el dueño lo confirme antes.
 *
 * @param existentesPorCodigo Productos que el negocio ya tiene, por código de
 *        barras — lo que decide si una fila crea o actualiza.
 */
export function parseProductCsv(
  contenido: string,
  existentesPorCodigo: Map<string, { id: string; name: string }>,
): CsvPreview {
  const preview: CsvPreview = { nuevos: [], actualizaciones: [], errores: [] };

  const lineas = contenido
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lineas.length === 0) {
    preview.errores.push({ linea: 0, motivo: 'El archivo está vacío.', contenido: '' });
    return preview;
  }

  // La cabecera es opcional. Se considera que la primera fila ES cabecera si
  // menciona alguna columna conocida; en ese caso DEBE traer nombre y precio, y
  // si no los trae se avisa en vez de importar basura (con 'marca,unidad' se
  // guardaría la marca como nombre y la unidad como precio). Una primera fila
  // que no menciona ninguna columna se toma como datos en el orden de la
  // plantilla.
  const primera = splitCsvLine(lineas[0]!).map((c) => c.toLowerCase());
  const pareceCabecera = primera.some((c) => (CSV_COLUMNS as readonly string[]).includes(c));
  const columnas: string[] = pareceCabecera ? primera : [...CSV_COLUMNS];
  const filas = pareceCabecera ? lineas.slice(1) : lineas;

  const indice = (col: CsvColumn): number => columnas.indexOf(col);

  if (indice('nombre') === -1 || indice('precio') === -1) {
    preview.errores.push({
      linea: 1,
      motivo: 'Faltan las columnas obligatorias "nombre" y "precio".',
      contenido: lineas[0]!,
    });
    return preview;
  }

  // Detecta códigos repetidos DENTRO del archivo: dos filas con el mismo código
  // se pisarían entre sí y el resultado dependería del orden.
  const vistosEnArchivo = new Set<string>();

  filas.forEach((linea, i) => {
    const numero = i + 1;
    const celdas = splitCsvLine(linea);
    const val = (col: CsvColumn): string => {
      const idx = indice(col);
      return idx === -1 ? '' : (celdas[idx] ?? '').trim();
    };

    const nombre = val('nombre');
    if (!nombre) {
      preview.errores.push({ linea: numero, motivo: 'Falta el nombre.', contenido: linea });
      return;
    }

    // Acepta "3.500", "3500" y "$3.500": los separadores de miles son comunes
    // al exportar desde Excel en Colombia.
    const precioTexto = val('precio').replace(/[^\d]/g, '');
    const precio = Number(precioTexto);
    if (!precioTexto || !(precio > 0)) {
      preview.errores.push({
        linea: numero,
        motivo: `Precio inválido ("${val('precio')}").`,
        contenido: linea,
      });
      return;
    }

    const stockTexto = val('existencias');
    let stock: number | null = null;
    if (stockTexto !== '') {
      const n = Number(stockTexto.replace(/[^\d]/g, ''));
      if (!Number.isFinite(n)) {
        preview.errores.push({
          linea: numero,
          motivo: `Existencias inválidas ("${stockTexto}").`,
          contenido: linea,
        });
        return;
      }
      stock = Math.max(0, Math.trunc(n));
    }

    const barcode = val('codigo_barras') || undefined;
    if (barcode) {
      if (vistosEnArchivo.has(barcode)) {
        preview.errores.push({
          linea: numero,
          motivo: `El código ${barcode} está repetido en el archivo.`,
          contenido: linea,
        });
        return;
      }
      vistosEnArchivo.add(barcode);
    }

    const fila: CsvProductRow = {
      linea: numero,
      nombre,
      precio,
      seccion: val('seccion') || 'General',
      descripcion: val('descripcion') || undefined,
      barcode,
      brand: val('marca') || undefined,
      unit: val('unidad') || undefined,
      stock,
    };

    const existente = barcode ? existentesPorCodigo.get(barcode) : undefined;
    if (existente) {
      preview.actualizaciones.push({
        ...fila,
        productId: existente.id,
        nombreActual: existente.name,
      });
    } else {
      preview.nuevos.push(fila);
    }
  });

  return preview;
}
