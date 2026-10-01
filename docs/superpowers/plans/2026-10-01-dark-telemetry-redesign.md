# Dark Telemetry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the TagReativa frontend a dark telemetry identity with strong animation, shared UI primitives and no emojis, without changing behaviour.

**Architecture:** CSS custom properties in `tokens.css` feed CSS Modules owned by small components in `components/ui/`. Pages keep their state and handlers and swap inline `styles` objects for those components. `motion` drives route, list, layout and modal animation; continuous loops are plain CSS.

**Tech Stack:** React 19, Vite 8, react-router-dom 7, CSS Modules, `motion`, `@fontsource-variable/archivo`, `@fontsource-variable/jetbrains-mono`.

**Spec:** `docs/superpowers/specs/2026-10-01-dark-telemetry-redesign-design.md`

## Global Constraints

- Work only inside `frontend/`. Backend, hooks, `services/api.js`, utils, route paths and the Telegram gate logic stay untouched.
- Colour values come only from tokens: `--bg #0B0F0E`, `--surface #121816`, `--surface-raised #18201D`, `--line #24302B`, `--line-strong #364640`, `--text #E6EFEA`, `--text-muted #8FA39A`, `--signal #3DDC84`, `--signal-ink #04140B`, `--alert #FF4D4D`, `--warn #F2B84B`. No hex literals in components or pages.
- Radius 6px (2px for chips), 1px borders, no blur, no drop shadow, no gradient fills.
- Fonts: Archivo variable (display and UI), JetBrains Mono variable (data), self-hosted.
- Inputs 16px. Body at least 15px, at least 16px on `ScanPage`. Touch targets at least 44px.
- Animate only `transform` and `opacity`, except height reveals of inline sections.
- `MotionConfig reducedMotion="user"`; CSS loops off under `prefers-reduced-motion: reduce`.
- No emoji anywhere in `frontend/src`.
- User-facing text stays as is. Only change: login tagline becomes "Identificação e resgate por QR".
- Every WCAG AA text pair holds (4.5:1).
- The frontend has no test suite. Each task is verified with `npm run lint` and `npm run build` in `frontend/`, and the final task adds browser checks.
- Commits: conventional prefix, no co-author or generated-with trailers.

## File Structure

```
frontend/src/
  styles/tokens.css, global.css
  components/ui/  Backdrop, Page, PageHeader, Panel, Button, Field, Notice,
                  Icon, StatusBadge, PetAvatar, Modal, ScanLoader, Counter
                  (each .jsx with a sibling .module.css where styled)
  components/AuthLayout.jsx (+ .module.css)
  components/PhotoPicker.jsx (+ .module.css)
  components/ConfirmModal.jsx, QrModal.jsx (rewritten on Modal)
  pages/*.jsx (+ a .module.css only where a page has layout of its own)
```

Removed: `src/index.css`, `src/App.css`, `src/components/PageContainer.jsx`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`.

---

### Task 1: Foundation

**Files:**
- Modify: `frontend/package.json`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/global.css`, every file under `frontend/src/components/ui/`
- Delete: `frontend/src/index.css`, `frontend/src/App.css`, the three template assets

**Interfaces (produced, used by every later task):**
- `Icon({ name, size = 20, title })` with names `dog cat paw shield alert check qr signal arrow-left plus logo`.
- `Button({ variant = 'primary' | 'secondary' | 'ghost' | 'danger', size = 'md' | 'sm', block, to, href, icon, ...rest })`. Renders a router `Link` when `to` is set, an `a` when `href` is set, a `button` otherwise.
- `Field({ label, as = 'input' | 'select' | 'textarea', prefix, hint, ...inputProps })`. Generates the id that ties label and control.
- `Panel({ as, tone = 'default' | 'alert' | 'signal', brackets = true, className, children, ...motionProps })`.
- `Notice({ tone = 'info' | 'warn' | 'error' | 'success', children })`. `error` renders with `role="alert"`.
- `StatusBadge({ lost, label })`.
- `PetAvatar({ pet, size = 56, width = 200, ping = false })`.
- `Modal({ open, onClose, labelledBy, children })`.
- `ScanLoader({ label })`.
- `Counter({ value })`.
- `Page({ width = 'narrow' | 'wide', center, children })`: route transition wrapper.
- `PageHeader({ title, eyebrow, backLabel, onBack })`.
- `Backdrop()`.

- [ ] Step 1: `npm install motion @fontsource-variable/archivo @fontsource-variable/jetbrains-mono` in `frontend/`; confirm the Archivo package ships a width-axis stylesheet and import the right entry.
- [ ] Step 2: Write `tokens.css` and `global.css` (reset, base type, `:focus-visible` ring, reduced-motion block). Import both from `main.jsx`; drop the `index.css` import.
- [ ] Step 3: Write the `ui/` components and their modules.
- [ ] Step 4: Rework `App.jsx`: `MotionConfig`, one `Backdrop`, `AnimatePresence mode="wait"` around `Routes` keyed on `location.pathname`. `TelegramGate` and `PrivateRoute` logic unchanged.
- [ ] Step 5: Set `theme-color` and background in `index.html`; delete the leftover files.
- [ ] Step 6: `npm run lint && npm run build`. Expected: both pass (pages still use `PageContainer` until their task, so keep it until the last page is migrated).
- [ ] Step 7: Commit `feat: add dark telemetry tokens, ui primitives and motion shell`.

### Task 2: Auth screens

**Files:**
- Create: `frontend/src/components/AuthLayout.jsx`, `AuthLayout.module.css`
- Modify: `frontend/src/pages/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`

**Interfaces:**
- Consumes: `Page`, `Panel`, `Field`, `Button`, `Notice`, `Icon`.
- Produces: `AuthLayout({ tagline, children, footer })`.

- [ ] Step 1: Write `AuthLayout` (logo mark, expanded wordmark, mono tagline, panel, footer links).
- [ ] Step 2: Migrate the four pages. Keep every handler and API call byte-for-byte. Placeholders become labels. Login 2FA step swaps with `AnimatePresence`. Login tagline: "Identificação e resgate por QR".
- [ ] Step 3: `npm run lint && npm run build`.
- [ ] Step 4: Commit `feat: redesign auth screens`.

### Task 3: Dashboard and modals

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`, `frontend/src/components/ConfirmModal.jsx`, `QrModal.jsx`
- Create: `frontend/src/pages/Dashboard.module.css`, `frontend/src/components/ModalParts.module.css`

**Interfaces:**
- Consumes: `Modal`, `Panel`, `PetAvatar`, `StatusBadge`, `Counter`, `Button`, `Notice`, `Icon`.
- Produces: `ConfirmModal({ confirmModal, onConfirm, onClose, title, children, confirmLabel, tone })`. With only the first three props it behaves as today (status toggle text). `QrModal` props unchanged.

- [ ] Step 1: Rewrite both modals on `Modal`.
- [ ] Step 2: Migrate `Dashboard`: staggered `motion` list with `layout`, status toggle, animated count, fixed bottom action, empty state with icon. Replace `alert('Erro ao atualizar status.')` with a `Notice` driven by local state.
- [ ] Step 3: `npm run lint && npm run build`.
- [ ] Step 4: Commit `feat: redesign dashboard and modals`.

### Task 4: Scan page

**Files:**
- Modify: `frontend/src/pages/ScanPage.jsx`
- Create: `frontend/src/pages/ScanPage.module.css`

**Interfaces:** Consumes `Page`, `Panel`, `PetAvatar`, `ScanLoader`, `Button`, `Notice`, `Icon`.

- [ ] Step 1: Migrate the four states (loading, error, expired, result). `useCountdown`, `formatSeconds` and `SESSION_SECONDS` stay as they are. Status band, viewfinder photo, largest-text pet name, full-width WhatsApp button, countdown turning `--warn` under 60 seconds, sequenced reveal.
- [ ] Step 2: `npm run lint && npm run build`.
- [ ] Step 3: Commit `feat: redesign scan page`.

### Task 5: Pet forms and profile

**Files:**
- Create: `frontend/src/components/PhotoPicker.jsx`, `PhotoPicker.module.css`
- Modify: `frontend/src/pages/NewPet.jsx`, `EditPet.jsx`, `Profile.jsx`
- Create: `frontend/src/pages/Profile.module.css`

**Interfaces:**
- Consumes: `Page`, `PageHeader`, `Panel`, `Field`, `Button`, `Notice`, `Icon`, `ConfirmModal`.
- Produces: `PhotoPicker({ upload, label, alt, confirmLabel })` where `upload` is the object returned by `usePhotoUpload()`.

- [ ] Step 1: Write `PhotoPicker` (avatar or paw icon, file input, crop overlay with `Cropper`, slider, buttons).
- [ ] Step 2: Migrate `NewPet` and `EditPet`. `EditPet` delete confirmation moves from `window.confirm` to `ConfirmModal` with `tone="danger"`; the delete request itself is unchanged.
- [ ] Step 3: Migrate `Profile` into three panels (account, security, danger zone) with animated inline sections.
- [ ] Step 4: `npm run lint && npm run build`.
- [ ] Step 5: Commit `feat: redesign pet forms and profile`.

### Task 6: Telegram and email screens, cleanup

**Files:**
- Modify: `frontend/src/pages/TelegramSetup.jsx`, `EmailAlertsInfo.jsx`
- Create: `frontend/src/pages/Steps.module.css`
- Delete: `frontend/src/components/PageContainer.jsx`

- [ ] Step 1: Migrate both pages. Polling, popup handling and navigation logic unchanged. Waiting state shows `ScanLoader`.
- [ ] Step 2: Delete `PageContainer.jsx` once no import remains.
- [ ] Step 3: `npm run lint && npm run build`.
- [ ] Step 4: Commit `feat: redesign telegram and email screens`.

### Task 7: Verification

- [ ] Step 1: Emoji grep over `frontend/src` returns nothing.
- [ ] Step 2: `grep -rn "const styles = {" frontend/src` and `grep -rn "leafGrad" frontend/src` return nothing.
- [ ] Step 3: `grep -rnE "#[0-9A-Fa-f]{3,8}\b" frontend/src --include=*.jsx` returns nothing.
- [ ] Step 4: Contrast check of the token pairs against 4.5:1.
- [ ] Step 5: Run the dev server and open each screen at 375px and desktop width; exercise login, register, status toggle, QR modal, new pet, edit pet, profile, scan in lost and safe states; then repeat with reduced motion emulated.
- [ ] Step 6: Fix what the pass finds, rerun lint and build, commit.
