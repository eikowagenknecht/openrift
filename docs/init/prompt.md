# Riftbound Card Browser — v0.1 Build Prompt

## What You're Building

A card browser for **Riftbound**, the League of Legends TCG. Web app + React Native mobile app sharing types and logic via a Turborepo monorepo. No backend, no auth, no collection tracking yet — just browsing and filtering cards from a static JSON dataset.

This is the foundation for a future collection tracker. Get the card grid, filtering UX, and cross-platform architecture right.

---

## Monorepo Structure

```
openrift/
├── apps/
│   ├── web/              → Vite + React + Tailwind CSS + shadcn/ui
│   └── mobile/           → Expo + React Native + Uniwind + React Native Reusables (future)
├── packages/
│   └── shared/           → Card types, Zod schemas, filter logic, card data JSON
├── scripts/
│   └── fetch-cards.ts    → One-time Riot API fetch script (see below)
├── docs/
│   └── init/             → Design docs (this file, architecture.md, progress.md)
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── lefthook.yml          → Git hooks config
├── commitlint.config.ts  → Conventional commit enforcement
├── .oxlintrc.json        → Linter config
└── .oxfmtrc.json         → Formatter config
```

Use **pnpm** (v10) as the package manager. Use **Turborepo** for monorepo orchestration.

---

## Tech Stack

### Web (`apps/web`)

- **Vite 7** + **React 19** + **TypeScript 5.9** + **SWC**
- **Tailwind CSS v4** for styling
- **shadcn/ui** for component primitives (combobox, input, sheet, badge, toggle group)
- **TanStack Virtual** for virtualizing the card grid (the card list can be 500+ items)
- **nuqs** for URL-synced filter state (so filters are bookmarkable/shareable)
- React Router (or just hash-based routing — the app is a single page for now)
- Deployed to **Cloudflare Workers** (static assets mode) at `openrift.app`

### Tooling (repo-wide)

- **oxlint** — primary linter (Rust, fast), replaces ESLint for all general linting
- **oxfmt** — primary formatter (Rust, fast), with import sorting enabled
- **ESLint** — used ONLY for the `react-compiler` plugin (oxlint can't do this yet)
- **lefthook** — git hooks: pre-commit runs typecheck, oxlint, eslint, oxfmt; commit-msg runs commitlint
- **commitlint** — enforces conventional commit format
- **Dependabot** — weekly grouped dependency update PRs, all versions pinned

### Mobile (`apps/mobile`)

- **Expo** (SDK 53+) with **Expo Router**
- **React Native** + **TypeScript**
- **Uniwind** (Tailwind CSS for React Native — drop-in NativeWind replacement, faster runtime)
  - Docs: https://docs.uniwind.dev/
  - If Uniwind causes issues during setup, fall back to **NativeWind v4** — the API is nearly identical
- **React Native Reusables** for shadcn/ui-style components on native
  - Docs: https://reactnativereusables.com/docs
  - Note: Uniwind support is still being formalized (see https://github.com/founded-labs/react-native-reusables/issues/483). If components require NativeWind-specific APIs (like `cssInterop`), replace with Uniwind's `withUniwind` equivalent. Fall back to NativeWind if this causes too many issues.
- **FlashList** by Shopify for performant card grid on mobile (replaces FlatList)

### Shared (`packages/shared`)

- **Zod** for card schema validation
- **TypeScript** types exported for both apps
- Filter logic (pure functions, no React dependency)
- The card data JSON file lives here

---

## Card Data

### Source: Riot API `riftbound-content-v1` (access pending)

> **Note:** We applied for Riftbound API access via the Riot Developer Portal. Standard dev keys
> return 403 — a registered product key is required. The structure below is from Riot's
> documentation and is unverified. Types and schemas will be adjusted once we have real API access.

The official Riot API has a single endpoint that returns all card data:

```
GET https://americas.api.riotgames.com/riftbound/content/v1/contents?locale=en
Header: X-Riot-Token: <API_KEY>
```

This returns a `RiftboundContentDTO` with this structure:

```typescript
{
  game: string,
  lastUpdated: string,       // ISO timestamp
  version: string,
  sets: [
    {
      id: string,            // e.g. "SET_1"
      name: string,          // e.g. "Origins"
      cards: [
        {
          id: string,
          name: string,
          description: string,
          flavorText: string,
          type: string,       // "Champion", "Unit", "Spell", "Landmark", etc.
          faction: string,    // domain/faction
          rarity: string,     // "Common", "Uncommon", "Rare", "Epic", etc.
          set: string,
          collectorNumber: number,
          keywords: string[],
          tags: string[],
          stats: {
            cost: number,
            energy: number,
            might: number,
            power: number
          },
          // NOTE: Docs say "art" but actual API returns "media" array
          // Handle BOTH formats defensively
          art?: {
            thumbnailURL: string,
            fullURL: string,
            artist: string
          },
          media?: Array<{
            type: string,
            url: string,
            name: string
          }>
        }
      ]
    }
  ]
}
```

### The fetch script (`scripts/fetch-cards.ts`)

Create a Node script that:

1. Calls the Riot API endpoint above (API key from `RIOT_API_KEY` env var)
2. Parses the response
3. Normalizes the card data (handles both `art` and `media` formats)
4. Extracts image URLs (both thumbnail and full resolution)
5. Writes a clean `cards.json` to `packages/shared/data/cards.json`
6. Writes a `sets.json` to `packages/shared/data/sets.json`
7. Logs a summary: number of sets, number of cards, any cards without images

This script is run manually by the developer. It is NOT part of the app runtime.

If no Riot API key is available, include a **sample data file** with 20-30 mock cards across 2 sets so the app can be developed and tested without an API key. The mock data should cover different rarities, factions, types, and stat distributions.

### Image Strategy

Card images are hotlinked directly from the URLs provided by the Riot API (stored in cards.json). Do NOT download images to disk for v0.1. Use lazy loading and placeholder shimmer effects while images load.

---

## Shared Package (`packages/shared`)

> **Note:** These types are based on Riot's documented API format and may need adjustment
> once we have actual API access. Build against these for now.

### Types (`packages/shared/src/types.ts`)

```typescript
export interface Card {
  id: string;
  name: string;
  description: string;
  flavorText: string;
  type: CardType;
  faction: string;
  rarity: Rarity;
  setId: string;
  collectorNumber: number;
  keywords: string[];
  tags: string[];
  stats: CardStats;
  imageUrl: string; // full resolution
  thumbnailUrl: string; // thumbnail
  artist: string;
}

export interface CardStats {
  cost: number;
  energy: number;
  might: number;
  power: number;
}

export interface CardSet {
  id: string;
  name: string;
  cardCount: number;
}

export type CardType = "Champion" | "Unit" | "Spell" | "Landmark" | string;
export type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | string;

export interface CardFilters {
  search: string;
  sets: string[];
  rarities: Rarity[];
  types: CardType[];
  factions: string[];
  costRange: [number, number] | null;
}
```

### Filter Logic (`packages/shared/src/filters.ts`)

Pure functions that both web and mobile import:

- `filterCards(cards: Card[], filters: CardFilters): Card[]`
- `getAvailableFilters(cards: Card[]): { sets, rarities, types, factions, costRange }`
- `sortCards(cards: Card[], sortBy: SortOption): Card[]`

Sort options: by name, by collector number, by cost, by rarity.

### Zod Schemas (`packages/shared/src/schemas.ts`)

Validate the card data JSON at build/import time. This catches API format changes early.

---

## Web App (`apps/web`)

### Pages / Views

**Single-page app with one main view: the card browser.**

Layout:

```
┌──────────────────────────────────────────────────────┐
│  Header: "Riftbound" + search input                  │
├──────────────────────────────────────────────────────┤
│  Filter bar: set | rarity | type | faction | cost    │
│  (toggle groups / dropdowns, horizontally scrollable │
│   on mobile viewport)                                │
├──────────────────────────────────────────────────────┤
│  Results count: "Showing 142 of 287 cards"           │
│  Sort: dropdown (Name / Number / Cost / Rarity)      │
├──────────────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│  │card│ │card│ │card│ │card│ │card│ │card│        │
│  │    │ │    │ │    │ │    │ │    │ │    │        │
│  │    │ │    │ │    │ │    │ │    │ │    │        │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘        │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│  │card│ │card│ │card│ │card│ │card│ │card│        │
│  │    │ │    │ │    │ │    │ │    │ │    │        │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘        │
│  ... (virtualized, loads more on scroll)             │
└──────────────────────────────────────────────────────┘
```

### Card Grid

- Responsive grid: 2 columns on mobile, 3-4 on tablet, 5-6 on desktop
- Each card shows: image, name, cost badge, rarity indicator (border color or small badge)
- Virtualized with TanStack Virtual so scrolling stays smooth with 500+ cards
- Lazy-loaded images with a shimmer/skeleton placeholder

### Card Detail

- Clicking a card opens a **sheet** (slide-up on mobile, side panel on desktop) using shadcn/ui Sheet
- Shows: full-size card image, name, type, rarity, faction, stats, keywords, description, flavor text, artist credit
- Close by clicking outside or pressing escape

### Filters

- **Search**: text input, filters by card name (debounced, 200ms)
- **Set**: toggle group (e.g., "Origins", "Spiritforged")
- **Rarity**: toggle group with color-coded badges
- **Type**: toggle group (Champion, Unit, Spell, etc.)
- **Faction**: toggle group
- **Cost**: range slider or number filter
- All filters are AND-combined
- Active filters shown as dismissible badges below the filter bar
- **All filter state synced to URL params via nuqs** — users can bookmark/share filtered views
- A "Clear all filters" button when any filter is active

### Dark Mode

- Support system preference detection and manual toggle
- Use Tailwind's dark mode with CSS variables (shadcn/ui approach)

### Legal

- Footer includes: `"Riftbound Card Browser was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project."`

---

## Mobile App (`apps/mobile`)

### Screens

**Two screens via Expo Router:**

1. **Card Browser** (home / index)
   - Same filter + grid layout as web, adapted for touch
   - FlashList for the card grid (2 columns in portrait, 3 in landscape)
   - Filters in a bottom sheet (tap filter icon → sheet slides up with all filter options)
   - Search bar at the top with keyboard-aware behavior
   - Pull-to-refresh (reloads data from bundled JSON — future-proofing for when data comes from API)

2. **Card Detail**
   - Full-screen modal or pushed screen
   - Large card image (pinch-to-zoom if feasible, otherwise just fill width)
   - All card metadata below the image
   - Swipe left/right to navigate between cards in the current filtered list

### Navigation

- Expo Router file-based routing
- `app/(tabs)/index.tsx` — card browser
- `app/card/[id].tsx` — card detail

### Styling

- Uniwind for Tailwind classes on native components
- React Native Reusables for UI primitives (Input, Badge, Sheet, Toggle, etc.)
- Follow the same color scheme / CSS variables as the web app for visual consistency
- Dark mode support matching system preference

### Performance

- FlashList with estimated item size for smooth scrolling
- Images loaded with Expo Image (or react-native-fast-image) for caching and progressive loading
- Card data loaded from bundled JSON (no network request in v0.1)

---

## Design Guidelines

### Visual Language

- Clean, modern, information-dense but not cluttered
- Card images are the star — give them space
- Rarity colors consistent with Riftbound's official colors (extract from card data or Riot's card gallery)
- Subtle shadows on card thumbnails
- Smooth transitions when applying/removing filters (filter results should not cause layout jumps)

### Mobile-First on Web

- The web app must be fully usable on a phone browser
- Filters collapse into a sheet/drawer on small viewports
- Touch-friendly tap targets (min 44px)

### Accessibility

- All images have alt text (card name)
- Keyboard navigable on web
- Color is not the sole indicator of rarity (use text labels too)
- Focus visible states on interactive elements

---

## What NOT to Build (out of scope for v0.1)

- ❌ Backend / API server / database
- ❌ User authentication
- ❌ Collection tracking (no "owned" toggle, no counts)
- ❌ Deck builder
- ❌ Price tracking
- ❌ Storage locations (binders, boxes, etc.)
- ❌ Card variants (foil, alt art, signatures, promos, overnumbered)
- ❌ PWA features (service worker, offline mode)
- ❌ Internationalization
- ❌ Docker / self-hosted deployment (Cloudflare Workers deployment IS in scope)

---

## Development Setup

The developer should be able to:

```bash
git clone <repo>
cd openrift
pnpm install

# Generate card data (if they have an API key)
RIOT_API_KEY=RGAPI-xxx pnpm run fetch-cards

# Or just use the bundled mock data

# Start web
pnpm run dev:web        # → http://localhost:5173

# Start mobile
pnpm run dev:mobile     # → Expo dev server

# Lint & format
pnpm run lint           # runs oxlint + oxfmt check
pnpm run format         # runs oxfmt (auto-fix)
```

Turborepo builds `packages/shared` before either app (configured via `dependsOn: ["^build"]`).
Git hooks via lefthook enforce typecheck, linting, formatting, and conventional commits on every commit.

---

## Quality Bar

- TypeScript strict mode, no `any` types
- All shared code has Zod validation
- oxlint (correctness + suspicious = error, pedantic + style = warn) and oxfmt enforced via pre-commit hooks
- React Compiler violations caught by eslint-plugin-react-compiler (error level)
- Web app scores 90+ on Lighthouse (performance, accessibility)
- Mobile app scrolls at 60fps with 500+ cards in the grid
- Both apps render identically (same filters, same sort, same card detail info)
- Code is clean enough to open-source later

---

## Context

This is the first step toward a full Riftbound collection tracker that will eventually include:

- Auth (Better Auth) + Hono API server + Postgres database
- Collection tracking with storage locations (binders, boxes, bulk, inbox)
- Card variants (foil, alt art, signatures, promos, overnumbered)
- Deck builder with "can I build this?" from owned cards
- Self-hostable via Docker Compose
- Deployment on a Hetzner VPS behind Caddy + Cloudflare

The architecture choices in v0.1 (monorepo, shared types, filter logic in shared package) are specifically designed to make that evolution smooth. Don't over-engineer for the future, but don't make choices that block it either.
