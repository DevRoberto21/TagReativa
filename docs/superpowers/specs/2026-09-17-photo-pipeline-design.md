# Photo Pipeline (Performance + Signed Upload) — Design Spec

Date: 2026-09-17
Status: Approved by user, ready for implementation plan

## Context

TagReativa's pet photo upload today (`frontend/src/hooks/usePhotoUpload.js`,
`frontend/src/utils/cropImage.js`) crops client-side via `react-easy-crop`
then uploads directly to Cloudinary using an **unsigned** upload preset
(`tagreativa_pictures`, cloud name `dan2bsmlk`, both hardcoded and visible
in the shipped frontend bundle). This is sub-project 3 of the roadmap
agreed during the email-notifications brainstorming session (Email → Auth
hardening → Photo pipeline). The user's original ask was specifically
performance ("consumir menos desempenho do sistema"); during brainstorming
the user also chose to fold in a related security gap found while
reviewing the code: because the preset is unsigned, anyone who reads the
frontend's JS bundle can POST arbitrary files to the project's Cloudinary
account using that preset, with no authentication — this is a distinct
concern from performance, addressed here at the user's explicit request.
Target: production-usable before end of October 2026 (TCC deadline).

## Scope

In scope:
- **Performance:** client-side file-type/size validation before reading a
  file into memory; resizing the cropped output to a bounded max dimension
  before upload; optimized delivery via Cloudinary's on-the-fly
  transformation URLs (`f_auto,q_auto`, plus a per-context width) wherever
  a pet photo is rendered.
- **Security:** move the Cloudinary upload from unsigned to signed. A new
  authenticated backend endpoint generates a short-lived upload signature
  (using a `CLOUDINARY_API_SECRET` that never reaches the client); the
  frontend uses it to authorize each upload. Requires a manual step on the
  user's Cloudinary dashboard (flip the `tagreativa_pictures` preset from
  "Unsigned" to "Signed") — the user has explicitly agreed to do this when
  given exact instructions during implementation.

Out of scope (explicitly deferred):
- Server-side image processing/proxying (uploads still go browser →
  Cloudinary directly, never through the NestJS backend — only the
  *signature* is generated server-side, not the file itself). Keeps
  upload bandwidth off the app server, unchanged from today's pattern.
- Moving `CLOUDINARY_CLOUD_NAME`/`tagreativa_pictures` preset name into
  environment variables — neither is a secret (both are already public in
  the current unsigned setup and remain visible in any Cloudinary URL), so
  hardcoding them is fine; only the new `CLOUDINARY_API_KEY` (semi-public,
  sent to authenticated clients) and `CLOUDINARY_API_SECRET` (server-only,
  never sent anywhere) are new configuration.
- Any change to how `Pet.photoUrl` is stored (still a plain string column,
  still the Cloudinary `secure_url` returned at upload time) — only how
  that URL is *rendered* changes (transformation params appended at
  display time, not baked into the stored value), so existing stored URLs
  for already-uploaded pet photos keep working unchanged.
- Video, multiple photos per pet, or any pet-photo feature beyond the
  existing single-photo-per-pet model.

## Architecture

**Signed upload flow:**

A new `CloudinaryModule`/`CloudinaryService` (mirroring the existing
`EmailModule`/`EmailService` pattern: single external-integration
responsibility, fails fast in its constructor if required env vars are
missing, matching `EmailService`'s `FATAL: ... não definido.` convention)
provides `generateUploadSignature(): { signature, timestamp, apiKey,
cloudName, uploadPreset }`. The signature is computed locally with Node's
`crypto` (`createHash('sha1')`) per
[Cloudinary's signing algorithm](https://cloudinary.com/documentation/upload_images#generating_authentication_signatures) —
no network call to Cloudinary is needed to generate it, it's a pure local
computation using the secret.

A new authenticated route, `POST /pets/photo-upload-signature`, added to
the existing `PetsController` (already class-level
`@UseGuards(AuthGuard('jwt'))`, matching every other pet route), calls
this and returns the result. The frontend calls this endpoint
immediately before each upload, then includes `api_key`, `timestamp`,
`signature`, and `upload_preset` in the `FormData` POSTed directly to
Cloudinary (`https://api.cloudinary.com/v1_1/<cloudName>/image/upload`) —
the upload itself still goes straight from the browser to Cloudinary,
never through the NestJS backend; only the authorization to do so is
now backend-issued and time-scoped (Cloudinary signatures are valid for
a limited window from their `timestamp`), instead of being an open,
permanently-valid unsigned preset.

**New env vars** (backend `.env`, gitignored):
- `CLOUDINARY_API_KEY` — from the Cloudinary dashboard, semi-public (sent
  to authenticated clients in the signature response, same trust level as
  a JWT payload), not a secret by itself.
- `CLOUDINARY_API_SECRET` — from the Cloudinary dashboard, must never
  leave the server; used only inside `CloudinaryService`'s signature
  computation.

**Required manual step:** the Cloudinary preset `tagreativa_pictures`
must be switched from "Unsigned" to "Signed" mode in the Cloudinary
dashboard (Settings → Upload → Upload presets) — an unsigned preset does
not enforce or even check a supplied signature, so without this flip the
new signed-upload code would still succeed today but provide zero actual
security benefit (anyone could still upload unsigned, bypassing the
signature entirely). Exact click-path will be given to the user at
implementation time; this step must be verified as part of the manual
smoke check below, not assumed to have happened.

## Performance

Three independent techniques, all client-side except the delivery-URL
piece:

1. **Early validation** (`usePhotoUpload.js`'s `handleFileChange`):
   reject before ever reading the file into memory (`FileReader`) if
   `file.type` isn't one of `image/jpeg`, `image/png`, `image/webp`, or if
   `file.size` exceeds 5 MB. Prevents the browser from doing wasted work
   (base64-encoding a huge or non-image file) on an upload that was never
   going to succeed.
2. **Bounded resize at crop time** (`cropImage.js`'s `getCroppedImg`):
   today the output canvas is sized exactly to the user's crop selection,
   which can be arbitrarily large (a full-resolution phone photo cropped
   loosely). Cap the longer output side at 800px — scale down
   proportionally (never scale up a smaller crop), draw the source crop
   region directly onto the smaller destination canvas via `drawImage`'s
   built-in scaling (one canvas, no separate resize pass), then encode as
   before (`image/jpeg`, quality 0.85). Reduces both upload bandwidth and
   what Cloudinary stores.
3. **Optimized delivery, not baked into storage** (new
   `frontend/src/utils/cloudinaryUrl.js`): a small helper that inserts
   Cloudinary's on-the-fly transformation segment
   (`f_auto,q_auto,w_<width>`) into a `secure_url` right after its fixed
   `/upload/` path segment — `f_auto` serves the best format the
   requesting browser supports (WebP/AVIF where possible, falling back to
   JPEG), `q_auto` picks an optimal quality/size tradeoff Cloudinary
   computes per-image, and `w_<width>` caps delivered pixel dimensions to
   what the UI context actually displays (an avatar doesn't need a
   1600px-wide image). Applied at render time in the four places a pet
   photo is shown (`Dashboard.jsx`, `EditPet.jsx`, `NewPet.jsx` — avatar
   context, `w=200` — and `ScanPage.jsx` — larger display context,
   `w=600`), never stored — the raw `photoUrl` in the database is
   untouched, so this is reversible/adjustable without any data migration
   if the widths ever need tuning.

## Frontend

- `frontend/src/hooks/usePhotoUpload.js`: add the file-type/size
  validation in `handleFileChange` (setting `uploadError` and returning
  early on rejection, matching the hook's existing error-state pattern);
  in `handleCropConfirm`, call `api.post('/pets/photo-upload-signature')`
  (the existing shared `api` axios client, which already attaches the
  JWT) before building the `FormData`, and use the returned
  `{signature, timestamp, apiKey, cloudName, uploadPreset}` instead of
  the current hardcoded `CLOUD_NAME`/`UPLOAD_PRESET` constants — the
  backend becomes the single source of truth for these values rather
  than duplicating them in the frontend.
- `frontend/src/utils/cropImage.js`: add the 800px bounded-resize logic
  described above.
- `frontend/src/utils/cloudinaryUrl.js` (new): the delivery-URL
  transformation helper.
- `frontend/src/pages/Dashboard.jsx`, `EditPet.jsx`, `NewPet.jsx`,
  `ScanPage.jsx`: wrap each `<img src={photoUrl} .../>`'s `src` with
  `cloudinaryUrl(photoUrl, { width: ... })`.

## Backend

- `src/cloudinary/cloudinary.module.ts` (new), `cloudinary.service.ts`
  (new): the signature-generation service described above.
- `src/pets/pets.controller.ts`: inject `CloudinaryService`, add
  `POST /pets/photo-upload-signature`.
- `src/pets/pets.module.ts`: import `CloudinaryModule`.

## Error handling

- Client-side validation failures (wrong type, too large) surface via the
  existing `uploadError` state — same UI pattern already used for upload
  failures, no new error-display code needed.
- If the signature request itself fails (network error, missing env vars
  causing a 500), `handleCropConfirm`'s existing `try/catch` already
  catches it and sets the existing generic `'Erro ao fazer upload da
  foto.'` message — no new error path required.
- `CloudinaryService`'s constructor throws fatally on missing
  `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` at app startup, matching
  `EmailService`'s convention — a misconfigured deploy fails loudly and
  immediately rather than allowing broken uploads to ship silently.

## Testing

New `src/cloudinary/cloudinary.service.spec.ts`:
1. `generateUploadSignature()` returns an object with `signature`
   (40-character hex string — SHA1 digest length), a numeric `timestamp`,
   and the expected `apiKey`/`cloudName`/`uploadPreset` values.
2. The returned `signature` is deterministic and correct: recompute the
   expected SHA1 using the same algorithm independently in the test (not
   by calling the service's own private logic) against a fixed mocked
   `CLOUDINARY_API_SECRET` and the `timestamp` the service actually
   returned, and assert equality — this catches a wrong-algorithm bug
   that a "just check it's a hex string" test would miss.
3. Constructing `CloudinaryService` without `CLOUDINARY_API_KEY` set
   throws.
4. Constructing `CloudinaryService` without `CLOUDINARY_API_SECRET` set
   throws.

`src/pets/pets.controller.spec.ts` (existing, fixed during the
email-notifications branch): extend its mock providers to include
`CloudinaryService` (now a `PetsController` dependency) so the existing
DI-resolution test keeps passing.

No test framework exists for the frontend hooks/utils in this project
(matches the established convention from the email-notifications and
password-recovery branches, which didn't add one either) — the resize and
URL-transformation logic gets verified via the manual smoke check below,
not unit tests.

## Manual smoke check (part of implementation, not deferred)

With the Cloudinary preset flipped to signed and the backend running:
1. Upload a real photo through `NewPet.jsx`'s flow — confirm it succeeds
   (proves the signed-upload round trip works end to end, not just that
   the signature endpoint returns *a* signature).
2. Confirm the uploaded photo's dimensions in Cloudinary's dashboard (or
   by inspecting the `secure_url`'s response headers) are ≤800px on the
   longer side, confirming the client-side resize took effect.
3. Confirm the rendered `<img>` src in Dashboard/EditPet/ScanPage
   actually contains the `f_auto,q_auto,w_...` segment (view page source
   or devtools), and that the image loads correctly in the browser.
4. Attempt an upload of a >5MB file and a non-image file — confirm both
   are rejected client-side with the existing error UI, before any
   network request to Cloudinary fires.
5. After the preset flip, confirm an upload attempt using the *old*
   unsigned pattern (no signature params) is rejected by Cloudinary —
   this is the actual proof the security fix took effect, not just that
   the new signed path works.

## Future work (explicitly deferred, not in this project)

- Multiple photos per pet.
- Server-side/backend-proxied uploads (would let the backend do virus
  scanning, additional validation, or avoid exposing any Cloudinary
  config to the client at all — bigger architectural change, not needed
  at current scale).
- Automatic cleanup of orphaned Cloudinary assets when a pet's photo is
  replaced or the pet is deleted (today, replacing/deleting a pet's photo
  leaves the old Cloudinary asset in place, unreferenced but not
  deleted — a pre-existing gap, not introduced or worsened by this
  project).
