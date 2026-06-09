# Driver Verification System — Implementation Notes

## Document Storage

Files are stored on the local server disk under `uploads/driver-documents/`.

- **Path**: `<project-root>/uploads/driver-documents/<timestamp>-<random>.<ext>`
- **Served at**: `GET /uploads/driver-documents/<filename>` (static, no directory listing)
- **Access control**: Files are publicly accessible by URL; the filenames contain no PII (timestamp + random suffix only).
- **Allowed formats**: JPG, PNG, WebP, PDF — max 10 MB per file.

### Production upgrade path
For production, replace `multer` disk storage with an S3/R2/GCS bucket:
1. Swap `StorageEngine` in `src/lib/upload.ts` for `multer-s3` or equivalent.
2. `fileToUrl()` returns the bucket URL instead of `/uploads/…`.
3. No other code changes needed.

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
