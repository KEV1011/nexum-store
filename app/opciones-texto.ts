// ── Cómo se lee un grupo de opciones, del lado del portal ───────────────────
//
// Copia de `etiquetaDeGrupo` de `backend/src/lib/texto-opciones.ts`. Vive aquí
// porque el portal es otro servicio y no puede importar de `backend/src`, y
// porque el editor necesita la frase MIENTRAS el dueño mueve los números —el
// servidor solo la manda al guardar, y una vista previa que llegue después de
// guardar no es una vista previa.
//
// `backend/src/lib/opciones-texto-portal.test.ts` pasa la misma tabla de casos
// por las dos y falla si discrepan — el patrón de `app/moneda.ts`. Lo que eso
// impide: que el dueño configure «elige hasta 3» leyendo una frase y el
// cliente vea otra en el teléfono.

/** La frase que describe el grupo: «Obligatorio · elige 1». */
export function etiquetaDeGrupo(g: {
  required: boolean
  minSelect: number
  maxSelect: number
}): string {
  const obligatorio = g.required || g.minSelect > 0
  const { minSelect: min, maxSelect: max } = g

  if (!obligatorio) {
    return max <= 1 ? 'Opcional' : `Opcional · hasta ${max}`
  }
  if (min === max) return `Obligatorio · elige ${min}`
  if (min <= 1) return `Obligatorio · elige hasta ${max}`
  return `Obligatorio · elige entre ${min} y ${max}`
}
