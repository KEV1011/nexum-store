# Driver Verification System — Implementation Notes

## Document Storage

El almacenamiento es **conmutable por entorno** (`src/lib/upload.ts`):

- **Con `S3_BUCKET` definido → S3 / Cloudflare R2** (recomendado en producción).
  La clave es `driver-documents/<timestamp>-<random>.<ext>` (sin PII). La URL la
  arma `fileToUrl()` como `S3_PUBLIC_URL/<key>` (bucket público/CDN/dominio) o,
  en su defecto, la `location` que devuelve el SDK. Variables: `S3_BUCKET`,
  `S3_REGION` (o `auto`), `S3_ENDPOINT` (R2/MinIO → estilo path), `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`.
- **Sin `S3_BUCKET` → disco local** bajo `uploads/driver-documents/`, servido en
  `GET /uploads/driver-documents/<filename>`. ⚠️ El filesystem de Render es
  **efímero**: los documentos se pierden al redeploy. Usar solo en desarrollo o
  en un host con volumen persistente.
- **Formatos**: JPG, PNG, WebP, PDF — máx. 10 MB por archivo.

> Implementado con `multer-s3` + `@aws-sdk/client-s3`. El resto del flujo
> (rutas, panel admin) no cambia: solo cambia de dónde sale la URL del archivo.

> ⚠️ **Ley 1581 de habeas data (Colombia)**: The storage and processing of identity
> documents constitutes sensitive personal data. Before production deployment, obtain
> explicit informed consent from drivers (tratamiento de datos), define a retention
> policy and deletion procedure, and validate with legal counsel.

---

## Admin Panel

### Access method
The admin panel is a simple server-side HTML page at `GET /admin/`.

Authentication uses a Bearer token whose value is the admin's phone number. Admin
phones are configured via the `ADMIN_PHONES` environment variable:

```
ADMIN_PHONES=+573001234567,+573009876543
```

In-browser login: the user enters their phone number; a `GET /admin/verifications`
request is made with `Authorization: Bearer <phone>`; if the server returns 200 the
panel unlocks.

### API endpoints (all require `Authorization: Bearer <admin-phone>`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/verifications` | List all documents (optional `?status=PENDING\|APPROVED\|REJECTED`) |
| POST | `/admin/verifications/:docId/approve` | Approve a document; auto-sets `isVerified=true` when all required docs are approved |
| POST | `/admin/verifications/:docId/reject` | Reject a document with optional `rejectionReason` in body |

### Auto-verification logic
`Driver.isVerified` is set to `true` automatically when **all four** required
documents (`CEDULA`, `LICENSE`, `SOAT`, `PROPERTY_CARD`) reach `APPROVED` status.
It is set back to `false` if any required document is later rejected.

---

## Document Type Enums

| Prisma enum value | Label |
|---|---|
| `CEDULA` | Cédula de ciudadanía |
| `LICENSE` | Licencia de conducción |
| `SOAT` | SOAT vigente |
| `PROPERTY_CARD` | Tarjeta de propiedad |
| `PROFILE_PHOTO` | Foto de perfil |

---

## Driver Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/driver/documents` | Driver JWT | List current driver's documents |
| POST | `/driver/documents` | Driver JWT | Upload a document file (`multipart/form-data`; fields: `type`, `file`, `expiresAt?`) |
| PUT | `/driver/documents` | Driver JWT | Legacy JSON upload (body: `{ type, fileUrl, expiresAt? }`) |
