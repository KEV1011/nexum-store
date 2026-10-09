'use client'

import { useEffect, useState } from 'react'

/**
 * El dibujo de los códigos QR de las mesas.
 *
 * POR QUÉ AQUÍ Y NO EN CADA PANTALLA. El cargador por CDN y la llamada a la
 * librería vivían dentro de `imprimir/page.tsx`, así que el gestor de mesas no
 * podía enseñar una vista previa: el dueño pegaba el código en la mesa sin
 * haberlo visto nunca, y el único sitio donde aparecía era la hoja de imprimir.
 * Copiar las veinte líneas habría sido la copia número dieciocho del
 * formateador de moneda.
 *
 * POR CDN Y NO COMO DEPENDENCIA, igual que Leaflet en `/empresa`: son 4 KB que
 * solo hacen falta en dos pantallas de las veinte del portal, y meterlos en el
 * paquete los descarga todo el mundo.
 *
 * **Sin la librería no se falla.** Si el CDN no responde —un local con mala
 * conexión, que es lo normal—, quien llama dibuja el enlace y el código en
 * texto: con eso la mesa sigue sirviendo, escrito a mano si hace falta. Un
 * recuadro vacío sin explicación sería peor que no tener la vista previa.
 */

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'

interface ConQr {
  QRCode?: new (el: HTMLElement, opts: Record<string, unknown>) => unknown
}

/** `true` cuando la librería ya está cargada y se puede dibujar. */
export function useLibreriaQr(): boolean {
  const [listo, setListo] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as ConQr
    // Ya cargada por la otra pantalla: no se vuelve a pedir.
    if (w.QRCode) { setListo(true); return }

    // Puede haber otra instancia de este hook montada a la vez (dos filas de
    // mesas, por ejemplo). Se reutiliza la etiqueta que ya exista en vez de
    // añadir una por fila, que pediría el mismo archivo veinte veces.
    const yaPuesta = document.querySelector<HTMLScriptElement>(`script[src="${CDN}"]`)
    const s = yaPuesta ?? document.createElement('script')
    const alCargar = () => setListo(true)
    s.addEventListener('load', alCargar)
    if (!yaPuesta) {
      s.src = CDN
      s.async = true
      document.head.appendChild(s)
    }
    return () => s.removeEventListener('load', alCargar)
  }, [])

  return listo
}

/**
 * Dibuja el QR dentro de `nodo`. Devuelve `false` si no pudo.
 *
 * `correctLevel: 2` es corrección alta a propósito: estas tarjetas acaban con
 * grasa y huellas encima, y un código que deja de leerse a la semana es una
 * mesa que vuelve a pedirle la carta al mesero.
 */
export function dibujarQr(nodo: HTMLElement, enlace: string, lado: number): boolean {
  const w = window as unknown as ConQr
  if (!w.QRCode) return false
  nodo.innerHTML = ''
  try {
    new w.QRCode(nodo, { text: enlace, width: lado, height: lado, correctLevel: 2 })
    return true
  } catch {
    nodo.innerHTML = ''
    return false
  }
}
