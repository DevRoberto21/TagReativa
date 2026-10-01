# Dark Telemetry Redesign — Design Spec

Date: 2026-10-01
Status: Approved by user, ready for implementation

## Context

The frontend (React 19 + Vite, 11 screens, about 2000 lines) styles
everything with per-page inline `styles` objects. Each page repeats the same
leaf-and-gradient SVG background, the same glass card, the system font and
the same green. There are no shared tokens, no hover or focus states, no
media queries and no animation. `ScanPage` references a `spin` keyframe that
is never defined, so its spinner does not move. Emojis stand in for icons in
five files. The result reads as a generic template.

Decision: a dark "telemetry" identity, strong animation through the `motion`
library, and a small shared UI layer built on CSS tokens and CSS Modules.

## Scope

In scope:
- New visual system (colour, type, shape, background, icons) on all 11
  screens and both modals.
- Shared tokens, global stylesheet and `components/ui/` primitives.
- Animation: route transitions, list stagger, layout animation, modals,
  status pulse, counters, scan loader.
- Remove every emoji from the frontend and replace it with an SVG icon.
- Replace the two native dialogs (`alert` in `Dashboard`, `window.confirm`
  in `EditPet`) with themed UI, since native dialogs break the theme.
- Delete the unused Vite template leftovers: `src/App.css`,
  `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`.

Out of scope:
- Backend, including the emojis in Telegram and WhatsApp message text.
- Hooks (`useScan`, `useQrModal`, `usePhotoUpload`), `services/api.js`,
  utils, routes and the Telegram gate logic. Behaviour stays identical.
- Light theme and `prefers-color-scheme` switching.
- Copy rewrite. Text stays as is, minus emojis, with one exception: the
  login tagline "Identificação e Proteção Biofílica" becomes
  "Identificação e resgate por QR".

## Visual system

### Colour tokens (`src/styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0F0E` | Page base |
| `--surface` | `#121816` | Panels |
| `--surface-raised` | `#18201D` | Inputs, hover, modal |
| `--line` | `#24302B` | Borders, dividers |
| `--line-strong` | `#364640` | Focused or hovered borders |
| `--text` | `#E6EFEA` | Primary text |
| `--text-muted` | `#8FA39A` | Secondary text, labels |
| `--signal` | `#3DDC84` | Safe status, primary action, focus ring |
| `--signal-ink` | `#04140B` | Text on a signal fill |
| `--alert` | `#FF4D4D` | Lost status, destructive action, errors |
| `--warn` | `#F2B84B` | Notices only |

Every text and background pair must reach WCAG AA (4.5:1). `--text-muted`
on `--bg` and on `--surface` is the pair most at risk and gets checked
during verification.

### Type

- Display and UI: Archivo variable, with the width axis expanded for page
  titles and the pet name.
- Data: JetBrains Mono variable, for labels, status, counters, the scan
  countdown and codes.
- Both self-hosted through `@fontsource-variable/archivo` and
  `@fontsource-variable/jetbrains-mono`, so no third-party font request.
- Body text is at least 15px in the app and at least 16px on `ScanPage`.
  Inputs use 16px to stop iOS from zooming on focus.

### Shape and surface

- Radius 6px (`--radius`), 2px for small chips. 1px borders.
- No blur, no drop shadow, no gradient fills.
- Signature motif: "viewfinder" corner brackets on panels and on the pet
  photo frame, drawn with CSS, not images.
- Labels are uppercase mono with wide tracking.

### Background

One `Backdrop` component, mounted once in `App.jsx` outside the route
transition so it does not restart on navigation: a dot grid plus a slow
radar sweep. It replaces the SVG block duplicated across pages. It is
`aria-hidden`, ignores pointer events, and stops moving under reduced
motion.

### Icons

`components/ui/Icon.jsx` exports one `Icon` component with a `name` prop
and a single stroke style (1.5px, round caps, `currentColor`). Names:
`dog`, `cat`, `paw`, `shield`, `alert`, `check`, `qr`, `signal`, `arrow-left`,
`plus`, `logo`. Decorative icons are `aria-hidden`; meaningful ones take a
`title`.

Emoji replacements:

| Location | Before | After |
|---|---|---|
| `Dashboard` avatar fallback | dog / cat / paw emoji | `Icon` `dog` / `cat` / `paw` |
| `ScanPage` avatar fallback | same | same, through shared `PetAvatar` |
| `ScanPage` lost title | warning emoji | `Icon` `alert` |
| `ScanPage` safe title | shield emoji | `Icon` `shield` |
| `EmailAlertsInfo` title | check emoji | `Icon` `check` |
| `NewPet`, `EditPet` photo placeholder | paw emoji | `Icon` `paw` |

## Structure

```
src/
  styles/
    tokens.css        colour, type, radius, spacing, duration, easing
    global.css        reset, base type, focus ring, font imports
  components/
    ui/
      Backdrop.jsx        grid + radar sweep
      Page.jsx            page transition wrapper + width container
      PageHeader.jsx      back action + title
      Panel.jsx           surface with corner brackets
      Button.jsx          variants: primary, secondary, ghost, danger
      Field.jsx           label + input / select / textarea
      Notice.jsx          tones: info, warn, error, success
      Icon.jsx
      StatusBadge.jsx     dot or radar ping + mono label
      PetAvatar.jsx       photo or species icon, in a viewfinder frame
      Modal.jsx           overlay, focus handling, Escape, spring motion
      ScanLoader.jsx      sweep animation for loading states
      Counter.jsx         animates a number up to its value
    AuthLayout.jsx        logo + panel, shared by the four auth screens
    PhotoPicker.jsx       avatar + file input + crop overlay
    ConfirmModal.jsx      now generic: title, body, confirm label, tone
    QrModal.jsx
```

Each component that needs styles has a sibling `*.module.css`. `index.css`
and `PageContainer.jsx` are removed; `global.css` and `Page` replace them.

Notes on specific units:

- `Modal` owns overlay click, Escape to close, initial focus and
  `role="dialog"` with `aria-modal`. `ConfirmModal` and `QrModal` only
  supply content. Their current prop names stay, so `Dashboard` call sites
  do not change shape; `ConfirmModal` gains optional `title`, `children`,
  `confirmLabel` and `tone` so `EditPet` can reuse it for delete.
- `PhotoPicker` receives the object returned by `usePhotoUpload` and
  renders the avatar, the file input and the crop overlay. `NewPet` and
  `EditPet` currently duplicate that markup; the hook itself is untouched.
- `PetAvatar` replaces the two copies of the species-to-emoji logic.
- `Button` renders a `button`, a router `Link` or an `a` depending on the
  props, so links and buttons share one look.

## Animation

Library: `motion` (imported from `motion/react`). `App.jsx` wraps the tree
in `MotionConfig reducedMotion="user"`, so transforms are dropped for users
who ask for reduced motion. CSS-only loops (radar sweep, ping) are disabled
in a `prefers-reduced-motion: reduce` media query.

| Where | Motion |
|---|---|
| Route change | `AnimatePresence mode="wait"` keyed on pathname; pages fade and rise 8px in, fade out |
| Panels and form fields | Staggered fade and rise on mount |
| Dashboard pet cards | Stagger in; `layout` animation when status changes; border and badge colour cross-fade |
| Lost status | Continuous radar ping around the status dot and the scan avatar |
| Scan count | `Counter` runs from 0 to the value once loaded |
| Buttons | Scale 0.97 on press, border and fill transition on hover |
| Modals | Overlay fade, panel spring scale from 0.96 |
| Scan loading | `ScanLoader` sweep in place of the broken spinner |
| Scan result | Status band slides down, pet name and photo reveal in sequence, WhatsApp button last |
| Inline form sections (2FA, delete account) | Height and opacity with `AnimatePresence` |
| Scan countdown | Colour shifts to `--warn` in the final 60 seconds |

Durations: 120ms for press and hover, 240ms for entrances, springs for
modals and layout. Only `transform` and `opacity` are animated, apart from
the height reveal of inline sections.

## Screens

- **Auth (Login, Register, ForgotPassword, ResetPassword):** `AuthLayout`
  with the logo mark, the wordmark in expanded Archivo and a mono tagline.
  One panel, fields with visible labels instead of placeholder-only inputs.
  The login 2FA step swaps in with a horizontal slide.
- **Dashboard:** header with wordmark, greeting and actions. Mono section
  label plus title. Each pet is a panel with avatar, name, species, status
  badge and animated scan count; the status toggle is the widest control
  and turns to an alert fill when the pet is lost. "Vincular Nova Tag"
  stays a fixed bottom action. Empty state gets an icon and the existing
  text. A failed status update shows a `Notice` instead of `alert()`.
- **NewPet, EditPet:** `PageHeader`, `PhotoPicker`, then the form in a
  panel. Delete in `EditPet` asks through `ConfirmModal` with the danger
  tone instead of `window.confirm`.
- **Profile:** three stacked panels: account data, security (Telegram
  status and 2FA), danger zone (delete account). Same fields and flows.
- **TelegramSetup, EmailAlertsInfo:** `PageHeader` plus one panel with
  numbered steps in mono. The waiting state shows `ScanLoader`.
- **ScanPage:** status band across the top of the panel (signal or alert),
  large photo in a viewfinder frame, pet name as the largest text on the
  page, species in mono, notes block, then the action block. The WhatsApp
  link is a full-width signal-filled button and the largest touch target.
  Loading, error and expired states use the same panel and tokens.

## Accessibility

- Visible focus ring (`--signal`, 2px, offset 2px) on every interactive
  element through `:focus-visible`.
- Form fields get real `label` elements tied by `htmlFor` / `id`.
- Touch targets at least 44px high.
- Status is never colour-only: badge text states "SEGURO" or "PERDIDO".
- Modals trap initial focus, close on Escape and restore focus on close.

## Error handling

No new data flows. Existing error strings keep their wording and now
render through `Notice` with `role="alert"`. The scan error and expired
states keep their current conditions.

## Testing and verification

The frontend has no test suite and this change does not add one; it is a
presentation change with unchanged behaviour. Verification:

1. `npm run lint` and `npm run build` in `frontend/` pass.
2. No emoji remains: a grep over `frontend/src` for the emoji ranges
   returns nothing.
3. No leftover inline `styles` objects or duplicated background SVG in
   `src/pages`.
4. Each screen opened in the browser at 375px and at desktop width, with
   the main flows exercised: login, register, dashboard status toggle, QR
   modal with both downloads, new pet, edit pet, profile, scan page in
   lost and safe states.
5. Reduced motion emulated in the browser: continuous animations stop and
   the app stays usable.

## Delivery

Branch `feat/dark-telemetry-redesign`. Order: foundation (deps, tokens,
global styles, UI primitives, `App.jsx` shell), auth screens, dashboard and
modals, scan page, pet forms and profile, Telegram and email screens,
cleanup and verification. Each step leaves the app building.
