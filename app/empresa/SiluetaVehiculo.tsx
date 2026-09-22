/**
 * La silueta de van, buseta o bus, con LOS MISMOS NÚMEROS que la app.
 *
 * Existe para que la empresa vea en el portal exactamente lo que va a ver el
 * pasajero en el teléfono: si aquí se elige «Buseta» y allí sale otro dibujo,
 * la conversación en la taquilla es «yo publiqué una buseta».
 *
 * ⚠ La geometría vive por triplicado —aquí, en
 * `AppCliente/lib/app/theme/zipa_vehiculos.dart` y en
 * `tools/previsualizar-vehiculos.py`— porque son tres plataformas que no
 * comparten código. `backend/src/lib/siluetas-vehiculo.test.ts` falla si los
 * tres dejan de coincidir; sin esa prueba, divergen y nadie se entera hasta
 * que alguien compara dos pantallas.
 */
export type TipoVehiculo = 'VAN' | 'BUSETA' | 'BUS'

const ALTO = 44

const MEDIDAS: Record<TipoVehiculo, {
  largo: number; ventanas: number; morro: number; techoAlto: boolean
}> = {
  VAN: { largo: 60, ventanas: 2, morro: 9, techoAlto: false },
  BUSETA: { largo: 78, ventanas: 4, morro: 5, techoAlto: true },
  BUS: { largo: 96, ventanas: 5, morro: 0, techoAlto: true },
}

export const ETIQUETA_VEHICULO: Record<TipoVehiculo, string> = {
  VAN: 'Van',
  BUSETA: 'Buseta',
  BUS: 'Bus',
}

function puntos(p: Array<[number, number]>): string {
  return p.map(([x, y]) => `${x},${y}`).join(' ')
}

export function SiluetaVehiculo({
  tipo,
  alto = 22,
  cuerpo = '#1565C0',
  hueco = '#FFFFFF',
}: {
  tipo: TipoVehiculo
  alto?: number
  cuerpo?: string
  hueco?: string
}) {
  const m = MEDIDAS[tipo]
  const yTecho = m.techoAlto ? 5 : 8
  const ySuelo = 33
  const x0 = 2
  const x1 = m.largo - 2

  const carroceria: Array<[number, number]> = m.morro > 0
    ? [
        [x0 + m.morro, yTecho],
        [x1 - 3, yTecho],
        [x1, yTecho + 3.5],
        [x1, ySuelo],
        [x0, ySuelo],
        [x0, yTecho + 5 + m.morro * 0.55],
        [x0 + m.morro * 0.5, yTecho + 2 + m.morro * 0.2],
      ]
    // Bus: frente PLANO. Con el punto del morro a cero quedaba un chaflán y
    // el bus parecía golpeado.
    : [
        [x0 + 2, yTecho],
        [x1 - 3, yTecho],
        [x1, yTecho + 3.5],
        [x1, ySuelo],
        [x0, ySuelo],
        [x0, yTecho + 2.5],
      ]

  const vY0 = yTecho + 3
  const vY1 = yTecho + 13
  const izq = x0 + 2.5 + m.morro
  const util = x1 - 3 - izq
  const separacion = 2.2
  const anchoV = (util - separacion * (m.ventanas - 1)) / m.ventanas
  const ventanas: Array<Array<[number, number]>> = []
  for (let i = 0; i < m.ventanas; i++) {
    const vx = izq + i * (anchoV + separacion)
    const sesgo = i === 0 && m.morro > 0 ? 2.2 : 0
    ventanas.push([
      [vx + sesgo, vY0],
      [vx + anchoV, vY0],
      [vx + anchoV, vY1],
      [vx, vY1],
    ])
  }

  const r = 5.4
  const ruedas: Array<[number, number]> = [
    [x0 + m.morro + 6.5, ySuelo],
    [x1 - 7.5, ySuelo],
  ]

  return (
    <svg
      viewBox={`0 0 ${m.largo} ${ALTO}`}
      height={alto}
      width={(alto * m.largo) / ALTO}
      role="img"
      aria-label={ETIQUETA_VEHICULO[tipo]}
      className="shrink-0"
    >
      {/* Ruedas DEBAJO de la carrocería: encima parecerían pegatinas. */}
      {ruedas.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={cuerpo} />
      ))}
      <polygon points={puntos(carroceria)} fill={cuerpo} />
      {ventanas.map((v, i) => (
        <polygon key={i} points={puntos(v)} fill={hueco} />
      ))}
    </svg>
  )
}
