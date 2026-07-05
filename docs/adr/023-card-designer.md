---
status: accepted
date: 2026-06-08
---

# ADR-023: Card Designer for Custom Riftbound Cards

## Context and Problem Statement

OpenRift already has a card-shaped editing surface: the `/contribute` page (`apps/web/src/routes/_app/contribute.tsx` + `contribute.lazy.tsx`, form in `apps/web/src/components/contribute/contribute-form.tsx`) lets a contributor type a card's data and watch it render live in `CardPlaceholderImage` (`apps/web/src/components/cards/card-placeholder-image.tsx`). That preview is a DOM-layered, container-query-scaled card template: a domain-gradient base, an energy circle, a might shield, type / tag badges, a name bar, a text block, and a footer with rarity, code, and artist. The whole point of `/contribute`, though, is to open a GitHub pull request against the data repo; the preview is a means to an end and the background is always an auto-generated domain gradient.

We want a **Card Designer**: a fun, standalone tool that reuses the same editing experience and the same card template, but lets the user **pick a background image** for the card and **take the finished card with them** (download a PNG, or copy it to the clipboard). It is creative, not contributory: the output is an image of an invented card, not a PR. There is no "correct" data to validate against, no set / printing metadata, and nothing is submitted anywhere.

This is a tool surface, closest in spirit to **ADR-021 (Match Tracker)**: a standalone, client-only route with no server involvement. The user uploads an image, it stays in the browser as a data URL, the card renders, and the existing client-side rasterizer (`html2canvas-pro`, already used by the deck proxy export) turns the preview into a downloadable / copyable image. No account, no upload endpoint, no persistence. This ADR decides how the designer reuses the existing template and inputs, how the background image is placed and adjusted, how the export works, and what ships in v1.

## Decision Drivers

- **It is a creative toy, so it must be instant and zero-friction.** No login, no save, no submit. You open it, design a card, and download it. Anything that adds an account or a round-trip kills the appeal.
- **It must not require new backend infrastructure.** OpenRift has no user-facing upload endpoint today (image upload is admin-only) and runs on local disk plus Postgres. A client-only feature that holds the image as a data URL needs none of that, and a data URL is same-origin so it never taints the export canvas.
- **It should reuse, not fork.** `/contribute` already has the inputs (domain pickers, enum selects, the `CardTextInput` rich editor) and `CardPlaceholderImage` already _is_ the card template. The designer should extend the one template, not maintain a second.
- **What you see must be what you get.** The export has to match the on-screen preview exactly, including the chosen background, its framing, and the attribution line.
- **It has to obey the repo's conventions for client state and re-renders** (Zustand, per-component selector subscriptions, React Compiler, the typography scale) so it is not a special case. Drag-to-reposition fires many updates per second; the preview must update without re-rendering the whole form on every pointer move.
- **Stay lean for v1.** Ship upload-from-device, full-card editing of everything the template shows, reposition + zoom, and the two exports. Defer catalog-art / URL sources, saving, sharing, and foil effects.

## Considered Options

**Where the background image comes from**

- **Upload from device, held client-side as a data URL (chosen).** `FileReader` reads the file to a data URL kept in the store; it never leaves the browser. No upload endpoint, no storage, no privacy-policy change, and (because it is same-origin) no canvas taint on export.
- Server upload + rehost (like admin card images). Rejected: introduces the user-facing upload infrastructure that does not exist today, plus storage, moderation, and a privacy surface, for a feature whose whole appeal is being client-only.
- Pick from existing catalog art, or paste an image URL. Rejected for v1 (additive, see Out of Scope): catalog art is a clean follow-up; an external URL reintroduces cross-origin taint on the export canvas.

**The card template**

- **Extend `CardPlaceholderImage` with an optional background image + scrim (chosen).** Add inert optional props so existing call sites (catalog thumbnails, the `/contribute` preview) are unaffected, and the designer, contribute, and catalog all keep sharing one template.
- Fork a dedicated `DesignerCard` component. Rejected: two card templates to keep in sync forever; every future tweak to the card look would have to be made twice.
- Render the card to a `<canvas>` / SVG (satori) from scratch. Rejected: reimplements a template that already exists as DOM, and satori is not a dependency.

**How the background image sits on the card**

- **Full-bleed behind everything, with a darkening scrim behind the name bar and text (chosen).** The image fills the whole card; a scrim keeps the name and text legible over any photo. (User-selected.)
- Full-bleed with no scrim. Rejected: text is unreadable over bright / busy images.
- Art window in the top ~55% only, gradient frame below. Rejected: the user chose full-bleed.

**How much control over the image**

- **Cover-fill baseline plus zoom and drag-to-reposition (chosen).** The image defaults to covering the card; a zoom slider and pointer-drag let the user frame the art, clamped so the image always covers the card (no empty edges). (User-selected.)
- Cover-fill only, or a contain/cover toggle. Rejected: the user wants to frame the art.

**Export**

- **`html2canvas-pro` rasterizing an off-screen, fixed-size clone of the preview, to a PNG blob, offered as both download and clipboard copy (chosen).** Reuses the proven path from `apps/web/src/components/deck/proxy-export-dialog.tsx`. The off-screen fixed width makes the template's container-query (`cqw`) units resolve deterministically.
- Server-side render. Rejected: no backend, defeats the client-only design.
- SVG / satori render. Rejected: the template is DOM, not a dependency we have.

**State management**

- **A single non-persisted Zustand store with per-component selector subscriptions (chosen).** The preview subscribes to the image-transform slice, so drag-to-reposition updates the preview without re-running the form's render. Matches ADR-006 and the repo's `.map()`-closure guidance.
- `useState` in the page component (as `/contribute` does). Rejected: every pointer-move during a drag would re-render the whole editor; and the store gives a clean, unit-testable seam for the transform-clamp and field logic.
- Persisted store (`localStorage`), like the Match Tracker. Rejected: a background image data URL is far too large for the ~5 MB `localStorage` budget, and the feature is ephemeral by decision. (Persisting only the text fields is a possible follow-up.)

**Attribution**

- **Append `openrift.app` to the existing artist footer slot (chosen).** The rendered card's artist line shows `<what the user typed> · openrift.app`, or just `openrift.app` when the field is empty. No separate watermark element. (User-selected.)
- A separate corner watermark overlay, or a "fan-made" label. Rejected: the user chose the artist-slot approach; it reuses a slot the template already renders.
- No attribution. Rejected: the user wants the export to carry `openrift.app`.

## Decision Outcome

Chosen: **a standalone, client-only `/card-designer` route that reuses the `/contribute` inputs and the `CardPlaceholderImage` template, lets the user upload a background image (held in-browser as a data URL) and frame it with zoom + drag, edits every field the card visibly shows, renders the attribution `openrift.app` into the artist footer slot, and exports the live preview as a PNG via `html2canvas-pro` for download or clipboard copy. No backend, no account, no persistence, no submission.**

### Behaviour

- **Editable fields = everything the template renders.** Exactly the prop surface of `CardPlaceholderImage`: name, domains, energy, might, power, might bonus, type, super-types, tags, rules text, effect text, flavor text, rarity, code, and artist. **No** catalog / printing metadata (set, language, year, markers, finish, art variant, signed) — those are not drawn on the card and are meaningless for an invented one.
- **Background image.** Upload from device (PNG / JPG / WebP / AVIF / GIF first frame). The file is read to a data URL and kept in the store; it is never uploaded. The image fills the whole card behind the overlays. A **zoom slider** (and optional wheel / pinch) plus **drag-to-reposition** frame it, clamped so it always covers the card. A "remove image" control clears it and the card falls back to the domain-gradient base.
- **Legibility scrim.** When a background image is set, a darkening scrim renders behind the name bar and the text block so they stay readable over any photo. With no image, the card looks exactly as it does in `/contribute` today.
- **Attribution.** The artist footer line renders `buildAttribution(artist)` — the user's artist text plus `· openrift.app`, or just `openrift.app` when empty. This shows in the preview and the export (WYSIWYG); the artist input itself holds only the raw text.
- **Export.** Two actions: **Download PNG** and **Copy to clipboard**. Both rasterize an off-screen, fixed-resolution clone of the current preview. Clipboard copy uses the async Clipboard API (`ClipboardItem`) and falls back to download where it is unsupported or denied.
- **No validation.** Every field is optional; any combination renders. There is nothing to submit, so there is no schema check (unlike `/contribute`).
- **Ephemeral.** Nothing is saved; reloading starts from a blank card. (This matches the chosen non-persisted store.)

### Card layout & the background image

`CardPlaceholderImage` keeps its current structure; the background sits **behind** all existing overlays and the overlays already carry their own backgrounds (energy circle on `bg-white/70`, might shield on `bg-black/70`, type / tag badges on a gradient or `bg-black/90`, the name bar on the domain gradient), so they stay legible over a photo without change. The only additions, all gated on a background image being present:

- A full-bleed image layer (`absolute inset-0`, `object-cover`) directly above the gradient base and below every overlay, with the zoom / pan transform applied.
- A **text scrim**: a bottom-anchored dark gradient covering roughly the lower 45% of the card (under the name bar, text block, and footer, over the image), so name / rules / effect / flavor / footer text reads against any background.
- The centered logo watermark and the `feTurbulence` noise overlay are **hidden** when an image is present — both exist to make the empty placeholder look intentional, and a real photo replaces that purpose (hiding the noise also sidesteps the one filter `html2canvas-pro` is least likely to rasterize faithfully).

With no background image, none of these render and the component is byte-for-byte the template used everywhere else.

### Consequences

- Good — pure client feature: no upload endpoint, no storage, no migrations, no repositories, no privacy-policy change. The data-URL image is same-origin, so the export canvas is never tainted.
- Good — one card template. The designer, `/contribute`, and the catalog grid all keep rendering through the same `CardPlaceholderImage`; the new props are inert when unused.
- Good — reuses the `/contribute` inputs and the `html2canvas-pro` export path, so little new surface is invented.
- Good — the Zustand + selector pattern keeps drag-to-reposition smooth (the preview updates without re-rendering the form), consistent with the repo's re-render conventions.
- Bad — `html2canvas-pro` does not perfectly rasterize every CSS feature; the template uses container-query units, CSS gradients, and `brightness-0 invert` icon filters. Mitigated by rendering an off-screen fixed-width clone (so `cqw` resolves), hiding the noise filter under an image, and a fidelity spike as the first build step (see Confirmation).
- Bad — large uploads are heavy in memory as data URLs. Mitigated by downscaling on load (cap the longest edge, e.g. ~2000 px) before storing.
- Neutral — ephemeral: a refresh loses the design. Acceptable for a toy; persisting the text fields (not the image) is an additive follow-up.

## Design Decisions

### Extending `CardPlaceholderImage`

Add optional, default-off props so no existing caller changes:

```ts
interface CardPlaceholderImageProps {
  // ...all existing props unchanged...
  backgroundImageUrl?: string; // data URL; when set, renders full-bleed + scrim
  backgroundTransform?: { scale: number; offsetX: number; offsetY: number };
}
```

When `backgroundImageUrl` is set: render the image layer with `transform: translate(offsetX%, offsetY%) scale(scale)` over `object-cover`, add the scrim, and hide the logo + noise as described above. When it is absent, every new branch is skipped. The designer always passes `artist={buildAttribution(rawArtist)}`; other callers keep passing the raw artist as before.

### Image handling (upload, downscale, transform)

- **Upload** lives in a small hook (e.g. `apps/web/src/hooks/use-image-upload.ts`): take a `File`, reject non-images, optionally downscale via an offscreen `<canvas>` so the longest edge is ≤ ~2000 px, and resolve a data URL. The hook owns the async / error paths; the store just receives the final data URL.
- **Transform** is `{ scale ≥ 1, offsetX, offsetY }` written to the store. Zoom is a slider; reposition is pointer-drag (pointer events, touch-friendly). A pure `clampTransform(transform, cardAspect)` helper keeps the image covering the card (no empty edge) and is unit-tested. This uses a plain 2-D `translate`/`scale` (not a 3-D transform), so the Firefox `overflow-hidden` + 3-D-transform caveat does not apply; the card wrapper is already `overflow-hidden`.

### Export: download PNG + copy to clipboard

A pure-ish export module (e.g. `apps/web/src/lib/card-export.ts` + a thin hook):

1. Render a hidden clone of the preview into an **off-screen container at a fixed width** (a `CARD_EXPORT_WIDTH` constant; recommend 1500 × 2100 px for a crisp 5:7 card) so all `cqw` units resolve against a known width. A pure `cardExportDimensions(width)` helper returns the matching height from the card aspect and is unit-tested.
2. Await `document.fonts.ready` (and image load) so text and the background are present before capture.
3. `html2canvas-pro` → canvas → `toBlob('image/png')`. **Download** triggers an `<a download>`; **copy** writes `new ClipboardItem({ 'image/png': blob })` via `navigator.clipboard.write`, falling back to download when the API is unavailable or the write is rejected.

The proven precedent is `apps/web/src/components/deck/proxy-export-dialog.tsx`; reuse its capture approach.

### Attribution via the artist slot

A pure `buildAttribution(artist?: string): string` in `apps/web/src/lib/card-export.ts` (or a small `card-designer` util): returns `` `${artist.trim()} · openrift.app` `` when there is text, otherwise `openrift.app`. The footer meta line in `CardPlaceholderImage` already renders whenever `publicCode || artist` is truthy, so attribution is always shown. Unit-tested for the empty, whitespace-only, and populated cases.

### Store shape

A single **non-persisted** Zustand store, `apps/web/src/stores/card-designer-store.ts`:

```ts
interface DesignerCard {
  name: string;
  domains: Domain[];
  energy: number | null;
  might: number | null;
  power: number | null;
  mightBonus: number | null;
  type: string; // card-type slug, "" when unset
  superTypes: string[];
  tags: string[];
  rulesText: string;
  effectText: string;
  flavorText: string;
  rarity: Rarity | null;
  publicCode: string; // the footer "code" line
  artist: string; // raw; openrift.app appended at render
}

interface BackgroundImage {
  dataUrl: string | null; // client-side only, never uploaded
  scale: number; // >= 1, cover baseline
  offsetX: number; // %, clamped so the image always covers
  offsetY: number;
}

interface CardDesignerState {
  card: DesignerCard;
  background: BackgroundImage;

  setCardField<K extends keyof DesignerCard>(key: K, value: DesignerCard[K]): void;
  toggleDomain(domain: Domain): void;
  addTag(tag: string): void;
  removeTag(tag: string): void;
  setImage(dataUrl: string): void; // resets transform to defaults
  clearImage(): void;
  setImageTransform(patch: Partial<Pick<BackgroundImage, "scale" | "offsetX" | "offsetY">>): void; // clamps
  reset(): void;
}
```

The transform-clamp logic lives in the pure helper called by `setImageTransform`, so it is tested without React.

### Re-render isolation

Per the repo's `.map()`-closure guidance: the editor's field inputs subscribe to their own slices, and the **preview** subscribes to `card` + `background` via selectors. A drag updating `background.offsetX/Y` re-renders only the preview, not the form. The page component closes only over stable refs. No `useMemo` / `useCallback` / `React.memo` (React Compiler).

### Route, navigation & hydration

Split route like `/contribute`:

- `apps/web/src/routes/_app/card-designer.tsx` — `createFileRoute`, `seoHead({ … noIndex: true })` (a tool, not indexable content).
- `apps/web/src/routes/_app/card-designer.lazy.tsx` — `createLazyFileRoute`, mounts the page.
- Components under `apps/web/src/components/card-designer/`: a page shell (editor pane + sticky preview), the form (reusing the `/contribute` domain pickers, enum selects, and `CardTextInput`), a background-image control (upload + zoom + drag), and export controls.
- **Navigation:** add a **"Card Designer"** entry alongside Contribute in the header navigation (`apps/web/src/components/layout/header.tsx`) with a lucide `*Icon` (e.g. `PaletteIcon` or `WandSparklesIcon`).
- **Hydration:** the store is non-persisted, so there is no `localStorage` SSR mismatch and the route can SSR the blank card like `/contribute` does (no `useHydrated` gate needed). `html2canvas-pro` is imported lazily on the export action (client-only), as the proxy export already does.

### Conventions to honour

- **React Compiler:** no `useMemo` / `useCallback` / `React.memo`.
- **Reuse, don't re-derive:** pull the domain / type / super-type / rarity selectors and `CardTextInput` from the existing `/contribute` form rather than rebuilding them; only the printing-tab metadata is dropped.
- **Icons:** lucide with the `Icon` suffix (`UploadIcon`, `DownloadIcon`, `CopyIcon`, `Trash2Icon`, a palette / wand icon for nav).
- **Styling & typography:** Tailwind + `cn()`, theme CSS variables, sizes only from `docs/typography.md`.
- **UI primitives:** BaseUI / shadcn `base-nova`, not Radix. Pass `items` to any `<Select.Root>`.
- **Tests (required):**
  - `card-designer-store.test.ts` with `createStoreResetter()` in `beforeEach`/`afterEach`: field set; domain toggle add/remove; tag add/remove; `setImage` resets the transform; `clearImage` nulls the image; `setImageTransform` clamps zoom (≥ 1) and offsets to keep cover; `reset`.
  - Pure helpers: `buildAttribution` (empty / whitespace / populated), `clampTransform` (boundaries), `cardExportDimensions` (aspect math).
  - `use-image-upload` happy path (file → data URL), non-image rejection, and downscale-threshold behavior.
- **Changelog:** the implementation PR adds a `feat:` entry to `apps/web/src/CHANGELOG.md` (e.g. "Design your own custom card with your own background image and download or copy it"). _This ADR commit is docs-only and gets no changelog entry._

## Out of Scope (explicit non-goals for v1)

- Other background sources: catalog card art, pasted image URLs, a bundled preset gallery. (Catalog art is the most natural follow-up; the upload path and template extension leave room for it.)
- Saving designs, accounts, cross-device sync, shareable links, or a public gallery — and therefore any content-moderation surface (nothing is uploaded or shared).
- Foil / finish / tilt effects on the designed card (deferred to a possible v2).
- Catalog / printing metadata fields (set, language, year, markers, finish, art variant, signed).
- Schema validation of the card (there is nothing to submit).
- Batch / multi-card export, custom frames or alternate templates, and text-styling controls beyond what the template already does.

Each is additive; the chosen store shape, the single shared template, and the route structure leave room for them without committing now.

## More Information

Relationship to other ADRs and existing code:

- **ADR-021 (Match Tracker)** is the structural sibling: a standalone, client-only, `noIndex` tool route backed by a Zustand store, with no server involvement. The Card Designer differs only in being non-persisted (the image data URL is too large to persist) and in producing an exportable artifact.
- **`/contribute`** is the editing precedent — the same `CardPlaceholderImage` template and the same field inputs, minus the printing metadata and the GitHub-PR submission.
- **`apps/web/src/components/deck/proxy-export-dialog.tsx`** is the rasterization precedent — `html2canvas-pro` capturing rendered card DOM to an image; the export here follows the same approach against an off-screen fixed-size clone.

## Confirmation

The single real risk is export fidelity, so the **first build step is a rasterization spike**, before the full form is built: render `CardPlaceholderImage` with a sample data-URL background into the off-screen fixed-width container and confirm `html2canvas-pro` reproduces, acceptably, the background image + transform, the domain gradients, the `brightness-0 invert` icon filters, the name bar, the scrim, and the footer attribution. If a feature does not rasterize, the fallbacks are: keep the noise filter hidden under images (already decided); if gradients or icon filters are wrong, pre-bake the affected layer or adjust to an html2canvas-friendly equivalent. Only once the spike confirms a faithful PNG does the full editor get built.

Beyond the spike, the feature is confirmed by the unit tests listed under "Conventions to honour" (store, pure helpers, upload hook) and a manual check that Download PNG and Copy to clipboard both produce an image matching the on-screen preview, including attribution, across Chromium, Firefox, and Safari (with the clipboard→download fallback exercised where the Clipboard API is unavailable).
