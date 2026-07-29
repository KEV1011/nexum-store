'use client'

/**
 * Marca ZIPA: la corona muisca sobre una Z de tres trazos
 * (personas · encargos · carga).
 *
 * `animated` dibuja la entrada — los tres trazos aparecen escalonados y la
 * corona se asienta encima. Es el mismo gesto y el mismo ritmo que el splash de
 * las apps, para que la marca se sienta igual en todas partes.
 */
export function ZipaLogo({
  size = 40,
  animated = false,
  className = '',
}: {
  size?: number
  animated?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="ZIPA"
    >
      <g
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
        className={animated ? 'zipa-strokes' : undefined}
      >
        <path d="M17 20 H47" stroke="#FFFFFF" className="zipa-s1" />
        <path d="M45 22 L19 42" stroke="#EAF7F1" className="zipa-s2" />
        <path d="M17 44 H47" stroke="#D6EFE4" className="zipa-s3" />
      </g>
      <g className={animated ? 'zipa-crown' : undefined}>
        <path d="M21 14.5 L26 7 L32 12.5 L38 7 L43 14.5 Z" fill="#F2C75C" />
        <circle cx="32" cy="10" r="1.6" fill="#FFF6DC" />
      </g>
    </svg>
  )
}

/**
 * Pantalla de carga de los portales: la marca dibujándose sobre el verde de
 * ZIPA. Se muestra mientras llegan los datos, en lugar de un texto suelto.
 */
export function ZipaLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5"
         style={{ background: 'linear-gradient(155deg,#04150F,#072A1E 55%,#0A3D2B)' }}>
      <ZipaLogo size={104} animated />
      <p className="text-sm tracking-[0.3em] font-semibold text-emerald-200/80 uppercase">
        {label}
      </p>
    </div>
  )
}
