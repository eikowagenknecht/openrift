# Design language

The visual identity beyond the type scale (see `typography.md` for fonts and sizes). These are the rules that keep the app from drifting back to stock-shadcn looks. When adding UI, follow them; when deliberately breaking one, update this file in the same change.

## The corner cut

A 45° cut on the bottom-right corner is the app's signature shape. The rule is checkable in two seconds:

**Solid fill → cut. Everything else → rounded.**

- **Gets the cut:** the solid-fill Button variants — `default`, `secondary`, and `destructive` (a solid red fill; destructive commits share the family shape) — everywhere they appear: page CTAs, dialog submits, delete confirms, the top-bar primary, the header's Sign in. Implemented once, in `buttonVariants` (`apps/web/src/components/ui/button.tsx`) via the `btn-corner-cut` utility (`apps/web/src/index.css`); size variants tune `--btn-cut` (8px default, 5px for `xs`/`sm`/`icon-xs`/`icon-sm`).
- **Stays rounded:** `outline` (bordered, and the border would die on the clip edge — see below), `ghost`, links, inputs, selects, dialogs, cards, badges, and — for now — `Toggle` pressed states (a known, accepted inconsistency; revisit if it grates).
- **Pairing rule:** next to a cut CTA, the lesser action is `ghost` (borderless, visibly a different species), not `outline` — in dark mode `outline` gains a tinted fill and masquerades as a clashing rounded peer. Reserve `outline` for form-adjacent contexts away from cut buttons.
- **Scaled-up kin:** the landing hero CTAs (12px cut at h-11) and the landing vignette frames / toolbox tiles (16px / 12px) use the same shape at marketing scale, hand-rolled at their call sites.

Technical constraints the cut brings, already handled where it applies:

- `clip-path` clips outset box-shadows, so cut buttons use **inset focus rings** (`focus-visible:ring-inset`).
- A stroked border on the clip boundary anti-aliases away at fractional zoom. Filled buttons have no border, so this never bites them. If a _bordered_ surface ever needs the cut, use the clipped-wrapper hairline construction (outer element in the line color, inner inset by 1px, both clipped) — see the landing page's "Sign up free" CTA.

## Radius

`--radius` is `0.375rem` (sharpened from the shadcn default `0.625rem`) — every rounded control derives from it. Don't hand-tune radii per component; if something looks off, the token is the discussion, not the call site.

## Control rows

Boxed controls that share a horizontal row share a height. The form tier is **h-8**, and it's the default for all three box primitives — `Input`, `SelectTrigger`, and `Button` — so a row of defaults is always aligned. The compact sizes (`sm` h-7, `xs` h-6) exist for uniformly-dense surfaces (table rows, chip strips, toolbars where _everything_ is compact), not for "slightly smaller CTA": never put a compact bordered/filled button in the same row as an h-8 box — the edges misalign by 4-8px and read as broken. Borderless controls (ghost icon buttons, links) are exempt; with no visible box edge they may sit one tier smaller inside a taller row. A button that belongs _to_ an input (clear, submit-inline) goes inside `InputGroup` as `InputGroupButton`, which locks the sizing structurally. The "Control row" demo on `/admin/design` shows the aligned reference row.

## Accents

- **Gold hairlines** (`--border-accent`): the emphasis border — landing vignette frames, heading rules, the hero's outline CTA. Use sparingly; it marks crafted moments, not generic borders.
- **Display face** (`font-heading`, Chakra Petch): see `typography.md` for the exact scope (titles, wordmark, big numerals — never body or compact UI).

## Tiles and list rows

Entity tiles and list rows (a deck, group, trade, member, tournament, stat block) use the **`Card` primitive**, not hand-rolled `bg-card rounded-* border` divs — hand-rolled boxes drift from the Card look (corner radius, ring-vs-border) the moment tokens change. For clickable rows, the Link/button stays the outer element (`className="block"`) with the Card nested inside carrying the visuals.

Two list shapes carry the Card edge without being a `Card`, and both have a primitive in `components/ui/card-list.tsx`. **`CardList`** is one panel with its rows flush inside it, separated by their own hover wash — a rail of same-shaped rows (a group's newest shares, a tournament's rounds and staff). **`CardRow`** is a standalone bordered row in a gapped list, for rows that stand apart because each is its own entity with its own actions (a bye, a team). They are alternatives, not a pair: a `CardRow` never goes inside a `CardList`. Reach for `Card` itself as soon as the thing has a header, a footer, or real content padding.

Hand-rolled containers remain correct for: sticky toolbars and page chrome, form option-groups inside dialogs, diagram/mock frames (see `typography.md`), interactive gesture surfaces (match tracker), and deliberately custom marketing surfaces (landing page).

## Empty states

Use `EmptyState` (`apps/web/src/components/empty-state.tsx`) — the dashed card-fan visual — for genuinely-empty surfaces. Filtered-empty ("nothing matches your filters") stays a quiet description-only `Empty`. Don't hand-roll bare-paragraph empty states.
