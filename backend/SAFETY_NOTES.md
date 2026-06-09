# Safety & Privacy Notes

This document tracks the **stubs**, the **honest current behaviour**, and the
**integration seams** for Nexum's trust-&-safety features (number privacy + SOS).

---

## 1. Number privacy (passenger ↔ driver)

**Rule:** the other party's real, complete phone number is **never** sent by
default, and **never** appears in a URL or query param.

### How it works today
- `services/safe-contact.service.ts` provides:
  - `maskPhone(raw)` → `"+57 •••• ••• 12"` (keeps only the last 2 digits).
  - `safeContact(realPhone)` → `{ contactChannel: 'in_app_chat', maskedPhone }`.
  - `getProxyNumber(tripId, role)` → **STUB**, returns `null`.
- Every cross-party DTO now carries `contactChannel: 'in_app_chat'` and a
  `maskedPhone`, and the legacy `driverPhone` / `passengerPhone` / `clientPhone`
  field is populated with the **masked** value (never the real one):
  `ClientTripDTO`, `ClientOrderSummaryDTO`, `ClientErrandDTO`,
  `IntercityBookingDTO`, `SeatBookingDTO`, `PooledTripDTO`, `RideBidDTO`,
  `RideRequestDTO`, `DeliveryOrderSummaryDTO`.
- Communication between the parties goes through the existing **in-app chat**
  (`ride-negotiation.service.ts` → `addChatMessage` / `getChatHistory`).

### STUB — call proxy
`getProxyNumber(tripId, role)` is the seam for a masked-calling provider
(Twilio Proxy, a SIP/PBX bridge, or similar). Until one is wired up, **direct
dialing is disabled** and chat is the channel. To enable masked calls:
1. Implement `getProxyNumber` to allocate/return a temporary proxy number that
   bridges the two parties.
2. Set `contactChannel: 'call_proxy'` and put the proxy number (not the real
   one) in `maskedPhone` for that trip.

### Known, intentional exceptions
- **`recipientPhone` (Envíos):** the package recipient is a third party the
  driver must physically reach for delivery — not the passenger↔driver pair and
  often not a Nexum user (no chat). It is retained for delivery logistics. If a
  recipient-facing proxy/notification is added later, mask it too.
- **Business ↔ driver delivery coordination:** the driver's number shown to a
  business is now masked. There is no business↔driver chat yet, so coordination
  relies on the order-status flow. Adding a business↔driver chat (or proxy) is a
  follow-up.

---

## 2. SOS / emergency

### What the SOS actually does TODAY (be honest in the UI)
1. **Records** an `EmergencyEvent` row (audit trail + last location).
2. If the user configured a **trusted contact**, builds the alert payload and
   hands it to a **STUB** sender (see below).
3. The apps **facilitate a call to 123** (Colombia's emergency line) and let the
   user **share the trip** with their trusted contact.

> ⚠️ The SOS does **NOT** automatically notify the police. The UI must not claim
> it does. It shares your location with your trusted contact and makes calling
> **123** one tap away.

### STUB — trusted-contact notification (SMS/WhatsApp)
`services/safety.service.ts` → `notifyTrustedContact(...)` currently only logs a
masked line and returns `true` ("queued"). No SMS/WhatsApp provider is
integrated. To enable real alerts, replace the body with a Twilio SMS or Meta
WhatsApp Cloud API call. The `trustedContactNotified` flag in the `/safety/sos`
response reflects whether a contact existed and the (stub) dispatch succeeded.

### Endpoints (`/safety`, accepts client OR driver bearer token)
| Method | Path                     | Auth   | Purpose |
|--------|--------------------------|--------|---------|
| POST   | `/safety/sos`            | either | Record SOS `{ tripId?, lat, lng, type? }` → event + `emergencyNumber: '123'`. |
| GET    | `/safety/trusted-contact`| either | Read the caller's trusted contact. |
| PUT    | `/safety/trusted-contact`| either | Set `{ name, phone }`. |
| POST   | `/safety/share-trip`     | either | Issue an opaque share token for `{ tripId }` (caller must own the trip). |
| GET    | `/safety/track/:token`   | public | Minimal, sanitised trip status — **no** phones/fares/full names. |

### Trip sharing & privacy
- The share token is a **short-lived (6h) opaque JWT** (`purpose: 'trip_share'`)
  carrying only the `tripId`. **No PII in the URL** (privacy rule #2).
- `/safety/track/:token` returns only: status, origin/destination addresses,
  driver first name, vehicle description, ETA, `updatedAt`. Live GPS is not
  persisted on the `Trip` row today, so the tracker shows route + status rather
  than a moving dot — a follow-up if live location persistence is added.

### Data model
- `EmergencyEvent` (`emergency_events`): `userId?`, `driverId?`, `tripId?`,
  `lat`, `lng`, `type` (`PANIC` | `SHARE`), `createdAt`.
- Trusted contact persisted on both `User` and `Driver`
  (`trustedContactName`, `trustedContactPhone`).
- Migration: `prisma/migrations/20260609140000_add_safety_sos`.

### Emergency number
Colombia's single emergency line is **123** (not 911). Use 123 everywhere in the
UI.
