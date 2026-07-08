# Estructura: Empresas de transporte (intermunicipal + taxi) con flota y rastreo

> Borrador de arquitectura para habilitar el objetivo central de Nexum: que
> **empresas de transporte** (taxis e intermunicipal) se **registren**,
> administren su **flota** (vehículos + conductores) y **rastreen sus vehículos**
> en tiempo real — de forma **legal** (operador habilitado) e integrada con lo
> que ya existe (matching PostGIS, intermunicipal, verificación, payouts).
>
> Estado: **propuesta para revisar y profundizar.** Las "decisiones clave"
> (§13) cambian partes del diseño; conviene cerrarlas antes de construir.

---

## 1. Por qué (contexto legal y de producto)

En Colombia el transporte **intermunicipal** de pasajeros con tarifa comercial
**solo puede operarlo una empresa habilitada** por el Ministerio de Transporte;
un particular no. Hoy el código ya lo refleja a medias: las rutas troncales
están marcadas `requiresLicensedOperator` y el "modelo dual" las **deshabilita
para particulares** hasta tener convenio con una empresa… **que no existe como
entidad en el sistema.** Igual pasa con los **taxis**: en Colombia operan por
**empresas de taxi afiliadoras** dueñas del cupo/tarjeta de operación.

**Conclusión:** falta el actor **Empresa/Operador** y todo lo que cuelga de él
(flota, conductores afiliados, habilitación, despacho y rastreo). Esto desbloquea
lo legal **y** el modelo de negocio B2B (las empresas son el cliente que paga).

---

## 2. Actores y roles

| Actor | Quién es | Dónde opera |
|---|---|---|
| **Operador (Empresa)** | Empresa de taxis o de transporte intermunicipal habilitada | Portal de Empresa (web) |
| **Dueño/Admin de empresa** | Representante legal / administrador | Portal de Empresa |
| **Despachador** | Operario que asigna y monitorea vehículos | Portal de Empresa |
| **Conductor afiliado** | Conduce un vehículo de (o afiliado a) la empresa | App Conductor |
| **Conductor independiente** | Sigue existiendo (urbano/gasto compartido) | App Conductor |
| **Pasajero** | Pide taxi o cupo intermunicipal | App Cliente |
| **Admin de plataforma** | Verifica habilitación de empresas, supervisa | Panel /admin |

> El conductor independiente **no desaparece**: la plataforma soporta ambos
> mundos (marketplace abierto urbano + empresas habilitadas para troncales/taxi).

---

## 3. Modelo de dominio (entidades nuevas + relación con lo existente)

Nuevas entidades (Prisma). Las marcadas con ↩︎ extienden modelos existentes.

```
Operator (empresa)
  id, legalName, nit (unique), tradeName,
  type            : TAXI | INTERCITY | MIXED
  status          : PENDING | ACTIVE | SUSPENDED
  isVerified      : bool            // habilitación aprobada por admin
  habilitacionNo? , habilitacionExpiresAt?   // resolución Mintransporte
  contactName, contactPhone, contactEmail, city
  commissionRate? : float           // override de comisión de plataforma
  createdAt, updatedAt

OperatorDocument        // habilitación, RUT, cámara de comercio, póliza
  id, operatorId, type (HABILITACION|RUT|CAMARA_COMERCIO|INSURANCE|OTHER),
  fileUrl, status (PENDING|APPROVED|REJECTED), expiresAt?, reviewedBy?, reviewedAt?

OperatorMember          // usuarios que entran al portal de empresa
  id, operatorId, phone (login OTP), name,
  role : OWNER | DISPATCHER | VIEWER, active

OperatorRoute           // rutas intermunicipales que la empresa puede operar
  id, operatorId, originCity, destCity, authorized (bool)

FleetAssignment         // turno: qué conductor maneja qué vehículo
  id, operatorId, driverId, vehicleId, startedAt, endedAt?, active

Vehicle ↩︎  (+ campos)
  operatorId?           // null = vehículo de conductor independiente
  operationCardNo?      // tarjeta de operación (taxi/intermunicipal)
  capacity?             // # de pasajeros
  internalCode?         // "móvil 042" interno de la empresa
  active

Driver ↩︎  (+ campos)
  operatorId?           // afiliación a empresa (null = independiente)
  employmentType?       : OWN | AFFILIATED
```

**Relaciones clave:** `Operator 1—N Vehicle`, `Operator 1—N Driver`,
`Operator 1—N OperatorMember/Document/Route`, `FleetAssignment` une
`Driver↔Vehicle` en el tiempo. `Trip`/`IntercityBooking`/`PooledTrip` ganan un
`operatorId?` para saber **bajo qué empresa** se prestó el servicio (clave para
legalidad, liquidación y reportes).

> Reutiliza lo existente: el `geo` (PostGIS) ya vive en `drivers`; el rastreo de
> flota se arma **sin** duplicar posiciones. Los `Payout` y la verificación de
> documentos se generalizan de "conductor" a "conductor **u** operador".

---

## 4. Onboarding de la empresa (habilitación)

1. **Registro** en el Portal de Empresa: NIT, razón social, tipo (taxi/
   intermunicipal/mixto), contacto, ciudad. → `Operator(status=PENDING)`.
2. **Carga de documentos legales** (`OperatorDocument`): resolución de
   **habilitación**, RUT, cámara de comercio, póliza contractual/extracontractual.
3. **Verificación por admin** en `/admin` (reutiliza el flujo de aprobación de
   documentos que ya existe para conductores) → `isVerified=true`,
   `status=ACTIVE`. Sin esto, la empresa **no** puede recibir viajes troncales.
4. **Alta de rutas** (`OperatorRoute`) que la empresa está autorizada a operar.

---

## 5. Gestión de flota (vehículos + conductores)

Desde el Portal de Empresa (rol OWNER/DISPATCHER):

- **Vehículos:** alta/baja, placa, tipo, tarjeta de operación, capacidad, código
  interno; estado documental (SOAT/RTM por vehículo, con alertas de vencimiento).
- **Conductores:** invitar por teléfono → el conductor se registra/loguea en la
  App Conductor y queda **afiliado** (`Driver.operatorId`). Verificación de sus
  documentos personales sigue igual.
- **Asignación turno** (`FleetAssignment`): qué conductor maneja qué móvil hoy.
  Define quién aparece "en línea" por la empresa y bajo qué vehículo se factura.

---

## 6. Rastreo de flota en tiempo real

Reutiliza el *heartbeat* de ubicación que la App Conductor ya envía por WS
(`location_update` → columna `geo` PostGIS).

- **Backend:** `GET /operator/fleet` (auth de empresa) → lista de móviles con
  última posición, estado (libre/ocupado/offline), conductor asignado y viaje
  actual. Más un canal WS `operator_fleet` que empuja posiciones en vivo al
  portal (igual que el portal de negocio recibe pedidos en vivo hoy).
- **Portal:** mapa con todos los móviles de la empresa, panel lateral con lista,
  filtros por estado/ruta, y detalle por vehículo (viaje, pasajero enmascarado,
  ETA). Histórico de recorridos (fase 2).
- **Privacidad/seguridad:** la empresa solo ve **sus** vehículos; teléfonos del
  pasajero enmascarados (ya existe `maskPhone`).

---

## 7. Operación intermunicipal (legal)

- Las rutas `requiresLicensedOperator` (troncales) se ofrecen **solo** a
  empresas `INTERCITY/MIXED` verificadas y con `OperatorRoute.authorized` para
  ese par de ciudades. El "modelo dual" deja de ser un simple bloqueo y pasa a
  ser un **enrutamiento a empresas habilitadas**.
- Reusa lo que ya hay: `IntercityBooking` (cliente ofrece tarifa) y `PooledTrip`
  (cupos), pero el viaje se asigna a un **vehículo de la empresa** y queda
  sellado con `operatorId` (trazabilidad legal + liquidación).
- El **gasto compartido** entre particulares se mantiene para rutas NO troncales
  (sigue la salvaguarda del tope). Dos regímenes coexisten.

---

## 8. Operación de taxi por empresa

- Empresas `TAXI` registran su flota de taxis (con tarjeta de operación).
- Despacho urbano: el pasajero pide taxi y el matching geoespacial actual ofrece
  a los **taxis de empresas** cercanos (filtrable). Dos modelos posibles
  (decisión §13): **cerrado** (cada empresa despacha su flota) u **abierto**
  (pool de taxis de varias empresas, como hoy pero etiquetado por empresa).
- La empresa ve sus taxis, turnos, viajes e ingresos en el portal.

---

## 9. Despacho: cómo se asignan los viajes

Tres modos (configurable por empresa):

1. **Auto-match de plataforma** (reusa `matching.service`): la plataforma ofrece
   el viaje al vehículo disponible más cercano de la(s) empresa(s) elegibles.
2. **Despacho interno**: el viaje entra a la **cola de la empresa** y su
   despachador lo asigna a un móvil desde el portal.
3. **Híbrido**: auto-match con ventana para que el despachador intervenga.

En todos, al aceptar/asignar se sella `Trip.operatorId` + `vehicleId` + `driverId`.

---

## 10. Superficies (UI)

- **Portal de Empresa (NUEVO, web Next.js)** — espejo del patrón `/negocio` que
  ya existe: `/empresa/registro`, login OTP de `OperatorMember`, y dashboard:
  **mapa de flota en vivo**, vehículos, conductores, viajes, documentos/
  cumplimiento, liquidación/ingresos.
- **App Conductor (cambios):** afiliación a empresa (muestra "Conduces para
  {empresa}"), selección de vehículo/turno, recibir viajes asignados por la
  empresa, además del modo independiente.
- **Panel /admin (cambios):** verificar habilitación de empresas, suspender,
  ver flota agregada y métricas por operador.
- **App Cliente (cambios menores):** mostrar la empresa/operador del viaje
  intermunicipal y del taxi (confianza), y filtrar por empresa si aplica.

---

## 11. Backend: piezas a construir

- **Prisma:** modelos `Operator`, `OperatorDocument`, `OperatorMember`,
  `OperatorRoute`, `FleetAssignment` + columnas en `Vehicle`/`Driver`/`Trip`/
  `IntercityBooking`/`PooledTrip` (`operatorId`). 1 migración.
- **Auth de empresa:** OTP → JWT de `OperatorMember` (reusa `otp.service` +
  patrón del `admin.middleware`), con scope por `operatorId` y rol.
- **Rutas** `/operator/*`: registro, perfil, documentos, vehículos (CRUD),
  conductores (invitar/listar), rutas, **flota (posiciones + WS)**, viajes,
  liquidación.
- **Matching/intercity:** filtrar candidatos por `operatorId` + habilitación +
  ruta autorizada; sellar `operatorId` al asignar.
- **Admin:** verificación de `OperatorDocument` + gestión de operadores.
- **Liquidación:** generalizar `payout`/`driver_earnings` a nivel operador
  (la empresa cobra; la plataforma retiene comisión).

---

## 12. Facturación / modelo de ingresos

Opciones (decisión §13): **(a)** comisión por viaje (como hoy, pero liquidada a
la empresa), **(b)** suscripción SaaS por vehículo/mes (rastreo + despacho),
**(c)** híbrido. El modelo elegido define la generalización de `Payout`/ledger.

---

## 13. Decisiones clave a confirmar (para profundizar)

1. **Afiliación de conductores:** ¿la empresa trae **solo sus propios**
   conductores, o conductores independientes pueden **afiliarse**? (Recomiendo
   soportar ambos.)
2. **Despacho de taxi:** ¿modelo **cerrado** (cada empresa su flota) o **abierto**
   (pool entre empresas)? (Define §8 y el matching.)
3. **Modo de despacho por defecto:** auto-match, interno o híbrido (§9).
4. **Modelo de ingresos:** comisión, SaaS por vehículo, o híbrido (§12).
5. **Alcance del rastreo:** ¿solo posición en vivo, o también histórico de
   recorridos, geocercas y reportes de cumplimiento?
6. **Prioridad:** ¿arrancamos por **taxi-empresa** (urbano, más volumen) o por
   **intermunicipal** (lo legalmente urgente)?

---

## 14. Roadmap por fases (propuesto)

- **Fase 1 — Cimientos:** modelos `Operator`/flota + migración; onboarding de
  empresa + verificación admin; afiliación de conductores/vehículos.
- **Fase 2 — Rastreo:** `GET /operator/fleet` + WS + portal con mapa de flota en
  vivo (MVP del valor visible para la empresa).
- **Fase 3 — Despacho:** asignar viajes a la flota (auto-match e interno),
  sellar `operatorId`, cola del despachador.
- **Fase 4 — Intermunicipal legal:** enrutar troncales a empresas habilitadas;
  rutas autorizadas; liquidación por operador.
- **Fase 5 — Cumplimiento y reportes:** alertas documentales por vehículo,
  histórico de recorridos, reportes para la empresa y el regulador.
