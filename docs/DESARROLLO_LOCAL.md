# Desarrollo local — probar las dos apps en Android Studio

Guía para correr el backend en tu máquina y ver **App Cliente** y **App Conductor**
interactuando en dos emuladores, como en el flujo de desarrollo normal.

> **Por qué esto:** las apps, por defecto, ahora detectan si corren en **debug**
> (Android Studio) y apuntan solas al backend **local** (`10.0.2.2:3000`). En
> **release** (APK/web publicado) apuntan a producción. No tienes que tocar la
> URL: solo levanta el backend local y corre las apps.

---

## 1. Backend local (una vez por sesión)

### a) Postgres con PostGIS (Docker)
```bash
docker-compose up -d nexum-db
```
Esto levanta **solo la base de datos** (puerto `5432` expuesto al host).

### b) Backend con hot-reload (en el host, fuera de Docker)
```bash
cd backend
cp .env.example .env          # NODE_ENV=development, OTP 123456, DB en localhost:5432
npm install
npm run db:migrate            # aplica migraciones (PostGIS, payouts, propinas…)
npm run db:seed               # conductor demo verificado + 3 negocios + usuario demo
npm run dev                   # API + WebSocket en http://localhost:3000
```

Verifica: abre `http://localhost:3000/health` → `{"status":"ok","db":true}`.

> **Alternativa todo-en-Docker:** `docker-compose up` levanta backend + BD juntos
> (ya en `development`, login con `123456`). Pero **no siembra** la BD: corre el
> seed desde el host con
> `DATABASE_URL=postgresql://nexum:nexum_dev_secret@localhost:5432/nexum_db npm run db:seed`.

---

## 2. Emuladores en Android Studio

Abre **dos** emuladores (o usa el Device Manager para lanzar dos AVD):
- Emulador **A** → App Conductor (`AppTransport`)
- Emulador **B** → App Cliente (`AppCliente`)

En cada proyecto: **Run** ▶ (modo debug). No necesitas `--dart-define`: en debug ya
apuntan a `10.0.2.2:3000` (que es el `localhost` de tu PC visto desde el emulador).

### ⚠️ Paso crítico: ubicación del emulador del CONDUCTOR
El matching empareja conductores **cerca** del punto de recogida. Un emulador
nuevo reporta GPS en California (Google HQ) → nunca emparejaría con Pamplona.

En el emulador del conductor: **`...` (Extended controls) → Location** → pon
Pamplona y **Set Location**:
```
Lat: 7.3754   Lng: -72.6486   (Parque Águeda Gallardo, Pamplona)
```

---

## 3. Cuentas demo (login con código `123456`)

| Rol | Teléfono | Notas |
|---|---|---|
| **Conductor** | `+57 312 456 7890` | Verificado por el seed. **Debe ser este** (es el único habilitado para ponerse en línea). |
| **Cliente** | `+57 315 000 0001` | O cualquier número: se crea solo al entrar. |

---

## 4. Probar la interacción

### Opción A — Domicilios (✅ funciona sin Google Maps)
1. **Conductor** (emulador A): entra → **Conéctate** (en línea). Da permiso de ubicación.
2. **Cliente** (emulador B): entra → en **Mis direcciones** agrega una dirección
   (texto libre, p. ej. "Calle 6 #5-20, Pamplona") y déjala como predeterminada.
3. Cliente → entra a un negocio sembrado (**Restaurante El Buen Sabor**, **Farmacia
   La Salud** o **Supermercado El Ahorro**) → agrega productos → **Carrito** → **Pagar/Pedir**.
4. El pedido se difunde al conductor cercano → **Conductor lo acepta**.
5. Verás el **seguimiento en vivo**, y al entregar, la **propina** y las **ganancias**.

> El domicilio empareja contra la ubicación del **negocio** (coords sembradas), por
> eso no necesita Google: solo que el conductor esté en línea y cerca de Pamplona.

### Opción B — Viajes (requiere `GOOGLE_MAPS_API_KEY`)
El cliente obtiene las coordenadas del origen/destino del **autocompletado de
direcciones** (Google Places vía backend). Para probar viajes en local, añade la
key a `backend/.env`:
```
GOOGLE_MAPS_API_KEY=AIza...
```
Reinicia `npm run dev`. Ahora al escribir una dirección aparecen sugerencias; al
elegir una se resuelven las coordenadas y el viaje se puede emparejar.

> Si no tienes key todavía, usa la **Opción A** (domicilios) para ver la
> interacción completa. (Pendiente opcional: botón "usar mi ubicación actual" en el
> cliente para pedir viajes sin Google.)

---

## 5. Si algo falla

| Síntoma | Causa / arreglo |
|---|---|
| App muestra error de conexión | El backend local no está corriendo, o el emulador no es Android (en iOS usa `localhost`, no `10.0.2.2`). Revisa `http://localhost:3000/health`. |
| No me deja entrar | Corriste contra una BD sin migrar/sembrar, o no usaste `development`. El código es `123456`. |
| El conductor no recibe el pedido/viaje | El conductor no está **en línea**, o el emulador del conductor no tiene la ubicación en Pamplona (paso 2 ⚠️). |
| El viaje no da sugerencias de dirección | Falta `GOOGLE_MAPS_API_KEY` en `backend/.env` → usa domicilios (Opción A). |
| `npm run db:seed` no conecta | Postgres no está arriba o el puerto 5432 no está libre. `docker-compose up -d nexum-db`. |
