# Design language

The visual identity beyond the type scale (see `typography.md` for fonts and sizes). These are the rules that keep the app from drifting back to stock-shadcn looks. When adding UI, follow them; when deliberately breaking one, update this file in the same change.

## The corner cut

A 45° cut on the bottom-right corner is the app's signature shape. The rule is checkable in two seconds:

**Solid fill → cut. Everything else → rounded.**

- **Gets the cut:** the solid-fill Button variants — `default`, `secondary`, and `destructive` (a solid red fill; destructive commits share the family shape) — everywhere they appear: page CTAs, dialog submits, delete confirms, the top-bar primary, the header's Sign in. Implemented once, in `buttonVariants` (`apps/web/src/components/ui/button.tsx`) via the `btn-corner-cut` utility (`apps/web/src/index.css`); size variants tune `--btn-cut` (8px default, 5px for `xs`/`sm`/`icon-xs`/`icon-sm`).
- **Stays rounded:** `outline` (bordered, and the border would die on the clip edge — see below), `ghost`, links, inputs, selects, dialogs, cards, badges, and — for now — `Toggle` pressed states (a known, accepted inconsistency; revisit if it grates).
- **Segmented selectors** (one active option out of a joined row: group-by, time range, price source, validity filter) are `ToggleGroup` with `variant="outline" spacing={0}`, never a `ButtonGroup` whose active member switches to `variant="default"`. A cut fires on the active segment wherever it sits, so an interior selection loses its bottom-right corner with no outer edge to justify it, and `rounded-none` fights the group's end rounding. `ToggleGroup` marks the active segment with a `bg-muted` fill and handles the first/last radii itself. Reference: the validity filter in `apps/web/src/features/decks/components/deck-list-toolbar.tsx`.
- **Pairing rule:** next to a cut CTA, the lesser action is `ghost` (borderless, visibly a different species), not `outline` — in dark mode `outline` gains a tinted fill and masquerades as a clashing rounded peer. Reserve `outline` for form-adjacent contexts away from cut buttons.
- **Scaled-up kin:** the landing hero CTAs (12px cut at h-11) and the landing vignette frames / toolbox tiles (16px / 12px) use the same shape at marketing scale, hand-rolled at their call sites.

Technical constraints the cut brings, already handled where it applies:

- `clip-path` clips outset box-shadows, so cut buttons use **inset focus rings** (`focus-visible:ring-inset`).
- A stroked border on the clip boundary anti-aliases away at fractional zoom. Filled buttons have no border, so this never bites them. If a _bordered_ surface ever needs the cut, use the clipped-wrapper hairline construction (outer element in the line color, inner inset by 1px, both clipped) — see the landing page's "Sign up free" CTA.

## Color tokens

The palette lives in `apps/web/src/index.css`; components only ever name a token. Two rules keep the scheme coherent:

- **Every surface carries the ground's hue.** In the dark scheme the background is navy (hue 260) and every surface, border and text token (`--card`, `--popover`, `--muted`, `--secondary`, `--border`, `--input`, `--foreground`, `--muted-foreground`) sits on the same hue at a low chroma. A neutral value (chroma 0) on any of them reads as a gray slab on a blue ground; that was the source of the "gray" feel before the pass. The light scheme is warm parchment (hue 85) with cool navy text; keep that pairing.
- **State is a semantic token, never a Tailwind hue.** `success`, `warning`, `info`, `destructive` and `violet` each ship as a solid (`text-success`, `bg-warning`, `border-info/30`), a soft fill (`bg-success-soft`) and, for the four states, a foreground for text on the solid (`text-success-foreground`). Each token already differs between light and dark, so a `dark:` variant next to a token class is a bug. `violet` is the fourth taxonomy tone (rules-change "moved", the admin role chip), not a state. Gold accents use `--border-accent` (`text-border-accent`, `ring-border-accent`). Raw hue classes (`text-green-600`, `bg-amber-500/10`, `text-sky-400`) are banned by `apps/web/src/lib/design-guards.test.ts`; the only exemptions are physical card stock and photo backdrops (`bg-neutral-800`), the podium medals, domain colors (through `@/lib/domain`) and the rarity lens hexes.

`--accent` equals `--primary` in this theme. It is the brand fill, never a hover or highlight wash: menus, list rows and toggles highlight with `bg-muted`.

## Edges and elevation

- **One edge color.** Cards, list panels, popovers and dialogs draw their edge as `ring-1 ring-border`; inputs, outline buttons and alerts draw a `border` in the same `--border` token. There is no second edge color (the old `ring-foreground/10` was a cool gray line that clashed with the warm border in light mode and with the navy in dark).
- **Two elevation tiers.** Anchored popups (popover, hover card, select, dropdown and context menus including sub-menus, combobox, navigation menu, chart tooltip) cast `shadow-md`. Modals and edge panels (dialog, alert dialog, drawer, sheet) cast `shadow-lg`. Tooltips cast none. Content surfaces (cards, tiles) cast none at rest; a hoverable tile may lift to `shadow-md`.
- **Focus** is `focus-visible:ring-2 focus-visible:ring-ring/50` everywhere, inset on cut buttons.

## Washes and selection

- **Row hover** is `hover:bg-muted/50` on list rows and tiles, `hover:bg-muted` on menu items, ghost buttons and toggles. No other alpha.
- **Inset panels** (a note callout, a muted band, a code chip) use `bg-muted/30` when bordered and `bg-muted` when not. `bg-muted/40`, `/60`, `/80` are not tiers.
- **Selection** is `ring-2 ring-primary` for the chosen item and `ring-2 ring-primary/60` for a drop target, with `ring-offset-2 ring-offset-background` when the ring must clear an image. `border-primary` and `bg-primary/10` mark a chosen option inside a form, not a selected tile.

## Radius

`--radius` is `0.375rem` (sharpened from the shadcn default `0.625rem`) — every rounded control derives from it. Don't hand-tune radii per component; if something looks off, the token is the discussion, not the call site.

The mapping: `rounded-lg` (6px) for every boxed control and surface (button, input, select, card, popover, dialog, tile), `rounded-md` (4px) for things nested inside one (menu items, tab triggers, table cells, inline code, thumbnails in a row), `rounded-sm` (2px) for kbd and hairline chips, `rounded-4xl` for pills (badge, count pill), `rounded-full` for dots and avatars. Bare `rounded` is Tailwind's 0.25rem and does not follow the token; the guard test rejects it, write `rounded-md`. Arbitrary values (`rounded-[4px]`) are for container-query units only.

## Control rows

Boxed controls that share a horizontal row share a height. The form tier is **h-8**, and it's the default for all three box primitives — `Input`, `SelectTrigger`, and `Button` — so a row of defaults is always aligned. The compact sizes (`sm` h-7, `xs` h-6) exist for uniformly-dense surfaces (table rows, chip strips, toolbars where _everything_ is compact), not for "slightly smaller CTA": never put a compact bordered/filled button in the same row as an h-8 box — the edges misalign by 4-8px and read as broken. Borderless controls (ghost icon buttons, links) are exempt; with no visible box edge they may sit one tier smaller inside a taller row. A button that belongs _to_ an input (clear, submit-inline) goes inside `InputGroup` as `InputGroupButton`, which locks the sizing structurally. The "Control row" demo on `/admin/design` shows the aligned reference row.

## Accents

- **Gold hairlines** (`--border-accent`): the emphasis border — landing vignette frames, the hero's outline CTA. Use sparingly; it marks crafted moments, not generic borders.
- **The card-border rule** (`OrnamentRule`, `apps/web/src/components/ui/ornament.tsx`): the gold hairline with a diamond gem, taken from the edge of the printed card text box. It replaces every bare gold heading rule: fading at both ends at `w-40` under marketing and landing headings and at `w-56` under a centered heading or above the footer, and edge to edge with only the tips fading (`fade="tips"`) and a label between two gems for the card-grid set headers. The same file holds `OrnamentBase` (the bracket base with stepped caps and a medallion), which closes the card detail text box with the rarity glyph in the medallion, and `OrnamentCorners` (chamfered corner brackets, on a `ClipFrame` via `ornament`), demoed on `/admin/design` and not yet placed. `tone="silver"` exists for the black stage ground only. Gold ornaments go only where the gold hairline already goes: never on Card edges, inputs, tables or menus.
- **Display face** (`font-heading`, Chakra Petch): see `typography.md` for the exact scope (titles, wordmark, big numerals — never body or compact UI).

## Tiles and list rows

Entity tiles and list rows (a deck, group, trade, member, tournament, stat block) use the **`Card` primitive**, not hand-rolled `bg-card rounded-* border` divs — hand-rolled boxes drift from the Card look (corner radius, ring-vs-border) the moment tokens change. For clickable rows, the Link/button stays the outer element (`className="block"`) with the Card nested inside carrying the visuals.

Two list shapes carry the Card edge without being a `Card`, and both have a primitive in `components/ui/card-list.tsx`. **`CardList`** is one panel with its rows flush inside it, separated by their own hover wash — a rail of same-shaped rows (a group's newest shares, a tournament's rounds and staff). **`CardRow`** is a standalone bordered row in a gapped list, for rows that stand apart because each is its own entity with its own actions (a bye, a team). They are alternatives, not a pair: a `CardRow` never goes inside a `CardList`. Reach for `Card` itself as soon as the thing has a header, a footer, or real content padding.

Hand-rolled containers remain correct for: sticky toolbars and page chrome, form option-groups inside dialogs, diagram/mock frames (see `typography.md`), interactive gesture surfaces (match tracker), and deliberately custom marketing surfaces (landing page).

## Callouts, notes and code

`Alert` is the icon + title + description callout (`default`, `destructive`, `warning`, `info`). `Callout` (`components/ui/callout.tsx`) is the muted note box for anything with its own inner layout: intro banners, dismissable guides, option asides. `Code` (`components/ui/code.tsx`) is the inline chip for a path, key or command in help copy. Section labels above a list are `SectionHeading`, never a hand-typed uppercase span; the tracking is `tracking-wide`, there is no `wider` or `widest` tier.

## Empty states

Use `EmptyState` (`apps/web/src/components/empty-state.tsx`) — the dashed card-fan visual — for genuinely-empty surfaces. Filtered-empty ("nothing matches your filters") stays a quiet description-only `Empty`. Don't hand-roll bare-paragraph empty states.
