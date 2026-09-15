# Brief — Frontend de la app cliente (ZIPA)

> Para ejecutar con un modelo potente. Está escrito para que se pueda pegar tal
> cual: trae el diagnóstico medido, los archivos exactos, el sistema de diseño
> que YA existe y las reglas del repositorio que no se negocian.
>
> Medido sobre `main` el 2026-09-15.

---

## 0. Contexto y objetivo

ZIPA es una plataforma colombiana de movilidad y domicilios (base: Pamplona,
Norte de Santander). Compite con Rappi, Uber, DiDi e inDrive. La app cliente es
Flutter (`AppCliente/`, paquete `nexum_client`), Riverpod + go_router.

**Hay una reunión con un cliente y la app tiene que convencer.** El backend está
maduro (591 pruebas, liquidación real, despacho real). El frontend del cliente
es lo que se queda corto.

Dos problemas, de naturaleza distinta:

1. **Un camino roto** que esconde media oferta de servicios. Barato, alto impacto.
2. **Una estética austera** que hace parecer básico un producto que no lo es.

---

## 1. Defecto A — los mandados quedaron invisibles (PRIORIDAD MÁXIMA)

### Lo que hay, medido

Las 7 categorías de mandado **existen y funcionan**:
`ErrandCategory { pharmacy, groceries, documents, payments, food, shopping, other }`
→ Farmacia · Mercado · Documentos · Pagos · Comida · Compras · Otro
(`AppCliente/lib/features/errands/domain/entities/errand_entity.dart`)

`errand_booking_screen.dart` son 500 líneas completas: chips de categoría,
presupuesto de compra cuando la categoría implica comprar (`usuallyBuys`),
`hint` distinto por categoría, color por categoría.

### El fallo exacto

En `AppCliente/lib/features/businesses/presentation/screens/businesses_screen.dart`,
dentro de `_RejillaServicios`, la tarjeta «Envíos» tiene subtítulo
**«Paquetes y mandados»** pero su `onTap` es:

```dart
onTap: () => context.push(
  AppRoutes.transportBooking,
  extra: TransportServiceType.envios,   // ← SOLO paquetes
),
```

La rama de mandados nunca se alcanza desde el home. El único camino vivo está
enterrado a cinco toques, en `transport_home_screen.dart:1244`:

```
Home → pestaña Movilidad → hoja de movilidad → servicio «Envíos»
     → hoja «¿Qué necesitas enviar?» → «Compra o diligencia» → categorías
```

**No se borró nada: se volvió invisible.** Un usuario que quiere que le traigan
algo de la droguería no tiene forma de descubrir que la app lo hace.

### Qué se espera

Que los mandados sean una **puerta de primer nivel**, con sus categorías
visibles desde el home o a un toque, no un submenú de un submenú. La decisión
de forma es tuya, pero el criterio es: **si el cliente de la reunión no
descubre «Droguería» y «Mercado» sin que se los señalen, sigue mal.**

Ojo al diseñarlo: «Enviar un paquete» y «Compra o diligencia» son dos flujos
distintos con formularios distintos (uno pide destinatario, el otro pide
presupuesto de compra). No los fusiones en uno solo; hazlos ambos evidentes.

---

## 2. Defecto B — la estética quedó austera

### Qué se quitó, y por qué se quitó

El rediseño reciente (commits `7e69446`, `d769faf`) **borró**:

- `business_card.dart` — tarjeta de comercio con portada de 108 px
- `promo_banner.dart` — franja promocional

y los sustituyó por `fila_comercio.dart`: una fila compacta con **miniatura de
64 px**. Las cuatro tarjetas de servicio (`tarjeta_servicio.dart`) son cajas
planas, borde de 1 px, sin sombra, sin degradado, con el color reducido a un
cuadro de icono de 56 px.

**Cada decisión tiene su justificación escrita en el código y son razonables
para el uso diario.** No las tires por tirar: léelas antes de cambiarlas. El
problema no es que estén mal pensadas, es que el resultado agregado no vende.

### El hallazgo concreto

`AppCliente/assets/` contiene **cero ilustraciones de servicio**. Solo:

```
fonts/{Inter-*, Sora-*}.ttf
icons/{app_icon, app_icon_foreground, splash_logo}.png, zipa-mark.svg
vehicles/{camion,moto,particular,taxi}.png   (+ 2.0x y 3.0x — son del MAPA)
```

El comentario de `zipa_icon.dart` dice literalmente
*«Servicios (solo como respaldo de línea; la tarjeta usa la ilustración)»* —
la ilustración nunca se creó. Las tarjetas usan glifos Material outline.

### Qué se espera

Que el home tenga **jerarquía visual y algo que mirar**: imagen donde hay
imagen, profundidad donde separa planos, movimiento donde confirma un toque.
Referencias del dominio: Rappi (vitrina densa con foto), Uber Eats (portadas a
sangre), DiDi (tarjetas de servicio con ilustración).

Si haces ilustraciones, **genéralas por código o con un script versionado**
(hay precedente: `tools/procesar-vehiculos.py`, `VehicleTopDownPainter` es
vector pintado a mano). **No incorpores assets con licencia de terceros.**

---

## 3. El sistema de diseño que YA existe (no lo reinventes)

Vive en `AppCliente/lib/app/theme/`:

**`zipa_tokens.dart`** — paleta con variante clara y oscura por token:

| Token | Claro | Oscuro |
|---|---|---|
| `marca` | `#00C853` | (único) |
| `textoPrincipal` | `#111827` | `#E2E8F0` |
| `textoSecundario` | `#565E6B` | `#A8B3C4` |
| `fondo` | `#F8F9FA` | `#0F1117` |
| `superficie` | `#FFFFFF` | `#1A1D27` |
| `superficieHundida` | `#F0F2F5` | `#252836` |
| `borde` | `#DDE1E7` | `#2E3347` |

Tintes de categoría (`ZipaTinte` = fondo + glifo, cada uno con claro/oscuro):
`movilidad` (índigo) · `restaurantes` (ámbar) · `envios` (teal) ·
`intermunicipal` (azul) · `abierto` · `cerrado`.

Se accede con extensiones: `context.zTexto`, `context.zTexto2`,
`context.zSuperficie`, `context.zBorde`, `context.zHundida`.

**`zipa_icon.dart`** — `ZipaIcon(ZipaIconName.x)` es el ÚNICO punto de entrada
de iconos. Hay una prueba (`zipa_icon_test.dart`) que falla si un archivo de la
lista de rediseñados usa `Icons.` directamente. **Si añades un icono, añádelo
al enum y al mapa de glifos**, o la prueba cae.

**Tipografía**: Sora (títulos) + Inter (texto), ya empaquetadas.

---

## 4. Reglas del repositorio — innegociables

Estas no son preferencias de estilo. Romper cualquiera invalida el trabajo.

1. **NADA INVENTADO.** Es la regla central del proyecto y ya costó incidentes.
   Sin foto → iniciales, no un avatar genérico. Sin calificación → «Nuevo», no
   un 5,0. Sin datos → estado vacío honesto, no una lista de ejemplo.
   **Prohibido especialmente**: promociones, descuentos o «-40 %» de adorno; ya
   se retiró un teaser («ZIPA Fest · Domicilios desde $0») precisamente porque
   prometía un descuento que no existía. Un banner promocional vacío es
   preferible a uno con una oferta falsa.
2. **Todo en español**, incluidos nombres de clases, variables y comentarios
   nuevos — es la convención del repo.
3. **Modo claro Y oscuro.** Ambos funcionan hoy y hay que mantenerlos. La regla
   aprendida: nunca mezcles fondo fijo con texto adaptativo (ni al revés) en el
   mismo subárbol. Lo que flota sobre un mapa va con color fijo a propósito.
4. **Ancho de teléfono** (~400 px) y **escalado de texto**: hay una prueba
   (`escala_texto_test.dart`) que cubre el ajuste de letra grande de Android.
5. **No hay Flutter en el entorno de desarrollo.** Dart se verifica **solo en
   CI**. Escribe con cuidado: errores que solo salen en CI ya dejaron el build
   rojo cuatro commits seguidos. Trampas conocidas: `library;` va ANTES de todo
   import; `const ''` no es válido como valor por defecto; un `switch` de
   expresión sobre un enum debe ser exhaustivo (en Dart es error, no aviso); un
   `export` no trae la clase al ámbito del propio archivo, hace falta el
   `import`.
6. **No romper las pruebas existentes** de la app cliente (12 archivos):
   `zipa_icon_test`, `zipa_tokens_test`, `shell_tabs_test`, `escala_texto_test`,
   `copywith_completo_test`, `push_routing_test`, `ubicacion_gate_test`,
   `eta_vivo_test`, `camara_seguimiento_test`, `reanudar_test`,
   `manifest_android_test`, `manifest_ios_test`.
   Ojo con `shell_tabs_test`: las constantes de pestaña
   (`kTabInicio/kTabPedidos/kTabFavoritos/kTabCuenta/kTabMovilidad`) están
   verificadas; si cambias la barra, actualiza la prueba con intención, no para
   que pase.
7. **Sin dependencias nuevas** salvo que sean imprescindibles y lo justifiques.
8. **Rama de trabajo**: `claude/pr-blocked-duplicate-commits-tztum7`.
   Commits descriptivos en español. `main` no está protegida todavía: **no
   mergees con el CI en rojo.**

---

## 5. Archivos que vas a tocar

```
AppCliente/lib/features/businesses/presentation/
  screens/businesses_screen.dart          ← el home (_BarraDireccion, _Buscador,
                                             _RejillaServicios, _TituloSeccion)
  widgets/tarjeta_servicio.dart           ← la carta de servicio
  widgets/fila_comercio.dart              ← la fila de comercio (miniatura 64px)
  widgets/sello_confianza.dart
  widgets/business_visuals.dart

AppCliente/lib/features/shell/presentation/screens/home_shell.dart
AppCliente/lib/features/shell/.../shell_provider.dart     ← kTab*
AppCliente/lib/features/errands/presentation/screens/errand_booking_screen.dart
AppCliente/lib/features/transport/presentation/screens/transport_home_screen.dart
AppCliente/lib/app/theme/{zipa_tokens.dart, zipa_icon.dart}
AppCliente/lib/shared/widgets/estados_zipa.dart           ← estados vacíos
```

Datos disponibles del backend que hoy NO se están aprovechando en el home:
`BusinessEntity.imageUrl` (portada), `rating` + `ratingCount` (puede ser null →
«Nuevo»), `isOpen`, `etaMinutes`, `deliveryFee`, `category`, y del catálogo
`compareAtPrice`/`descuentoPct` y la promoción de tienda con su vigencia.

---

## 6. Prioridad sugerida

Hay una reunión mañana. **Un rediseño total de madrugada es peor que tres
cambios certeros.** Orden recomendado:

- **P0 · Mandados visibles.** Corregir el destino de la tarjeta «Envíos» y
  elevar las categorías. Es el defecto funcional y el que más oferta revela.
- **P0 · Imagen en el catálogo.** Que los comercios con portada se vean como
  comercios y no como una lista de contactos.
- **P1 · Las cuatro puertas con carácter.** Ilustración o tratamiento propio,
  manteniendo los tintes de categoría existentes.
- **P1 · Jerarquía del home.** Qué va arriba, qué respira, dónde cae el ojo.
- **P2 · Micro-interacción.** Escala al pulsar, háptica, transiciones. Barato y
  se nota mucho en una demo en vivo.

---

## 7. Verificación

Antes de dar nada por hecho:

```
cd backend
npm run typecheck
npm test
```

(usa `set -o pipefail` si canalizas la salida: sin eso un `| tail` se traga el
código de salida y deja pasar errores — ya pasó)

Flutter **solo se verifica en CI**, con los tres jobs:
`Backend (typecheck + test)` · `App Conductor (analyze + test)` ·
`App Cliente (analyze + test)`.

**No declares nada terminado hasta que el CI esté verde.** Si el trabajo se
puede mirar en un teléfono, pide capturas: proporciones y solapes no se juzgan
leyendo código.

---

## 8. Lo que NO hay que hacer

- Inventar datos para que la pantalla se vea llena.
- Poner promociones, descuentos o insignias que el backend no respalda.
- Meter assets con licencia de terceros.
- Tocar la app del conductor (`AppTransport/`) — no es el objetivo.
- Reescribir la arquitectura. La app es Clean Architecture por feature con
  Riverpod y funciona; esto es una tanda de frontend.
- Borrar las justificaciones escritas en los comentarios sin leerlas. Varias
  documentan bugs reales que costaron caro.

---

## 9. Riesgo aparte, que no es de diseño

**Si en producción no hay comercios con portada cargada, el home más bonito
sale vacío.** Antes de pulir píxeles conviene comprobar qué datos reales hay
en la base de producción y, si hacen falta, cargarlos por el portal
`/negocio/[token]/catalogo` (tiene subida de portada y de foto por producto).

Los seeds **no crean empresas** por diseño, y nunca deben usarse para
maquillar una demo.
