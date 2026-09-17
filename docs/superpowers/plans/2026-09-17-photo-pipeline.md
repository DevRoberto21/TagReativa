# Photo Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pet-photo upload smaller/faster (client-side validation, resize, optimized delivery) and close the unsigned-Cloudinary-preset security gap (backend-issued upload signatures).

**Architecture:** A new `CloudinaryService` computes Cloudinary upload signatures locally (SHA1, using a server-only secret) and is exposed via a new authenticated `POST /pets/photo-upload-signature` route on the existing `PetsController`. The frontend's upload hook fetches a signature before each Cloudinary upload instead of relying on an unsigned preset, validates files client-side, and resizes the cropped output before sending. A new small utility rewrites stored photo URLs with Cloudinary's on-the-fly transformation params at render time — the database value itself never changes.

**Tech Stack:** NestJS, Node's built-in `crypto`, React/Vite, Cloudinary (unsigned → signed upload preset), `react-easy-crop` (already in use).

**Spec:** `docs/superpowers/specs/2026-09-17-photo-pipeline-design.md`

## Global Constraints

- Uploads still go browser → Cloudinary directly — only the *signature* is generated server-side, never the file itself (no server-side image proxying).
- `CLOUDINARY_CLOUD_NAME` (`dan2bsmlk`) and the preset name (`tagreativa_pictures`) stay hardcoded (not secrets, already public) — only `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are new env vars, and only `CLOUDINARY_API_SECRET` must never leave the server.
- `CloudinaryService`'s constructor throws fatally on missing `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, matching `EmailService`'s `FATAL: ... não definido.` convention (`src/email/email.service.ts:10-13`).
- Client-side file validation: reject before reading into memory if `file.type` isn't `image/jpeg`, `image/png`, or `image/webp`, or if `file.size` exceeds 5 MB (5 * 1024 * 1024 bytes).
- Cropped output is resized so its longer side is at most 800px (never upscaled), before being uploaded.
- `Pet.photoUrl` storage is untouched — transformation happens only at render time via a URL-rewriting helper, never baked into the stored value.
- The Cloudinary preset `tagreativa_pictures` must be manually flipped from "Unsigned" to "Signed" in the Cloudinary dashboard — this is a required manual step, not automatable, and must be verified (not assumed) as part of the manual smoke check.

---

## File Structure

- `src/cloudinary/cloudinary.service.ts` — new: `CloudinaryService.generateUploadSignature()`.
- `src/cloudinary/cloudinary.service.spec.ts` — new: unit tests for the above.
- `src/cloudinary/cloudinary.module.ts` — new: exports `CloudinaryService`, mirrors `EmailModule`.
- `src/pets/pets.controller.ts` — modify: inject `CloudinaryService`, add `POST /pets/photo-upload-signature`.
- `src/pets/pets.controller.spec.ts` — modify: mock `CloudinaryService`, add a delegation test for the new route.
- `src/pets/pets.module.ts` — modify: import `CloudinaryModule`.
- `frontend/src/hooks/usePhotoUpload.js` — modify: file validation + signed-upload flow.
- `frontend/src/utils/cropImage.js` — modify: bounded resize.
- `frontend/src/utils/cloudinaryUrl.js` — new: delivery-URL transformation helper.
- `frontend/src/pages/Dashboard.jsx`, `EditPet.jsx`, `NewPet.jsx`, `ScanPage.jsx` — modify: wrap `photoUrl` renders with `cloudinaryUrl(...)`.

---

### Task 1: Backend — CloudinaryService (signature generation)

**Files:**
- Create: `src/cloudinary/cloudinary.service.ts`
- Create: `src/cloudinary/cloudinary.service.spec.ts`
- Create: `src/cloudinary/cloudinary.module.ts`

**Interfaces:**
- Produces: `CloudinaryService.generateUploadSignature(): { signature: string; timestamp: number; apiKey: string; cloudName: string; uploadPreset: string }`. `CloudinaryModule` exports `CloudinaryService` for other modules to import.

- [ ] **Step 1: Write the failing tests**

Create `src/cloudinary/cloudinary.service.spec.ts`:

```typescript
import { createHash } from 'crypto';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLOUDINARY_API_KEY: 'test-api-key',
      CLOUDINARY_API_SECRET: 'test-api-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a valid signature payload', () => {
    const service = new CloudinaryService();

    const result = service.generateUploadSignature();

    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof result.timestamp).toBe('number');
    expect(result.apiKey).toBe('test-api-key');
    expect(result.cloudName).toBe('dan2bsmlk');
    expect(result.uploadPreset).toBe('tagreativa_pictures');
  });

  it('computes the signature using the correct algorithm', () => {
    const service = new CloudinaryService();

    const result = service.generateUploadSignature();

    const expectedSignature = createHash('sha1')
      .update(
        `timestamp=${result.timestamp}&upload_preset=tagreativa_pictures` +
          'test-api-secret',
      )
      .digest('hex');

    expect(result.signature).toBe(expectedSignature);
  });

  it('throws when CLOUDINARY_API_KEY is missing', () => {
    delete process.env.CLOUDINARY_API_KEY;

    expect(() => new CloudinaryService()).toThrow(
      'FATAL: CLOUDINARY_API_KEY não definido.',
    );
  });

  it('throws when CLOUDINARY_API_SECRET is missing', () => {
    delete process.env.CLOUDINARY_API_SECRET;

    expect(() => new CloudinaryService()).toThrow(
      'FATAL: CLOUDINARY_API_SECRET não definido.',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- cloudinary.service.spec.ts`

Expected: FAIL — `Cannot find module './cloudinary.service'`.

- [ ] **Step 3: Write the implementation**

Create `src/cloudinary/cloudinary.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

const CLOUDINARY_CLOUD_NAME = 'dan2bsmlk';
const CLOUDINARY_UPLOAD_PRESET = 'tagreativa_pictures';

export interface CloudinaryUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  uploadPreset: string;
}

@Injectable()
export class CloudinaryService {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor() {
    const apiKey = process.env.CLOUDINARY_API_KEY;
    if (!apiKey) throw new Error('FATAL: CLOUDINARY_API_KEY não definido.');
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiSecret) {
      throw new Error('FATAL: CLOUDINARY_API_SECRET não definido.');
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  generateUploadSignature(): CloudinaryUploadSignature {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `timestamp=${timestamp}&upload_preset=${CLOUDINARY_UPLOAD_PRESET}`;
    const signature = createHash('sha1')
      .update(paramsToSign + this.apiSecret)
      .digest('hex');

    return {
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- cloudinary.service.spec.ts`

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Create the module**

Create `src/cloudinary/cloudinary.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

@Module({
  providers: [CloudinaryService],
  exports: [CloudinaryService],
})
export class CloudinaryModule {}
```

- [ ] **Step 6: Add local env vars**

Add these two lines to `.env` (gitignored — do not commit it):

```
CLOUDINARY_API_KEY=your-cloudinary-api-key-here
CLOUDINARY_API_SECRET=your-cloudinary-api-secret-here
```

Get the real values from the Cloudinary dashboard: Settings → Access Keys (API Key and API Secret for cloud `dan2bsmlk`).

- [ ] **Step 7: Commit**

```bash
git add src/cloudinary
git commit -m "feat: add CloudinaryService for signed upload signatures"
```

Note: `.env` is gitignored and is not part of this commit — verify with `git status` that it does not appear staged.

---

### Task 2: Backend — wire signature endpoint into PetsController

**Files:**
- Modify: `src/pets/pets.controller.ts:1-19`
- Modify: `src/pets/pets.controller.spec.ts`
- Modify: `src/pets/pets.module.ts`

**Interfaces:**
- Consumes: `CloudinaryService.generateUploadSignature()` (Task 1, exact signature above).
- Produces: `PetsController.getPhotoUploadSignature()` — the route handler Task 3/4's frontend code calls via `POST /pets/photo-upload-signature`.

- [ ] **Step 1: Write the failing test**

Replace all of `src/pets/pets.controller.spec.ts` with:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PetsController } from './pets.controller';
import { PetsService } from './pets.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('PetsController', () => {
  let controller: PetsController;
  let cloudinaryService: { generateUploadSignature: jest.Mock };

  beforeEach(async () => {
    cloudinaryService = { generateUploadSignature: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PetsController],
      providers: [
        {
          provide: PetsService,
          useValue: {
            create: jest.fn(),
            findAllByOwner: jest.fn(),
            findOne: jest.fn(),
            updatePet: jest.fn(),
            deletePet: jest.fn(),
            updateStatus: jest.fn(),
            findScans: jest.fn(),
          },
        },
        { provide: CloudinaryService, useValue: cloudinaryService },
      ],
    }).compile();

    controller = module.get<PetsController>(PetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getPhotoUploadSignature delegates to CloudinaryService', () => {
    const mockSignature = {
      signature: 'abc',
      timestamp: 123,
      apiKey: 'key',
      cloudName: 'dan2bsmlk',
      uploadPreset: 'tagreativa_pictures',
    };
    cloudinaryService.generateUploadSignature.mockReturnValue(mockSignature);

    const result = controller.getPhotoUploadSignature();

    expect(result).toEqual(mockSignature);
    expect(cloudinaryService.generateUploadSignature).toHaveBeenCalledTimes(
      1,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- pets.controller.spec.ts`

Expected: FAIL — `Nest can't resolve dependencies of the PetsController` (constructor doesn't yet accept `CloudinaryService`) and/or `controller.getPhotoUploadSignature is not a function`.

- [ ] **Step 3: Wire `CloudinaryService` into the controller**

Replace the top of `src/pets/pets.controller.ts` (imports, interface, constructor) from:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetStatusDto } from './dto/update-pet-status.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreatePetDto) {
    return this.petsService.create(req.user.userId, dto);
  }
```

to:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PetsService } from './pets.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetStatusDto } from './dto/update-pet-status.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('pets')
export class PetsController {
  constructor(
    private readonly petsService: PetsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreatePetDto) {
    return this.petsService.create(req.user.userId, dto);
  }

  @Post('photo-upload-signature')
  getPhotoUploadSignature() {
    return this.cloudinaryService.generateUploadSignature();
  }
```

Leave every other method in the file (`findAll`, `findOne`, `updateStatus`, `updatePet`, `deletePet`, `findScans`) exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- pets.controller.spec.ts`

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Wire `CloudinaryModule` into `PetsModule`**

Replace all of `src/pets/pets.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PetsService } from './pets.service';
import { PetsController } from './pets.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [PetsController],
  providers: [PetsService],
})
export class PetsModule {}
```

- [ ] **Step 6: Run the full test suite and a build check**

Run: `npm test`

Expected: PASS — all suites green.

Run: `npx tsc --noEmit -p tsconfig.build.json`

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/pets/pets.controller.ts src/pets/pets.controller.spec.ts src/pets/pets.module.ts
git commit -m "feat: add POST /pets/photo-upload-signature endpoint"
```

---

### Task 3: Frontend — validation, resize, and signed upload

**Files:**
- Modify: `frontend/src/hooks/usePhotoUpload.js`
- Modify: `frontend/src/utils/cropImage.js`

**Interfaces:**
- Consumes: `POST /pets/photo-upload-signature` (Task 2) → `{ signature, timestamp, apiKey, cloudName, uploadPreset }`, called via the existing shared `api` axios client (`frontend/src/services/api.js`, already attaches the JWT automatically).
- Produces: `usePhotoUpload`'s public interface (`photoUrl`, `setPhotoUrl`, `showCropper`, `uploading`, `uploadError`, `rawImage`, `crop`, `setCrop`, `zoom`, `setZoom`, `handleFileChange`, `onCropComplete`, `handleCropConfirm`, `cancelCrop`) is UNCHANGED — `NewPet.jsx`/`EditPet.jsx` (Task 4, not modified by this task) keep working without any change to how they call this hook.

- [ ] **Step 1: Add the bounded resize to `cropImage.js`**

Replace all of `frontend/src/utils/cropImage.js`:

```javascript
const MAX_OUTPUT_DIMENSION = 800;

export default async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = imageSrc;
  });

  const scale = Math.min(
    1,
    MAX_OUTPUT_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height),
  );
  const targetWidth = Math.round(pixelCrop.width * scale);
  const targetHeight = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
  });
}
```

(`scale = Math.min(1, ...)` guarantees a crop smaller than 800px on its longer side is never upscaled — `targetWidth`/`targetHeight` just equal the original crop dimensions in that case.)

- [ ] **Step 2: Add validation and the signed-upload flow to `usePhotoUpload.js`**

Replace all of `frontend/src/hooks/usePhotoUpload.js`:

```javascript
import { useState, useCallback } from 'react';
import getCroppedImg from '../utils/cropImage';
import api from '../services/api';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function usePhotoUpload(initialUrl = '') {
    const [photoUrl, setPhotoUrl] = useState(initialUrl);
    const [rawImage, setRawImage] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [showCropper, setShowCropper] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        setUploadError(null);

        if (!ALLOWED_TYPES.includes(file.type)) {
            setUploadError('Formato de imagem não suportado. Use JPEG, PNG ou WEBP.');
            e.target.value = '';
            return;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            setUploadError('Arquivo muito grande. Tamanho máximo: 5MB.');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setRawImage(reader.result);
            setShowCropper(true);
        };
        reader.readAsDataURL(file);
    }

    const onCropComplete = useCallback((_, pixels) => {
        setCroppedAreaPixels(pixels);
    }, []);

    async function handleCropConfirm() {
        setUploading(true);
        setUploadError(null);
        try {
            const blob = await getCroppedImg(rawImage, croppedAreaPixels);
            const { data: sig } = await api.post('/pets/photo-upload-signature');

            const formData = new FormData();
            formData.append('file', blob, 'photo.jpg');
            formData.append('api_key', sig.apiKey);
            formData.append('timestamp', sig.timestamp);
            formData.append('signature', sig.signature);
            formData.append('upload_preset', sig.uploadPreset);

            const res = await fetch(
                `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
                { method: 'POST', body: formData },
            );
            const data = await res.json();
            if (!data.secure_url) {
                throw new Error('Cloudinary upload did not return a secure_url');
            }
            setPhotoUrl(data.secure_url);
            setShowCropper(false);
        } catch {
            setUploadError('Erro ao fazer upload da foto.');
        } finally {
            setUploading(false);
        }
    }

    function cancelCrop() {
        setShowCropper(false);
    }

    return {
        photoUrl,
        setPhotoUrl,
        showCropper,
        uploading,
        uploadError,
        rawImage,
        crop,
        setCrop,
        zoom,
        setZoom,
        handleFileChange,
        onCropComplete,
        handleCropConfirm,
        cancelCrop,
    };
}
```

- [ ] **Step 3: Sanity-check the frontend build**

Run: `cd frontend && npm run build`

Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/usePhotoUpload.js frontend/src/utils/cropImage.js
git commit -m "feat: validate/resize photos client-side and use signed Cloudinary uploads"
```

---

### Task 4: Frontend — optimized delivery + manual smoke check

**Files:**
- Create: `frontend/src/utils/cloudinaryUrl.js`
- Modify: `frontend/src/pages/Dashboard.jsx:9-15` (the `PetAvatar` component)
- Modify: `frontend/src/pages/EditPet.jsx:117`
- Modify: `frontend/src/pages/NewPet.jsx:108`
- Modify: `frontend/src/pages/ScanPage.jsx:56-57`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (this task only touches display/rendering, not the upload path) — but relies on Task 1-3 being complete so there's a real signed-upload flow to smoke-test end to end.
- Produces: `cloudinaryUrl(url: string, options?: { width?: number }): string` — a pure function, no side effects, safe to call with `null`/`undefined`/a non-Cloudinary URL (returns it unchanged in those cases).

- [ ] **Step 1: Create the URL-transformation helper**

Create `frontend/src/utils/cloudinaryUrl.js`:

```javascript
export function cloudinaryUrl(url, { width } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const transform = width ? `f_auto,q_auto,w_${width}` : 'f_auto,q_auto';
  return url.replace('/upload/', `/upload/${transform}/`);
}
```

- [ ] **Step 2: Apply it in `Dashboard.jsx`**

In `frontend/src/pages/Dashboard.jsx`, add the import at the top (alongside the other imports):

```jsx
import { cloudinaryUrl } from '../utils/cloudinaryUrl';
```

Change the `PetAvatar` component from:

```jsx
function PetAvatar({ pet }) {
  if (pet.photoUrl) {
    return <img src={pet.photoUrl} alt={pet.name} style={styles.petPhoto} />;
  }
  const emoji = pet.species === 'Cachorro' ? '🐶' : pet.species === 'Gato' ? '🐱' : '🐾';
  return <div style={styles.petPhotoEmoji}>{emoji}</div>;
}
```

to:

```jsx
function PetAvatar({ pet }) {
  if (pet.photoUrl) {
    return <img src={cloudinaryUrl(pet.photoUrl, { width: 200 })} alt={pet.name} style={styles.petPhoto} />;
  }
  const emoji = pet.species === 'Cachorro' ? '🐶' : pet.species === 'Gato' ? '🐱' : '🐾';
  return <div style={styles.petPhotoEmoji}>{emoji}</div>;
}
```

- [ ] **Step 3: Apply it in `EditPet.jsx`**

Add the import: `import { cloudinaryUrl } from '../utils/cloudinaryUrl';`

Change:

```jsx
              {photoUrl ? <img src={photoUrl} alt="Pet" style={styles.avatar} /> : <div style={styles.avatarPlaceholder}>🐾</div>}
```

to:

```jsx
              {photoUrl ? <img src={cloudinaryUrl(photoUrl, { width: 200 })} alt="Pet" style={styles.avatar} /> : <div style={styles.avatarPlaceholder}>🐾</div>}
```

- [ ] **Step 4: Apply it in `NewPet.jsx`**

Add the import: `import { cloudinaryUrl } from '../utils/cloudinaryUrl';`

Change:

```jsx
              {photoUrl ? <img src={photoUrl} alt="Preview" style={styles.avatar} /> : <div style={styles.avatarPlaceholder}>🐾</div>}
```

to:

```jsx
              {photoUrl ? <img src={cloudinaryUrl(photoUrl, { width: 200 })} alt="Preview" style={styles.avatar} /> : <div style={styles.avatarPlaceholder}>🐾</div>}
```

- [ ] **Step 5: Apply it in `ScanPage.jsx`**

Add the import: `import { cloudinaryUrl } from '../utils/cloudinaryUrl';`

Change:

```jsx
              <img src={pet.photoUrl} alt={pet.name} style={styles.petPhoto} />
```

to:

```jsx
              <img src={cloudinaryUrl(pet.photoUrl, { width: 600 })} alt={pet.name} style={styles.petPhoto} />
```

- [ ] **Step 6: Sanity-check the frontend build**

Run: `cd frontend && npm run build`

Expected: build completes with no errors.

- [ ] **Step 7: Flip the Cloudinary preset to signed**

This is a manual step in the Cloudinary web dashboard, not automatable:

1. Log in at https://cloudinary.com/console with the account that owns cloud `dan2bsmlk`.
2. Go to Settings (gear icon) → Upload tab → scroll to "Upload presets".
3. Find `tagreativa_pictures`, click it to edit.
4. Change "Signing Mode" from "Unsigned" to "Signed".
5. Save.

Report in the task report that this step was completed (or, if you do not have access to perform it yourself, say so explicitly — do not assume it happened).

- [ ] **Step 8: Manual smoke check**

With the backend running (`npm run start:dev`, real `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` in `.env`) and the frontend dev server up (`cd frontend && npm run dev`), and the preset flipped to signed (Step 7):

1. Log in, go to "Vincular Nova Tag" (`NewPet.jsx`), select a real photo, crop it, confirm — verify the upload succeeds and a photo preview appears. This proves the signed-upload round trip works end to end, not just that the signature endpoint returns *a* signature.
2. Check the uploaded photo's actual pixel dimensions (open the `secure_url` directly in a browser tab, or check via the Cloudinary Media Library) — confirm the longer side is ≤800px, proving the client-side resize took effect.
3. Go to the Dashboard and to the pet's edit page — open browser devtools, inspect the `<img>` element's `src` — confirm it contains `f_auto,q_auto,w_200` (or `w_600` on the scan page) inserted after `/upload/`, and that the image actually loads (not a broken image icon).
4. Try uploading a file larger than 5MB, and try uploading a non-image file (rename a `.txt` file to have an image-like name if needed, or pick any non-image file the OS file picker allows) — confirm both are rejected with the existing error message UI, and that no network request to Cloudinary fires for either (check the browser Network tab).
5. This is the step that actually proves the security fix took effect: attempt an unsigned upload directly (e.g. via `curl` with only `upload_preset` and `file`, no `signature`/`timestamp`/`api_key`) against `https://api.cloudinary.com/v1_1/dan2bsmlk/image/upload` — confirm Cloudinary rejects it now that the preset is signed. Example:
   ```bash
   curl -X POST https://api.cloudinary.com/v1_1/dan2bsmlk/image/upload \
     -F "upload_preset=tagreativa_pictures" \
     -F "file=@/path/to/any/local/image.jpg"
   ```
   Expected: an error response from Cloudinary (not a successful upload) — if this still succeeds, the preset was not actually flipped to signed, or the flip didn't take effect, and Step 7 needs to be redone/re-verified before this task can be considered complete.

Report the actual result of each of these 5 checks in the task report — this is real end-to-end verification, not optional.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/cloudinaryUrl.js frontend/src/pages/Dashboard.jsx frontend/src/pages/EditPet.jsx frontend/src/pages/NewPet.jsx frontend/src/pages/ScanPage.jsx
git commit -m "feat: serve pet photos through Cloudinary's optimized delivery URLs"
```
