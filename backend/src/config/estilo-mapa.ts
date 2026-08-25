/**
 * Estilo OSCURO del mapa (el aspecto tipo Uber/DiDi de noche).
 *
 * Va en `createSession` de Map Tiles API, que acepta el mismo formato JSON de
 * estilos que Google Maps. Como TODOS los mapas —los ocho de las dos apps y el
 * de la torre de control del portal— piden sus teselas a `/geo/tile`, cambiarlo
 * aquí los oscurece a la vez y no hay forma de que uno se quede claro.
 *
 * Criterios del estilo, que no son de gusto sino de legibilidad sobre un mapa
 * de reparto:
 *
 * - El suelo es gris muy oscuro, no negro: sobre negro puro no se distingue la
 *   sombra del vehículo ni el trazo de la ruta.
 * - Las vías van MÁS CLARAS que el suelo y en tres niveles (autopista, arteria,
 *   local). Es lo único que el conductor necesita leer de reojo.
 * - El agua es más oscura que el suelo, para que el río de Pamplona no compita
 *   con las calles.
 * - Los puntos de interés se apagan casi por completo: un mapa de trabajo no
 *   necesita restaurantes marcados, y cada etiqueta de más tapa una calle.
 * - Se conservan las etiquetas de calles y localidades. Un mapa oscuro sin
 *   nombres es bonito y no sirve para llegar a ninguna parte.
 */
export const ESTILO_MAPA_OSCURO: ReadonlyArray<Record<string, unknown>> = [
  // Base: todo el suelo y todo el texto.
  { elementType: 'geometry', stylers: [{ color: '#1f2429' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa4ad' }] },
  // El halo del texto en el color del suelo: así el nombre se lee encima de
  // cualquier cosa sin dibujar un recuadro.
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2429' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Puntos de interés: fuera. Sobra ruido y tapan calles.
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#232c26' }, { visibility: 'on' }],
  },

  // Vías, de más importante a menos. La autopista es la más clara.
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#4a5560' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a3138' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#3a434c' }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry',
    stylers: [{ color: '#2e353d' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8d979f' }],
  },

  // Tránsito y agua.
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2a3138' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#141a1f' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4d5860' }],
  },

  // Fronteras administrativas, apenas insinuadas.
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#39424b' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b0b9c1' }],
  },
];
