'use client'

import { useEffect, useState } from 'react'
import { Smartphone, Share, SquarePlus, X } from 'lucide-react'

import { BOTON } from '../../ui'

/** El evento que Chrome y Edge lanzan cuando la página se puede instalar. */
interface EventoInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Ya se abre como app (instalada): no tiene sentido ofrecerlo. */
function yaInstalada(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/**
 * iPhone y iPad: Safari no lanza el evento de instalar, hay que hacerlo desde
 * «Compartir». El iPad moderno se presenta como Mac, así que se mira también
 * si tiene pantalla táctil.
 */
function esIOS(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * «Instalar en mi celular».
 *
 * POR QUÉ. El dueño abre su portal desde un enlace que guardó en WhatsApp, y
 * cada vez lo tiene que buscar entre los mensajes. Instalado, queda en la
 * pantalla con el nombre de su local, junto a sus otras apps.
 *
 * En Android (Chrome) el botón abre el instalador del sistema. En iPhone no
 * existe ese instalador, así que el botón enseña los tres toques de Safari.
 * Donde no se puede instalar, o si ya está instalada, no se muestra nada.
 *
 * `compacto`: el aviso de la pantalla de pedidos, que el dueño puede cerrar.
 * Sin él, la versión de Ajustes, que siempre está para quien la busque.
 */
export function InstalarApp({ token, compacto = false }: { token: string; compacto?: boolean }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [ios, setIos] = useState(false)
  const [instalada, setInstalada] = useState(false)
  const [verPasos, setVerPasos] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const clave = `zipa_instalar_cerrado_${token}`

  useEffect(() => {
    if (yaInstalada()) {
      setInstalada(true)
      return
    }
    setIos(esIOS())
    try {
      if (compacto && localStorage.getItem(clave) === '1') setCerrado(true)
    } catch {
      // Sin almacenamiento (navegación privada): se ofrece igual.
    }
    const alPoder = (e: Event) => {
      e.preventDefault()
      setEvento(e as EventoInstalar)
    }
    const alInstalar = () => setInstalada(true)
    window.addEventListener('beforeinstallprompt', alPoder)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [clave, compacto])

  if (instalada || cerrado || (!evento && !ios)) return null

  async function instalar() {
    if (evento) {
      await evento.prompt()
      const { outcome } = await evento.userChoice
      if (outcome === 'accepted') setInstalada(true)
      // El evento sirve UNA vez: Chrome lo vuelve a lanzar si se puede repetir.
      setEvento(null)
      return
    }
    setVerPasos((v) => !v)
  }

  function cerrar() {
    setCerrado(true)
    try {
      localStorage.setItem(clave, '1')
    } catch {
      // No se recuerda, pero se cierra igual.
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Tu portal como app</p>
          <p className="text-xs text-slate-600">
            Queda en la pantalla de tu celular con el nombre de tu local, y lo abres de un toque.
          </p>
          <button type="button" onClick={() => void instalar()} className={`${BOTON.secundario} mt-2 !min-h-[40px] !text-xs`}>
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Instalar en mi celular
          </button>
        </div>
        {compacto && (
          <button
            type="button"
            onClick={cerrar}
            aria-label="Ahora no"
            className={`${BOTON.icono} !h-10 !w-10 shrink-0`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {verPasos && (
        <ol className="mt-3 space-y-2 border-t border-emerald-200 pt-3 text-xs text-slate-700">
          <li className="flex items-start gap-2">
            <span className="font-bold text-emerald-700">1.</span>
            <span>
              Abajo en Safari, toca <Share className="inline h-4 w-4 align-text-bottom" aria-label="Compartir" />{' '}
              <strong>Compartir</strong>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-emerald-700">2.</span>
            <span>
              Busca <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />{' '}
              <strong>Agregar a pantalla de inicio</strong> (puede estar más abajo en la lista).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-emerald-700">3.</span>
            <span>Toca <strong>Agregar</strong>. Si no ves la opción, abre este enlace en Safari.</span>
          </li>
        </ol>
      )}
    </div>
  )
}
