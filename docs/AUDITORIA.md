# Auditoría de arquitectura — 7 de octubre de 2026

Medido, no estimado. Cada número de aquí sale de un comando sobre el
repositorio en `main` (`829017f`), y el comando se puede repetir.

**No hay un porcentaje de «qué tan listo está».** Un número así se inventa
solo: depende de contra qué se compare. Lo que sí se puede decir es, por
dimensión, qué aguanta hoy y qué no, y en qué orden duele.

---

## El tamaño del sistema

| Superficie | Archivos | Líneas | Pruebas |
|---|---:|---:|---:|
| `backend/src` | 175 | 52.124 | **12.695** (108 ficheros, 1.316 casos) |
| `app/` (portal web) | 72 | 18.725 | **0** |
| `AppCliente/lib` | 170 | 46.781 | 2.145 (21 ficheros) |
| `AppTransport/lib` | 167 | 42.053 | 1.913 (19 ficheros) |

Más **59 scripts E2E** (15.619 líneas) que corren contra PostgreSQL real.

160.000 líneas de producción. Para una plataforma con cinco servicios
—viaje, envío, mandado, pedido, carga— más tres portales, no es
desproporcionado; lo que importa es cómo está repartido.

---

## 1. Lo que está sólido

**El backend tiene red de verdad.** 1.316 pruebas unitarias sobre las reglas
puras —las de dinero, las de tiempo, las de identidad— y 59 E2E que golpean
PostgreSQL real por HTTP. La disciplina de «comprobar la guarda
rompiéndola» está aplicada en casi todas las piezas críticas. Esto es lo
que permite tocar el sistema sin romperlo, y es lo más caro de construir.

**Las reglas de negocio viven sueltas y probadas.** `lib/` tiene 60+ módulos
puros: tarifas, comisiones, cobertura, horarios, cumplimiento, saldos. Un
cambio de política se hace en un sitio y la prueba lo cuida.

**La trazabilidad de carga está unificada.** El error de construir
`CargoTrip` al lado de `FreightRequest` se detectó y se corrigió: hoy el
rastro GPS, los gastos, los tiempos y la cuenta de cobro cuelgan del mismo
sitio. Esa lección está escrita y se aplicó después en los documentos del
envío.

**`main` está protegida** con tres checks obligatorios por nombre y modo
estricto. Dos tandas se mergearon en rojo antes de eso; ya no puede pasar.

**Observabilidad instalada**: `pino` para logs estructurados y Sentry para
errores no manejados.

---

## 2. Las falencias, por lo que cuestan

### 2.1 El portal web no tiene ni una prueba — 18.725 líneas

Es el agujero más grande y el más barato de empezar a tapar.

Tres portales —empresas, comercios, y las páginas legales que mira Play—
que solo se verifican con `tsc` y `next build`. Eso caza un tipo mal puesto;
no caza que un panel no cargue, que un botón no llame a nada o que una
tabla reviente con un campo nulo.

**Y ya mordió**: `d.rating.toFixed(2)` tumbaba la sección «Equipo y
vehículos» entera con el primer conductor sin calificar, porque el portal
se había escrito su propio tipo diciendo `number` donde la base dice
`Float?`. `tsc` no podía verlo — un tipo que miente es indistinguible de
uno correcto.

El panel `/admin` sí tiene su comprobador (`admin-panel.test.ts`, que
ejecuta el JS con un DOM falso). El portal Next.js no tiene nada
equivalente.

### 2.2 Tres routers nacen abiertos

| Router | Rutas | Guarda |
|---|---:|---|
| `/admin` | 57 | `router.use` + lista de excepciones + **prueba** |
| `/driver` | 70 | `router.use(authMiddleware)` |
| `/operator` | 81 | `router.use(requireOperator)` |
| `/trips`, `/earnings` | 9 | `router.use(authMiddleware)` |
| **`/client`** | **82** | **ruta por ruta** |
| **`/business`** | **36** | **ruta por ruta** |
| **`/safety`** | **5** | **ruta por ruta** (`resolveActor`) |

Las 123 rutas de los tres últimos están bien HOY —se revisaron una a una—
pero **una ruta nueva nace pública**. Es exactamente el fallo que ya costó
caro: `POST /admin/municipalities/:slug/commission` dejaba a cualquiera sin
identificarse fijar la comisión de una plaza al 40 %, porque `/admin` tenía
una lista de rutas *a proteger* en vez de una guarda que cubriera todo.

Se arregló en `/admin` y se le puso prueba. **En los otros tres no.**

### 2.3 Las llamadas a servicios externos no tienen timeout

| Servicio | `fetch` | con timeout |
|---|---:|---:|
| `geo.service` (Google: mapas, rutas, lugares) | 9 | **0** |
| `sms.service` (Twilio) | 3 | **0** |
| `payment.service` (Wompi) | 1 | **0** |
| `kyc`, `ocr`, `background-check` | 3 | **0** |
| `carta-ocr.service` | — | 3 ✓ |

Solo el lector de cartas lo hace bien (25 s, y está comentado por qué).

Un Google lento no devuelve un error: **deja la petición del usuario
colgada**. En el peor caso —cotizar un viaje— el pasajero ve el botón
girando sin fin y no sabe si pedir otra vez. Es la clase de fallo que no
aparece en ninguna prueba porque solo pasa cuando el otro lado va mal.

### 2.4 Todo el despacho vive en memoria

14 estructuras en memoria sostienen la operación: ofertas activas de viaje,
mandado, pedido e intermunicipal; los reintentos de búsqueda; los sockets
de conductores, clientes, negocios y empresas; los límites antifraude.

Un reinicio de Render —un despliegue, un fallo— pierde todo eso.

**Está mitigado, no resuelto**: `rescatarDespacho()` cada pocos minutos
vuelve a poner en el ruedo lo que quedó colgado, y
`liberarConductoresColgados()` devuelve al despacho a quien quedó marcado
«en viaje». Es una red por debajo, con el retardo del barrido.

Lo que **no** está resuelto: `lib/bus.ts` existe y está preparado para
Redis, pero `REDIS_URL` no está configurada. Mientras no lo esté, **el
sistema solo puede correr en UNA instancia**: con dos, un conductor
conectado a la instancia A no recibe un aviso emitido por la B. Eso es un
techo de escala y un punto único de fallo a la vez.

### 2.5 Cinco claves foráneas sin índice

`Vehicle.driverId`, `Order.businessId`, `OrderLine.orderId`,
`OrderLine.productId`, `Trip.vehicleId`, `OtpSession.driverId`.

`Order.businessId` es el que duele: el portal del comercio filtra por ahí
en cada carga, y el bus de pedidos también. Con pocos datos no se nota;
con miles de pedidos es un escaneo completo en el camino más transitado.

Son seis líneas en el esquema y una migración.

### 2.6 Veintiséis variables de entorno puestas a mano

`PORTAL_BASE_URL`, `GOOGLE_MAPS_API_KEY`, las cuatro de Wompi, las cinco de
S3, las cinco de Twilio, `FIREBASE_SERVICE_ACCOUNT`, `ADMIN_PHONES`,
`SENTRY_DSN`, `REDIS_URL`…

Cada una es una oportunidad de que producción diga una cosa y el código
otra, y **ya ha mordido tres veces**: `CARTA_OCR_PROVIDER` escrito como
`google-vision3` (el lector quedaba apagado y el diagnóstico decía
«apagado», que es indistinguible de «nunca se configuró»),
`INTERCITY_SIMULATE` encendida a mano en el panel contra lo que decía el
blueprint, y `PORTAL_BASE_URL` apuntando a un portal que no se despliega
solo.

`/health` publica el estado de doce de ellas, que es la mitigación correcta
y ya ha servido. Pero sigue habiendo variables cuyo efecto no se ve desde
fuera.

### 2.7 Tres servicios vivos sin una sola prueba

| Servicio | Líneas | Unitarias | E2E |
|---|---:|---:|---:|
| `ride-negotiation.service` | 496 | 0 | **0** |
| `safety-alerts.service` | 562 | 0 | 0 |
| `geo.service` | 579 | 0 | **0** |

`ride-negotiation` es el flujo «Pon tu precio», que está **vivo** (dos
rutas lo usan). `geo.service` es la puerta a las cuatro APIs de Google de
las que dependen mapas, rutas, direcciones y la lectura de remesas.

Los demás servicios grandes sin prueba propia (`client`, `matching`,
`intercity-pool`…) sí están cubiertos por E2E —`client` por 26, `matching`
por 14—, así que ahí la ausencia de unitarias no es el mismo riesgo.

### 2.8 Veinte ficheros duplicados entre las dos apps

2.423 líneas idénticas: la lupa de la barra, los vehículos cenitales, el
logo, el caché de teselas, la hoja deslizable…

**Solo dos tienen prueba de divergencia** (`lupa_vidrio`, `eta_vivo`). Las
otras dieciocho se pueden separar sin que nada falle, y el día que una
cambie y la otra no, las dos apps dirán cosas distintas del mismo dato.
Ya pasó con el formateador de moneda: acabó en diecisiete copias y dos
formatos.

### 2.9 El OTP de producción es una llave maestra

`/health` lo publica como `otpRiesgo: true`. Hay **un código fijo que abre
cualquier teléfono**, incluido `/admin`.

Es una decisión consciente para el piloto sin SMS —y el código la exige
explícita (`ALLOW_FIXED_OTP`)— pero **no se puede invitar a un solo usuario
real** mientras siga así. Configurar Twilio apaga todos los códigos fijos
automáticamente.

---

## 3. Qué haría, en este orden

**Antes de invitar al primer usuario real**

1. **Twilio.** Mientras `otpRiesgo` sea `true`, cualquiera con el código
   entra a cualquier cuenta y al panel. No es deuda técnica, es la puerta
   abierta.
2. **Timeouts en las llamadas externas.** Una tarde de trabajo. Sin esto,
   un día malo de Google es una app colgada sin explicación.

**Antes de crecer**

3. **Guarda estructural en `/client`, `/business` y `/safety`**, con la
   prueba que ya tiene `/admin`. Hoy están bien; lo que falta es que no
   puedan dejar de estarlo.
4. **Los seis índices.** Una migración.
5. **Redis.** Es lo que levanta el techo de una instancia. El código ya
   está preparado.

**Para poder tocar sin miedo**

6. **Primeras pruebas del portal web.** No hace falta cobertura: hacen
   falta las cuatro o cinco páginas que, si revientan, dejan a un comercio
   o a una flota sin poder trabajar.
7. **`ride-negotiation` y `geo.service`**, que son los dos huecos reales de
   cobertura en servicios vivos.
8. **Prueba de divergencia** para las dieciocho copias restantes. Es el
   mismo patrón que ya existe, repetido.

**Lo que NO es urgente aunque lo parezca**

Los archivos grandes (`home_screen.dart` con 3.303 líneas,
`client.service.ts` con 2.286). Son imanes de conflicto y cuestan de leer,
pero están cubiertos por pruebas y nada se rompe por su tamaño. Partirlos
es trabajo que no compra seguridad — y mueve mucho código, que sí la gasta.

---

## Cómo volver a medir esto

Los comandos están en el historial de la sesión que produjo este documento.
Los dos más útiles:

```bash
# Routers que no fallan cerrado
cd backend && for f in driver trips earnings safety operator client business admin; do
  echo "$f: $(grep -cE '^router\.(get|post|put|patch|delete)\(' src/routes/$f.routes.ts) rutas · $(grep -cE '^router\.use\(' src/routes/$f.routes.ts) router.use"
done

# Llamadas externas sin timeout
cd backend && for s in geo carta-ocr sms payment kyc ocr background-check; do
  echo "$s: fetch=$(grep -c 'fetch(' src/services/$s.service.ts) timeout=$(grep -cE 'AbortSignal|signal:' src/services/$s.service.ts)"
done
```
