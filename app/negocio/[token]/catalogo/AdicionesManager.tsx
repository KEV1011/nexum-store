'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, Check, X, Layers, AlertTriangle } from 'lucide-react'

import { BOTON, TARJETA } from '../../../ui'
import { formatCOP } from '../../../moneda'
import { etiquetaDeGrupo } from '../../../opciones-texto'
import { BACKEND_URL } from '../../../backend'


const INPUT =
  'w-full min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 ' +
  'focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'

// ── El ancho de un campo lo fija su CONTENEDOR, nunca una clase encima ──────
//
// `INPUT` ya trae `w-full`, así que escribir `${INPUT} w-24` pone DOS
// utilidades de `width` en el mismo elemento. Entre dos clases con la misma
// especificidad gana la que esté más abajo en la hoja de estilos, no la que
// se escriba después en el `className` — y Tailwind ordena la hoja a su
// manera. En el editor de adiciones ganaba `w-full`: el campo del PRECIO se
// estiraba a todo el ancho y aplastaba el del NOMBRE hasta dejarlo en unos
// treinta píxeles, o sea un cuadradito donde no se podía escribir nada.
//
// Esto no lo caza nadie: compila, pasa el build y el tipado, y solo se ve
// con el portal abierto delante. Por eso el ancho vive en un `<span>` que
// envuelve al campo — ahí `w-full` siempre significa «todo mi contenedor»,
// que es lo que se quiso decir— y `catalogo-anchos.test.ts` falla si alguien
// vuelve a apilar una clase de ancho sobre `INPUT`.
const ANCHO_NUMERO = 'inline-block w-16 shrink-0'
const ANCHO_PRECIO = 'inline-block w-24 shrink-0'
const ANCHO_FLEXIBLE = 'min-w-0 flex-1'

interface Opcion {
  id?: string
  name: string
  priceDelta: number
  isAvailable?: boolean
}

export interface Grupo {
  id?: string
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  label?: string
  usedBy?: number
  options: Opcion[]
}

const GRUPO_NUEVO: Grupo = {
  name: '',
  required: false,
  minSelect: 0,
  maxSelect: 1,
  options: [{ name: '', priceDelta: 0 }],
}

/**
 * Los tres grupos que tiene casi cualquier restaurante, ya configurados.
 *
 * El editor sabe hacer los tres, pero «obligatorio, mínimo 1, máximo 1, a $0»
 * no es como piensa el dueño en «el plato viene con papa o arroz»: piensa en
 * el ACOMPAÑAMIENTO. Con la plantilla solo escribe sus opciones. Las opciones
 * van vacías a propósito —salvo el ejemplo de la papa, que es el de casi todas
 * las cartas—: rellenarlas sería escribirle la carta al dueño, y un «Guardar»
 * distraído le ofrecería al cliente algo que el local no tiene.
 */
const PLANTILLAS: ReadonlyArray<{ etiqueta: string; ayuda: string; grupo: Grupo }> = [
  {
    etiqueta: 'Acompañamiento a escoger',
    ayuda: 'Viene con el plato: papa, arroz, patacón… El cliente escoge uno.',
    grupo: {
      name: 'Acompañamiento',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Papa a la francesa', priceDelta: 0 }, { name: '', priceDelta: 0 }],
    },
  },
  {
    etiqueta: 'Adicionales que se cobran',
    ayuda: 'Queso, huevo, tocineta… Se suman al precio.',
    grupo: {
      name: 'Adicionales',
      required: false,
      minSelect: 0,
      maxSelect: 10,
      options: [{ name: '', priceDelta: 0 }],
    },
  },
  {
    etiqueta: 'Tamaño',
    ayuda: 'Personal, mediana, familiar… Se escoge uno.',
    grupo: {
      name: 'Tamaño',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: '', priceDelta: 0 }],
    },
  },
]

/**
 * La biblioteca de adiciones del negocio.
 *
 * POR QUÉ EXISTE. Un grupo de opciones colgaba de UN plato, así que las once
 * «ADICIONALES» de una carta de doce arepas eran 132 filas escritas a mano —y
 * subir el aguacate de 4.000 a 5.000 pedía tocar doce sitios, con uno que se
 * queda viejo y nadie se entera hasta que un cliente pague de menos—. Aquí el
 * grupo se crea UNA vez, su precio vive en un sitio, y los platos lo adjuntan.
 *
 * «Aplicar a toda la sección» es la acción que de verdad ahorra la tarde.
 * Escribe las filas de una vez, EXPLÍCITAMENTE, en vez de guardar «este grupo
 * aplica a la categoría X»: con lo segundo, un plato que cambia de sección
 * perdería sus adiciones sin que nadie lo tocara, y eso no se ve hasta que un
 * cliente no puede pedir el aguacate.
 */
export function AdicionesManager({
  token,
  secciones,
  onAplicado,
  onCambio,
}: {
  token: string
  secciones: string[]
  onAplicado: () => void
  /** La biblioteca tal como queda tras cada carga o cambio. El formulario de
   *  «Agregar producto» la usa para ofrecer las adiciones con un toque, sin
   *  pedirla otra vez al servidor y sin quedarse con una copia vieja. */
  onCambio?: (grupos: Grupo[]) => void
}) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null)
  useEffect(() => {
    if (grupos) onCambio?.(grupos)
  }, [grupos, onCambio])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aplicando, setAplicando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/option-groups`)
      const json = (await res.json()) as { success: boolean; data?: Grupo[]; error?: string }
      if (json.success && json.data) setGrupos(json.data)
      else setError(json.error ?? 'No pudimos cargar tus adiciones.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    }
  }, [token])

  useEffect(() => { void cargar() }, [cargar])

  async function guardar() {
    if (!editando) return
    setGuardando(true)
    setError(null)
    try {
      const url = editando.id
        ? `${BACKEND_URL}/business/${token}/option-groups/${editando.id}`
        : `${BACKEND_URL}/business/${token}/option-groups`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando),
      })
      const json = (await res.json()) as { success: boolean; data?: Grupo[]; error?: string }
      if (json.success && json.data) {
        setGrupos(json.data)
        setEditando(null)
      } else {
        // El motivo lo redacta el backend en español y es el que vale: si el
        // portal escribiera el suyo, acabarían diciendo cosas distintas del
        // mismo grupo.
        setError(json.error ?? 'No se pudo guardar.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(g: Grupo) {
    const usos = g.usedBy ?? 0
    const texto = usos > 0
      ? `«${g.name}» se usa en ${usos} plato${usos === 1 ? '' : 's'}. Si lo eliminas, esos platos se quedan sin esas opciones. ¿Continuar?`
      : `¿Eliminar «${g.name}»?`
    if (!confirm(texto)) return
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/option-groups/${g.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; data?: Grupo[]; error?: string }
      if (json.success && json.data) { setGrupos(json.data); onAplicado() }
      else setError(json.error ?? 'No se pudo eliminar.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    }
  }

  async function aplicar(g: Grupo, categoria: string) {
    setAplicando(g.id!)
    setError(null)
    setAviso(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/option-groups/${g.id}/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { anadidos: number; total: number }
        error?: string
      }
      if (json.success && json.data) {
        const { anadidos, total } = json.data
        setAviso(
          anadidos === 0
            ? `Los ${total} platos de «${categoria}» ya tenían «${g.name}».`
            : `«${g.name}» se añadió a ${anadidos} plato${anadidos === 1 ? '' : 's'} de «${categoria}».`,
        )
        await cargar()
        onAplicado()
      } else {
        setError(json.error ?? 'No se pudo aplicar.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setAplicando(null)
    }
  }

  return (
    <section className={`${TARJETA} mb-4 p-4`}>
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
        <Layers className="h-4 w-4 text-emerald-600" />
        Acompañamientos, adiciones y tamaños
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Créalos una vez y añádelos a los platos que quieras. El precio vive aquí:
        si cambias el del aguacate, cambia en todos.
      </p>

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {aviso && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {aviso}
        </p>
      )}

      {grupos === null && !error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </p>
      )}

      {grupos !== null && grupos.length === 0 && !editando && (
        <p className="mt-3 text-xs text-slate-500">
          Todavía no tienes ninguno. Lo más común en un restaurante: el
          acompañamiento que viene con el plato (papa, arroz…) y los adicionales
          que se cobran.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {(grupos ?? []).map((g) => (
          <div key={g.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{g.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {g.label ?? etiquetaDeGrupo(g)}
              </span>
              <span className="text-[11px] text-slate-400">
                {g.options.length} opcion{g.options.length === 1 ? '' : 'es'} ·{' '}
                {(g.usedBy ?? 0) === 0
                  ? 'sin usar'
                  : `en ${g.usedBy} plato${g.usedBy === 1 ? '' : 's'}`}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditando(JSON.parse(JSON.stringify(g)) as Grupo)}
                  className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${g.name}`}
                  onClick={() => void borrar(g)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>

            <p className="mt-1 truncate text-xs text-slate-500">
              {g.options
                .map((o) => (o.priceDelta ? `${o.name} ${formatCOP(o.priceDelta)}` : o.name))
                .join(' · ')}
            </p>

            {secciones.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">
                  Añadir a toda la sección:
                </span>
                {secciones.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={aplicando === g.id}
                    onClick={() => void aplicar(g, sec)}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {aplicando === g.id ? '…' : sec}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {editando ? (
        <EditorGrupo
          grupo={editando}
          guardando={guardando}
          onChange={setEditando}
          onGuardar={() => void guardar()}
          onCancelar={() => { setEditando(null); setError(null) }}
        />
      ) : (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-600">Crear:</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {PLANTILLAS.map((p) => (
              <button
                key={p.etiqueta}
                type="button"
                onClick={() => setEditando(JSON.parse(JSON.stringify(p.grupo)) as Grupo)}
                className="min-h-[44px] rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-emerald-400"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Plus className="h-3.5 w-3.5 text-emerald-600" /> {p.etiqueta}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{p.ayuda}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditando({ ...GRUPO_NUEVO, options: [{ name: '', priceDelta: 0 }] })}
            className="mt-2 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
          >
            O uno en blanco
          </button>
        </div>
      )}
    </section>
  )
}

function EditorGrupo({
  grupo,
  guardando,
  onChange,
  onGuardar,
  onCancelar,
}: {
  grupo: Grupo
  guardando: boolean
  onChange: (g: Grupo) => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  const patch = (p: Partial<Grupo>) => onChange({ ...grupo, ...p })
  const patchOpcion = (i: number, p: Partial<Opcion>) =>
    onChange({ ...grupo, options: grupo.options.map((o, j) => (j === i ? { ...o, ...p } : o)) })

  return (
    <div className="mt-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
      <input
        className={INPUT}
        placeholder="Nombre del grupo (ej: Adicionales, Tamaño)"
        value={grupo.name}
        onChange={(e) => patch({ name: e.target.value })}
        maxLength={40}
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={grupo.required || grupo.minSelect > 0}
            onChange={(e) => patch({
              required: e.target.checked,
              minSelect: e.target.checked ? Math.max(1, grupo.minSelect) : 0,
            })}
          />
          Obligatorio
        </label>
        <label className="inline-flex items-center gap-1.5">
          Mínimo
          {/* El ancho lo fija el CONTENEDOR, nunca una clase encima de
              `INPUT`: ver la nota de `ANCHO_*` más abajo. */}
          <span className={ANCHO_NUMERO}>
            <input
              className={INPUT}
              inputMode="numeric"
              value={String(grupo.minSelect)}
              onChange={(e) => patch({ minSelect: Number(e.target.value.replace(/[^\d]/g, '') || 0) })}
              maxLength={2}
            />
          </span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          Máximo
          <span className={ANCHO_NUMERO}>
            <input
              className={INPUT}
              inputMode="numeric"
              value={String(grupo.maxSelect)}
              onChange={(e) => patch({ maxSelect: Number(e.target.value.replace(/[^\d]/g, '') || 1) })}
              maxLength={2}
            />
          </span>
        </label>
        {/* Lo que va a leer el cliente, con la MISMA función del servidor. */}
        <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
          {etiquetaDeGrupo(grupo)}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {grupo.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={ANCHO_FLEXIBLE}>
              <input
                className={INPUT}
                placeholder="Opción (ej: Porción de aguacate)"
                value={o.name}
                onChange={(e) => patchOpcion(i, { name: e.target.value })}
                maxLength={40}
              />
            </span>
            <span className="shrink-0 text-xs text-slate-400">+$</span>
            <span className={ANCHO_PRECIO}>
              <input
                className={INPUT}
                inputMode="numeric"
                placeholder={grupo.required ? 'Incluido' : '0'}
                value={o.priceDelta ? String(o.priceDelta) : ''}
                onChange={(e) =>
                  patchOpcion(i, { priceDelta: Number(e.target.value.replace(/[^\d]/g, '') || 0) })}
                maxLength={9}
              />
            </span>
            <button
              type="button"
              aria-label="Quitar opción"
              onClick={() => onChange({ ...grupo, options: grupo.options.filter((_, j) => j !== i) })}
              className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...grupo, options: [...grupo.options, { name: '', priceDelta: 0 }] })}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar opción
      </button>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onGuardar} disabled={guardando} className={`${BOTON.principal} flex-1`}>
          {guardando
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
            : <><Check className="h-4 w-4" /> Guardar grupo</>}
        </button>
        <button type="button" onClick={onCancelar} className={BOTON.secundario}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
