'use client'

import { useRef, useState } from 'react'
import { Camera, AlertTriangle, Trash2, Loader2, Layers, Split, Utensils, NotebookPen } from 'lucide-react'

import { BOTON, TARJETA } from '../../../ui'
import { formatCOP } from '../../../moneda'
import { BACKEND_URL } from '../../../backend'
import {
  motivoParaNoAgrupar,
  pesosDeTexto,
  varianteParaEnviar,
  type VarianteEditable,
} from '../../../variantes-carta'
import {
  agruparAdicionales,
  agruparGuarniciones,
  destinoPorDefecto,
  ROLES_CARTA,
  type RolCarta,
} from '../../../roles-carta'
import { RevisionIA } from './RevisionIA'
import { ReportarCarta } from './ReportarCarta'


interface LineaCarta {
  /** Los ingredientes, cuando venían pegados al nombre en la carta. */
  descripcion?: string
  linea: number
  nombre: string
  precio: number | null
  seccion: string
  aviso?: string
  /** Plato, adicional o acompañamiento: lo propone el servidor. */
  rol?: RolCarta
  motivoRol?: string
}

interface VarianteSugerida {
  nombre: string
  descripcion?: string
  seccion: string
  precioBase: number
  grupo: string
  opciones: Array<{ nombre: string; precio: number; precioDelta: number }>
  lineas: number[]
  faltanNombres: boolean
  rol?: 'plato' | 'acompanamiento'
}

/** Lo que el dueño está editando. `precio` es texto porque se está tecleando. */
interface FilaEditable {
  id: number
  /** Línea de la carta: es lo que enlaza una fila con su grupo de tamaños. */
  linea: number
  nombre: string
  precio: string
  descripcion: string
  seccion: string
  aviso?: string
  rol: RolCarta
  /** Por qué el lector propuso ese tipo, para que el dueño lo juzgue. */
  motivoRol?: string
}

/** Un renglón de la foto que no es de la carta (teléfono, dirección…). */
interface RenglonIgnorado {
  linea: number
  texto: string
  motivo: string
}

/** Lo que la carta dice que traen los platos, en edición. */
interface NotaEditable {
  id: number
  seccion: string
  texto: string
}

/** Un grupo de tamaños en edición. Cada tamaño con SU precio, como la carta. */
interface VarEditable extends VarianteEditable {
  id: number
  lineas: number[]
  /** Nació de una línea con varios precios: hay que bautizar los tamaños. */
  faltanNombres: boolean
  /** El dueño quiere agruparlos. Si no, sus filas vuelven a la tabla. */
  aceptada: boolean
  rol: 'plato' | 'acompanamiento'
  /** El cambio de la IA que lo propuso: deshacerlo lo quita. */
  origenIA?: string
}

/**
 * La carta impresa, leída de una foto.
 *
 * POR QUÉ EXISTE. Convencer a un restaurante es una conversación; hacerle
 * digitar cuarenta platos es una tarde — y es lo segundo lo que de verdad
 * frena el registro. El dueño manda una foto de su carta y el catálogo le
 * queda escrito para revisar.
 *
 * LA TABLA ES EDITABLE, y ese es el punto. Un OCR siempre se equivoca en algo,
 * así que una lista de solo lectura obliga a rehacerla a mano y no ahorra
 * nada. Aquí se corrige en el sitio y nada se crea hasta que el dueño pulsa.
 *
 * Las filas SIN precio quedan fuera de la creación a propósito: el lector no
 * inventa precios, y crear un plato con el precio equivocado es plata y una
 * queja, mientras que un plato que falta es una fila que se añade en diez
 * segundos.
 *
 * LOS TAMAÑOS. Una carta escribe la picada tres veces —pequeña, mediana,
 * grande— y eso son tres productos sueltos que en la app se leen como tres
 * platos distintos. Arriba de la tabla se proponen agrupados: un plato con su
 * grupo de tamaños, que es como se modela de verdad. El dueño puede dejarlos
 * separados, y entonces sus filas vuelven a la tabla.
 */
export function CartaFoto({ token, onImported }: { token: string; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaEditable[] | null>(null)
  const [variantes, setVariantes] = useState<VarEditable[]>([])
  // Las secciones que el lector reconoció en la foto. El backend ya las
  // devolvía y este componente las IGNORABA, así que el dueño tenía que
  // escribir «Hamburguesas» plato por plato — y cada variante tecleada
  // («hamburguesas», «Hamburguesa») crea una sección distinta en su carta.
  const [secciones, setSecciones] = useState<string[]>([])
  // A qué secciones de platos se añade cada grupo de adicionales. Sin entrada
  // = a todas, que es lo que significa «ADICIONALES» al pie de una carta.
  const [destinos, setDestinos] = useState<Record<string, string[]>>({})
  // Lo que viene con el plato: a qué secciones va cada grupo y cuántas
  // opciones se escogen. Sin entrada = lo que propone `destinoPorDefecto`.
  const [guarnicionCfg, setGuarnicionCfg] = useState<Record<string, { aplicarA?: string[]; elige: number }>>({})
  // «Acompañados de papa a la francesa»: va a la descripción de los platos.
  const [notas, setNotas] = useState<NotaEditable[]>([])
  const [destinosNota, setDestinosNota] = useState<Record<number, string[]>>({})
  // Teléfono, dirección, horario: se leyeron y se dejaron fuera a propósito.
  // Se enseñan para que el dueño vea que no se perdió un plato.
  const [ignoradas, setIgnoradas] = useState<RenglonIgnorado[]>([])
  // Para el agente revisor: la foto (se le vuelve a mandar, reducida), el texto
  // que leyó el OCR (su fuente fiable de precios) y si el servidor lo tiene
  // activado. `lectura` cambia con cada foto: es lo que dispara la revisión.
  const [archivo, setArchivo] = useState<File | null>(null)
  const [textoCrudo, setTextoCrudo] = useState('')
  const [revisorIA, setRevisorIA] = useState(false)
  const [lectura, setLectura] = useState(0)
  // El código de esta lectura en el servidor: con él, «Se leyó mal» manda la
  // respuesta del lector tal cual, para volverla una prueba.
  const [lecturaId, setLecturaId] = useState<string | null>(null)

  async function leerFoto(file: File) {
    setError(null)
    setResultado(null)
    setLeyendo(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/carta-foto`, {
        method: 'POST',
        body,
      })
      const json = (await res.json()) as {
        success: boolean
        data?: {
          lineas: LineaCarta[]
          secciones?: string[]
          variantes?: VarianteSugerida[]
          notas?: Array<{ seccion: string; texto: string }>
          ignoradas?: RenglonIgnorado[]
          textoCrudo?: string
          lecturaId?: string
          revisorIA?: boolean
        }
        error?: string
      }
      if (!json.success || !json.data) {
        setError(json.error ?? 'No pudimos leer la carta.')
        return
      }
      if (json.data.lineas.length === 0) {
        setError(
          'No encontramos productos en la foto. Prueba con la carta derecha, '
          + 'bien iluminada y que se lean los precios.',
        )
        return
      }
      setSecciones(json.data.secciones ?? [])
      reemplazadas.current = {}
      setVariantes(
        (json.data.variantes ?? []).map((v, i) => ({
          id: i,
          nombre: v.nombre,
          descripcion: v.descripcion ?? '',
          seccion: v.seccion,
          grupo: v.grupo,
          opciones: v.opciones.map((o) => ({ nombre: o.nombre, precio: String(o.precio) })),
          lineas: v.lineas,
          faltanNombres: v.faltanNombres,
          // Las que vienen de varias líneas nacen aceptadas: los nombres de
          // los tamaños los escribió la carta. Las que salen de UNA línea con
          // varios precios no, porque todavía no tienen nombre y aceptarlas
          // solas dejaría al dueño con un formulario a medias sin pedirlo.
          aceptada: !v.faltanNombres,
          rol: v.rol ?? 'plato',
        })),
      )
      setFilas(
        json.data.lineas.map((l, i) => ({
          id: i,
          linea: l.linea,
          nombre: l.nombre,
          precio: l.precio == null ? '' : String(l.precio),
          descripcion: l.descripcion ?? '',
          seccion: l.seccion,
          ...(l.aviso ? { aviso: l.aviso } : {}),
          rol: l.rol ?? 'plato',
          ...(l.motivoRol ? { motivoRol: l.motivoRol } : {}),
        })),
      )
      setDestinos({})
      setGuarnicionCfg({})
      setNotas((json.data.notas ?? []).map((n, i) => ({ id: i, seccion: n.seccion, texto: n.texto })))
      setDestinosNota({})
      setIgnoradas(json.data.ignoradas ?? [])
      setArchivo(file)
      setTextoCrudo(json.data.textoCrudo ?? '')
      setLecturaId(json.data.lecturaId ?? null)
      setRevisorIA(json.data.revisorIA === true)
      setLectura((n) => n + 1)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLeyendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function editar(
    id: number,
    campo: 'nombre' | 'precio' | 'seccion' | 'descripcion',
    valor: string,
  ) {
    setFilas((prev) =>
      (prev ?? []).map((f) => (f.id === id ? { ...f, [campo]: valor } : f)),
    )
  }

  // Una fila sin precio que en realidad es la DESCRIPCIÓN del plato de
  // arriba: el lector la tomó por otro plato. Sin este botón el dueño tenía
  // que copiar el texto a mano, pegarlo arriba y borrar la fila — tres pasos
  // por cada renglón mal leído, en un teléfono.
  function unirAlDeArriba(id: number, arriba: number) {
    setFilas((prev) => {
      const lista = prev ?? []
      const fila = lista.find((x) => x.id === id)
      if (!fila) return lista
      const texto = [fila.nombre.trim(), fila.descripcion.trim()].filter(Boolean).join('. ')
      return lista
        .filter((x) => x.id !== id)
        .map((x) =>
          x.id === arriba
            ? { ...x, descripcion: [x.descripcion.trim(), texto].filter(Boolean).join('. ') }
            : x,
        )
    })
  }

  // Cambiar el tipo a mano borra el motivo: ya no es lo que propuso el lector.
  function cambiarRol(id: number, rol: RolCarta) {
    setFilas((prev) =>
      (prev ?? []).map((f) => (f.id === id ? { ...f, rol, motivoRol: undefined } : f)),
    )
  }

  // Una carta agrupa por secciones, y casi siempre la sección entera es del
  // mismo tipo: «ADICIONALES», «BEBIDAS». Cambiarlas de una en una es justo la
  // tarde que la foto venía a ahorrar.
  function rolDeSeccion(seccion: string, rol: RolCarta) {
    setFilas((prev) =>
      (prev ?? []).map((f) =>
        f.seccion.trim() === seccion.trim() ? { ...f, rol, motivoRol: undefined } : f,
      ),
    )
  }

  function alternarDestino(grupo: string, seccion: string, todas: string[]) {
    setDestinos((prev) => {
      const actual = prev[grupo] ?? todas
      const siguiente = actual.includes(seccion)
        ? actual.filter((x) => x !== seccion)
        : [...actual, seccion]
      return { ...prev, [grupo]: siguiente }
    })
  }

  // Los grupos que reemplazó un cambio de la IA, para devolverlos al deshacer.
  // En refs y no solo en estado: la revisión aplica varios cambios seguidos en
  // el mismo instante, y cada uno tiene que ver lo que dejó el anterior.
  const reemplazadas = useRef<Record<string, VarEditable[]>>({})
  const variantesRef = useRef(variantes)
  variantesRef.current = variantes

  // La IA propone grupos de tamaños (el precio de una sección, el mismo plato
  // en varias filas). Entran como los de la lectura; uno que ya agrupaba esas
  // filas se aparta —una fila no puede estar en dos grupos— y vuelve si el
  // dueño deshace el cambio.
  function variantesDeIA(id: string, lista: VarianteSugerida[] | null) {
    const prev = variantesRef.current
    let siguientes: VarEditable[]
    if (lista === null) {
      siguientes = [...prev.filter((v) => v.origenIA !== id), ...(reemplazadas.current[id] ?? [])]
      delete reemplazadas.current[id]
    } else {
      const lineas = new Set(lista.flatMap((v) => v.lineas))
      const apartadas = prev.filter((v) => v.lineas.some((l) => lineas.has(l)))
      reemplazadas.current[id] = apartadas
      let siguiente = prev.reduce((m, v) => Math.max(m, v.id), -1) + 1
      const nuevas: VarEditable[] = lista.map((v) => ({
        id: siguiente++,
        nombre: v.nombre,
        descripcion: v.descripcion ?? '',
        seccion: v.seccion,
        grupo: v.grupo,
        opciones: v.opciones.map((o) => ({ nombre: o.nombre, precio: String(o.precio) })),
        lineas: v.lineas,
        faltanNombres: v.faltanNombres,
        aceptada: !v.faltanNombres,
        rol: v.rol ?? 'plato',
        origenIA: id,
      }))
      siguientes = [...prev.filter((v) => !apartadas.includes(v)), ...nuevas]
    }
    variantesRef.current = siguientes
    setVariantes(siguientes)
  }

  function editarVariante(id: number, cambio: Partial<VarEditable>) {
    setVariantes((prev) => prev.map((v) => (v.id === id ? { ...v, ...cambio } : v)))
  }

  function editarOpcion(id: number, i: number, campo: 'nombre' | 'precio', valor: string) {
    setVariantes((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, opciones: v.opciones.map((o, j) => (j === i ? { ...o, [campo]: valor } : o)) }
          : v,
      ),
    )
  }

  // Las filas que un grupo se llevó no se pintan dos veces: estarían a la vez
  // dentro del plato con tamaños y sueltas en la tabla, y se crearían dos
  // veces. Si el dueño deshace el grupo, vuelven solas.
  const agrupadas = new Set(variantes.filter((v) => v.aceptada).flatMap((v) => v.lineas))
  const visibles = (filas ?? []).filter((f) => !agrupadas.has(f.linea))

  // Una guarnición SIN precio está lista: viene incluida con el plato. A
  // cualquier otra fila le falta el precio para poder crearse.
  const listas = visibles.filter(
    (f) => f.nombre.trim() && (pesosDeTexto(f.precio) != null || f.rol === 'guarnicion'),
  )
  const fuera = visibles.length - listas.length

  const aceptadas = variantes.filter((v) => v.aceptada)
  const problemas = aceptadas
    .map((v) => ({ v, motivo: motivoParaNoAgrupar(varianteParaEnviar(v)) }))
    .filter((x): x is { v: VarEditable; motivo: string } => x.motivo !== null)

  // Los adicionales NO son productos: se crean como un grupo de opciones que
  // los platos adjuntan. Se cuentan aparte para que el botón diga la verdad.
  const productosListos = listas.filter((f) => f.rol !== 'adicional' && f.rol !== 'guarnicion')
  const adicionalesListos = listas.filter((f) => f.rol === 'adicional')
  const guarnicionesListas = listas.filter((f) => f.rol === 'guarnicion')
  // Con la MISMA función que usa el servidor (copia vigilada por prueba) y
  // sobre las MISMAS filas que se le envían: lo que se ve aquí es lo que se crea.
  const gruposAdicionales = agruparAdicionales(
    listas.map((f) => ({ nombre: f.nombre, precio: pesosDeTexto(f.precio), seccion: f.seccion, rol: f.rol })),
  )
  const seccionesDePlatos = Array.from(new Set([
    ...productosListos.filter((f) => f.rol === 'plato').map((f) => f.seccion.trim()),
    ...aceptadas.filter((v) => v.rol === 'plato').map((v) => v.seccion.trim()),
  ]))
  const seccionesVisibles = Array.from(new Set(visibles.map((f) => f.seccion.trim())))
  // Lo que viene con el plato también puede ir en una bebida («elige tu
  // sabor»), así que aquí cuenta todo lo que se vende, no solo los platos.
  const seccionesConProductos = Array.from(new Set([
    ...productosListos.map((f) => f.seccion.trim()),
    ...aceptadas.map((v) => v.seccion.trim()),
  ]))
  const gruposGuarnicion = agruparGuarniciones(
    guarnicionesListas.length === 0
      ? []
      : listas.map((f) => ({ nombre: f.nombre, precio: pesosDeTexto(f.precio), seccion: f.seccion, rol: f.rol })),
  )
  const destinoGuarnicion = (grupo: string, secciones: string[]) =>
    guarnicionCfg[grupo]?.aplicarA ?? destinoPorDefecto(secciones, seccionesConProductos)
  const destinoNota = (n: NotaEditable) =>
    destinosNota[n.id] ?? destinoPorDefecto([n.seccion], seccionesDePlatos)
  const total = productosListos.length + (aceptadas.length - problemas.length)

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/carta-importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filas: listas.map((f) => ({
            nombre: f.nombre.trim(),
            precio: pesosDeTexto(f.precio),
            seccion: f.seccion.trim(),
            descripcion: f.descripcion.trim(),
            rol: f.rol,
          })),
          variantes: aceptadas.map((v) => ({ ...varianteParaEnviar(v), rol: v.rol })),
          adicionales: gruposAdicionales.map(({ nombre: grupo }) => ({
            grupo,
            aplicarA: destinos[grupo] ?? seccionesDePlatos,
          })),
          guarniciones: gruposGuarnicion.map(({ nombre: grupo, secciones: origen }) => ({
            grupo,
            aplicarA: destinoGuarnicion(grupo, origen),
            elige: guarnicionCfg[grupo]?.elige ?? 1,
          })),
          notas: notas
            .filter((n) => n.texto.trim())
            .map((n) => ({ texto: n.texto.trim(), seccion: n.seccion, aplicarA: destinoNota(n) })),
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: {
          creados: number
          actualizados: number
          conTamanos?: number
          acompanamientos?: number
          adicionalesNuevos?: number
          platosConAdicionales?: number
          gruposGuarnicion?: number
          platosConGuarnicion?: number
        }
        error?: string
      }
      if (json.success && json.data) {
        const {
          creados, actualizados, conTamanos = 0, acompanamientos = 0,
          adicionalesNuevos = 0, platosConAdicionales = 0, platosConGuarnicion = 0,
        } = json.data
        setResultado(
          `Listo: ${creados} producto${creados === 1 ? '' : 's'} creado${creados === 1 ? '' : 's'}`
          + (conTamanos > 0
            ? `, ${conTamanos} con tamaños`
            : '')
          + (acompanamientos > 0
            ? `, ${acompanamientos} se ofrece${acompanamientos === 1 ? '' : 'n'} al pagar`
            : '')
          + (adicionalesNuevos > 0
            ? `, ${adicionalesNuevos} adicional${adicionalesNuevos === 1 ? '' : 'es'} en ${platosConAdicionales} plato${platosConAdicionales === 1 ? '' : 's'}`
            : '')
          + (platosConGuarnicion > 0
            ? `, ${platosConGuarnicion} plato${platosConGuarnicion === 1 ? '' : 's'} con acompañamiento a escoger`
            : '')
          + (actualizados > 0 ? `, ${actualizados} actualizado${actualizados === 1 ? '' : 's'}.` : '.'),
        )
        setFilas(null)
        setVariantes([])
        setNotas([])
        setIgnoradas([])
        onImported()
      } else {
        setError(json.error ?? 'No se pudo crear el catálogo.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <section className={`${TARJETA} p-4 mb-4`}>
      <h2 className="font-bold text-slate-900 text-sm">Tu carta, desde una foto</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Tómale una foto a tu carta impresa y te dejamos los platos escritos.
        Revisa los precios antes de crearlos.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // En el celular abre la cámara directamente, que es de donde va a
        // salir la foto: pedirle al dueño que la busque en la galería es un
        // paso más para algo que va a hacer con la carta en la mano.
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void leerFoto(f)
        }}
      />

      {filas === null && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={leyendo}
          className={`${BOTON.principal} mt-3`}
        >
          {leyendo
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo la carta…</>
            : <><Camera className="w-4 h-4" /> Tomar foto de la carta</>}
        </button>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}

      {resultado && (
        <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
          {resultado}
        </p>
      )}

      {filas !== null && (
        <>
          {revisorIA && (
            <RevisionIA
              token={token}
              filas={filas}
              setFilas={(fn) => setFilas((prev) => fn(prev ?? []))}
              excluir={agrupadas}
              onVariantes={variantesDeIA}
              archivo={archivo}
              secciones={secciones}
              textoCrudo={textoCrudo}
              lectura={lectura}
            />
          )}

          {variantes.length > 0 && (
            <div className="mt-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                El mismo plato en varios tamaños
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Así el cliente ve un solo plato y elige el tamaño al pedir, en vez
                de {variantes[0]?.opciones.length ?? 2} platos parecidos en la lista.
              </p>

              <div className="mt-2 space-y-2">
                {variantes.map((v) => {
                  const motivo = v.aceptada
                    ? motivoParaNoAgrupar(varianteParaEnviar(v))
                    : null
                  return (
                    <div
                      key={v.id}
                      className={`rounded-xl border p-3 ${
                        v.aceptada
                          ? motivo
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-emerald-200 bg-emerald-50/50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      {!v.aceptada ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-600">
                            <strong className="text-slate-900">{v.nombre}</strong>{' '}
                            tiene {v.opciones.length} precios.
                            {v.faltanNombres && ' ¿Son tamaños del mismo plato?'}
                          </p>
                          <button
                            type="button"
                            onClick={() => editarVariante(v.id, { aceptada: true })}
                            className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}
                          >
                            <Layers className="w-3.5 h-3.5" /> Agruparlos
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="flex-1 min-w-[140px] text-[11px] font-semibold text-slate-600">
                              Plato
                              <input
                                value={v.nombre}
                                onChange={(e) => editarVariante(v.id, { nombre: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                            <label className="w-28 text-[11px] font-semibold text-slate-600">
                              Grupo
                              <input
                                value={v.grupo}
                                onChange={(e) => editarVariante(v.id, { grupo: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                            <label className="w-32 text-[11px] font-semibold text-slate-600">
                              Sección
                              <input
                                value={v.seccion}
                                list="carta-secciones"
                                onChange={(e) => editarVariante(v.id, { seccion: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                            <label className="w-40 text-[11px] font-semibold text-slate-600">
                              Tipo
                              <select
                                value={v.rol}
                                onChange={(e) => editarVariante(v.id, {
                                  rol: e.target.value === 'acompanamiento' ? 'acompanamiento' : 'plato',
                                })}
                                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-900"
                              >
                                <option value="plato">Plato</option>
                                <option value="acompanamiento">Se ofrece al pagar</option>
                              </select>
                            </label>
                          </div>
                          <input
                            value={v.descripcion ?? ''}
                            placeholder="Ingredientes (opcional)"
                            aria-label="Ingredientes del plato"
                            onChange={(e) => editarVariante(v.id, { descripcion: e.target.value })}
                            className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
                          />

                          <div className="mt-2 space-y-1">
                            {v.opciones.map((o, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  value={o.nombre}
                                  placeholder="Pequeña, mediana, grande…"
                                  onChange={(e) => editarOpcion(v.id, i, 'nombre', e.target.value)}
                                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                                />
                                <input
                                  value={o.precio}
                                  inputMode="numeric"
                                  placeholder="—"
                                  onChange={(e) => editarOpcion(v.id, i, 'precio', e.target.value)}
                                  className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  aria-label={`Quitar el tamaño ${o.nombre || i + 1}`}
                                  onClick={() =>
                                    editarVariante(v.id, {
                                      opciones: v.opciones.filter((_, j) => j !== i),
                                    })}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {motivo && (
                            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {motivo}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => editarVariante(v.id, { aceptada: false })}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                          >
                            <Split className="w-3.5 h-3.5" /> Dejarlos separados
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-600">
            {visibles.length === 0
              ? 'Todas las líneas quedaron agrupadas arriba.'
              : <>Encontramos <strong>{visibles.length}</strong> línea{visibles.length === 1 ? '' : 's'} más.
                Corrige lo que haga falta y borra lo que sobre.</>}
          </p>

          {seccionesVisibles.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-900">¿Qué es cada sección?</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Un <strong>plato</strong> se pide solo. Un <strong>acompañamiento del
                plato</strong> viene con él y el cliente escoge uno (papa a la francesa,
                arroz…). Un <strong>adicional</strong> se le añade cobrando (queso,
                huevo…). Lo que <strong>se ofrece al pagar</strong> es una bebida o
                porción que se vende aparte. Cambiarlo aquí cambia toda la sección.
              </p>
              <div className="mt-2 space-y-1.5">
                {seccionesVisibles.map((sec) => {
                  const roles = new Set(
                    visibles.filter((f) => f.seccion.trim() === sec).map((f) => f.rol),
                  )
                  const unico = roles.size === 1 ? [...roles][0] : ''
                  return (
                    <label key={sec || '—'} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-700">{sec || 'Sin sección'}</span>
                      <select
                        value={unico}
                        onChange={(e) => {
                          const r = ROLES_CARTA.find((x) => x.valor === e.target.value)
                          if (r) rolDeSeccion(sec, r.valor)
                        }}
                        className="w-48 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                      >
                        {unico === '' && <option value="">Mezclado</option>}
                        {ROLES_CARTA.map((r) => (
                          <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Una tarjeta por fila y no una tabla: en el teléfono, que es
              donde el dueño toma la foto, cuatro columnas dejaban el nombre
              del plato en «Arep». */}
          <div className="mt-2 space-y-2">
            {visibles.map((f, i) => {
              const sinPrecio = pesosDeTexto(f.precio) == null && f.rol !== 'guarnicion'
              const anterior = i > 0 ? visibles[i - 1] : undefined
              const puedeUnirse = sinPrecio && f.rol === 'plato' && anterior != null
                && anterior.rol !== 'adicional' && anterior.rol !== 'guarnicion'
              return (
                <div
                  key={f.id}
                  className={`rounded-xl border p-2.5 ${
                    sinPrecio ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      value={f.nombre}
                      aria-label="Nombre"
                      onChange={(e) => editar(f.id, 'nombre', e.target.value)}
                      className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-900"
                    />
                    <button
                      type="button"
                      aria-label="Quitar esta fila"
                      onClick={() => setFilas((p) => (p ?? []).filter((x) => x.id !== f.id))}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Los ingredientes, debajo del nombre y con la letra más
                      pequeña: es la jerarquía que tendrán en la app. Un
                      adicional no los tiene: es una opción dentro de otro
                      plato, y ahí no se enseña descripción. */}
                  {f.rol !== 'adicional' && f.rol !== 'guarnicion' && (
                    <input
                      value={f.descripcion}
                      placeholder="Ingredientes (opcional)"
                      aria-label="Ingredientes del plato"
                      onChange={(e) => editar(f.id, 'descripcion', e.target.value)}
                      className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    />
                  )}
                  <div className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-1.5 sm:grid-cols-[6.5rem_1fr_13rem]">
                    <input
                      value={f.precio}
                      inputMode="numeric"
                      placeholder={f.rol === 'guarnicion' ? 'Incluido' : 'Precio'}
                      aria-label={f.rol === 'guarnicion' ? 'Recargo (vacío = incluido)' : 'Precio'}
                      onChange={(e) => editar(f.id, 'precio', e.target.value)}
                      className={`rounded border px-2 py-1 text-xs ${
                        sinPrecio ? 'border-amber-400 bg-white' : 'border-slate-300'
                      }`}
                    />
                    <input
                      value={f.seccion}
                      list="carta-secciones"
                      placeholder="Sección"
                      aria-label="Sección"
                      onChange={(e) => editar(f.id, 'seccion', e.target.value)}
                      className="min-w-0 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <select
                      value={f.rol}
                      aria-label={`Tipo de ${f.nombre || 'esta fila'}`}
                      onChange={(e) => {
                        const r = ROLES_CARTA.find((x) => x.valor === e.target.value)
                        if (r) cambiarRol(f.id, r.valor)
                      }}
                      className="col-span-2 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs sm:col-span-1"
                    >
                      {ROLES_CARTA.map((r) => (
                        <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                      ))}
                    </select>
                  </div>
                  {f.motivoRol && (
                    <span className="mt-1 block text-[11px] text-slate-500">{f.motivoRol}</span>
                  )}
                  {f.aviso && (
                    <span className="mt-0.5 block text-[11px] text-amber-700">{f.aviso}</span>
                  )}
                  {puedeUnirse && (
                    <button
                      type="button"
                      onClick={() => unirAlDeArriba(f.id, anterior.id)}
                      className="mt-1.5 inline-flex min-h-[40px] items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Son los ingredientes de «{anterior.nombre.trim() || 'el plato de arriba'}»
                    </button>
                  )}
                </div>
              )
            })}
            {/* Las secciones leídas, para elegirlas en vez de teclearlas: cada
                variante escrita a mano acaba siendo otra sección en la carta. */}
            <datalist id="carta-secciones">
              {secciones.map((sec) => <option key={sec} value={sec} />)}
            </datalist>
          </div>

          {gruposGuarnicion.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Utensils className="w-3.5 h-3.5 text-emerald-600" />
                Acompañamiento del plato
              </h3>
              <p className="text-[11px] text-slate-500">
                Viene con el plato y el cliente escoge al pedir. Se crea como opción
                obligatoria del plato: sin precio va incluido, con precio se suma.
              </p>
              {gruposGuarnicion.map(({ nombre: grupo, opciones, secciones: origen }) => {
                const elegidas = destinoGuarnicion(grupo, origen)
                const elige = guarnicionCfg[grupo]?.elige ?? 1
                const cambiar = (cambio: { aplicarA?: string[]; elige?: number }) =>
                  setGuarnicionCfg((prev) => ({
                    ...prev,
                    [grupo]: {
                      elige: prev[grupo]?.elige ?? elige,
                      aplicarA: prev[grupo]?.aplicarA ?? elegidas,
                      ...cambio,
                    },
                  }))
                return (
                  <div key={grupo} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{grupo}</p>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        El cliente escoge
                        <select
                          value={elige}
                          onChange={(e) => cambiar({ elige: Number(e.target.value) })}
                          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900"
                        >
                          {Array.from({ length: Math.min(opciones.length, 4) }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {opciones
                        .map((o) => (o.precio > 0 ? `${o.nombre} +${formatCOP(o.precio)}` : `${o.nombre} (incluido)`))
                        .join(' · ')}
                    </p>
                    {opciones.length < 2 && (
                      <p className="mt-1 text-[11px] text-amber-800">
                        Con una sola opción no hay nada que escoger: mejor escríbela en
                        los ingredientes del plato.
                      </p>
                    )}
                    {seccionesConProductos.length === 0 ? (
                      <p className="mt-2 text-[11px] text-amber-800">
                        No hay platos en esta carta para ponérselo. Quedará en tu
                        biblioteca para añadirlo a mano.
                      </p>
                    ) : (
                      <div className="mt-2">
                        <p className="text-[11px] font-semibold text-slate-700">Va con:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {seccionesConProductos.map((sec) => {
                            const activa = elegidas.includes(sec)
                            return (
                              <button
                                key={sec || '—'}
                                type="button"
                                aria-pressed={activa}
                                onClick={() => cambiar({
                                  aplicarA: activa ? elegidas.filter((x) => x !== sec) : [...elegidas, sec],
                                })}
                                className={`min-h-[32px] rounded-full px-3 text-[11px] font-semibold ring-1 ${
                                  activa
                                    ? 'bg-emerald-600 text-white ring-emerald-600'
                                    : 'bg-white text-slate-600 ring-slate-300'
                                }`}
                              >
                                {sec || 'Sin sección'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <ReportarCarta token={token} archivo={archivo} lecturaId={lecturaId} />

          {ignoradas.length > 0 && (
            <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Dejamos fuera {ignoradas.length} renglón{ignoradas.length === 1 ? '' : 'es'} que no
                {ignoradas.length === 1 ? ' es un plato' : ' son platos'} (teléfono, dirección, horario…)
              </summary>
              <ul className="mt-2 space-y-1">
                {ignoradas.map((r) => (
                  <li key={r.linea}>
                    <span className="text-slate-800">«{r.texto}»</span> — {r.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {notas.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <NotebookPen className="w-3.5 h-3.5 text-emerald-600" />
                Lo que traen los platos
              </h3>
              <p className="text-[11px] text-slate-500">
                Tu carta lo dice para varios platos a la vez. Lo añadimos a la
                descripción de cada uno, que es donde el cliente lo lee.
              </p>
              {notas.map((n) => {
                const elegidas = destinoNota(n)
                return (
                  <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <textarea
                        value={n.texto}
                        rows={2}
                        aria-label="Lo que traen los platos"
                        onChange={(e) =>
                          setNotas((prev) => prev.map((x) => (x.id === n.id ? { ...x, texto: e.target.value } : x)))}
                        className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
                      />
                      <button
                        type="button"
                        aria-label="No añadir esta nota"
                        onClick={() => setNotas((prev) => prev.filter((x) => x.id !== n.id))}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {seccionesDePlatos.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[11px] font-semibold text-slate-700">Se añade a:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {seccionesDePlatos.map((sec) => {
                            const activa = elegidas.includes(sec)
                            return (
                              <button
                                key={sec || '—'}
                                type="button"
                                aria-pressed={activa}
                                onClick={() => setDestinosNota((prev) => ({
                                  ...prev,
                                  [n.id]: activa ? elegidas.filter((x) => x !== sec) : [...elegidas, sec],
                                }))}
                                className={`min-h-[32px] rounded-full px-3 text-[11px] font-semibold ring-1 ${
                                  activa
                                    ? 'bg-emerald-600 text-white ring-emerald-600'
                                    : 'bg-white text-slate-600 ring-slate-300'
                                }`}
                              >
                                {sec || 'Sin sección'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {gruposAdicionales.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-bold text-slate-900">Adicionales</h3>
              <p className="text-[11px] text-slate-500">
                No se crean como productos: van a tu biblioteca de adiciones y el
                cliente los elige dentro del plato. Si ya tienes un grupo con el
                mismo nombre, solo se le añade lo que le falte.
              </p>
              {gruposAdicionales.map(({ nombre: grupo, opciones }) => {
                const elegidas = destinos[grupo] ?? seccionesDePlatos
                return (
                  <div key={grupo} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="text-xs font-semibold text-slate-900">
                      {grupo}{' '}
                      <span className="font-normal text-slate-500">
                        · {opciones.length} opci{opciones.length === 1 ? 'ón' : 'ones'}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {opciones.map((o) => `${o.nombre} +${formatCOP(o.precio)}`).join(' · ')}
                    </p>
                    {seccionesDePlatos.length === 0 ? (
                      <p className="mt-2 text-[11px] text-amber-800">
                        No hay platos en esta carta para añadírselo. Quedará en tu
                        biblioteca para ponerlo a mano.
                      </p>
                    ) : (
                      <div className="mt-2">
                        <p className="text-[11px] font-semibold text-slate-700">Se ofrece en:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {seccionesDePlatos.map((sec) => {
                            const activa = elegidas.includes(sec)
                            return (
                              <button
                                key={sec || '—'}
                                type="button"
                                aria-pressed={activa}
                                onClick={() => alternarDestino(grupo, sec, seccionesDePlatos)}
                                className={`min-h-[32px] rounded-full px-3 text-[11px] font-semibold ring-1 ${
                                  activa
                                    ? 'bg-emerald-600 text-white ring-emerald-600'
                                    : 'bg-white text-slate-600 ring-slate-300'
                                }`}
                              >
                                {sec || 'Sin sección'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {fuera > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">
              {fuera} fila{fuera === 1 ? '' : 's'} sin precio no se crearán. Escribe el
              precio o bórralas.
            </p>
          )}

          {problemas.length > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-amber-800">
              Termina de armar {problemas.length === 1 ? 'el grupo' : `los ${problemas.length} grupos`}{' '}
              de tamaños de arriba, o déjalos separados.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void crear()}
              disabled={
                creando
                || (total === 0 && adicionalesListos.length === 0 && guarnicionesListas.length === 0)
                || problemas.length > 0
              }
              className={BOTON.principal}
            >
              {creando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</>
                : `Crear ${total} producto${total === 1 ? '' : 's'}`
                  + (adicionalesListos.length > 0
                    ? ` y ${adicionalesListos.length} adicional${adicionalesListos.length === 1 ? '' : 'es'}`
                    : '')
                  + (gruposGuarnicion.length > 0
                    ? ` con ${gruposGuarnicion.length === 1 ? 'su acompañamiento' : `${gruposGuarnicion.length} acompañamientos`}`
                    : '')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFilas(null); setVariantes([]); setDestinos({}); setGuarnicionCfg({})
                setNotas([]); setDestinosNota({}); setIgnoradas([]); setError(null)
              }}
              className={BOTON.secundario}
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </section>
  )
}
