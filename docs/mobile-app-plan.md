# Mobile App Plan — OpenRift for iOS & Android

## 1. Overview

Build a React Native mobile app (`apps/mobile`) that mirrors the web app's card browsing experience with native performance and interactions. The app shares all types, validation, filter logic, and card data from `packages/shared` — only the UI layer is new.

### Goals

- **Feature parity** with the web card browser: search, filter, sort, browse, view details
- **Native feel**: 60fps scrolling through 664+ cards, native gestures (swipe to dismiss, pull to refresh), bottom sheet filters, haptic feedback
- **Shared logic**: zero duplication of types, schemas, or filter/sort functions
- **Offline-first**: card data bundled in the app, no network required for browsing
- **Dark mode**: system preference detection + manual toggle, matching the web's design tokens

### Non-goals (for v1)

- Backend integration (no auth, no collection tracking — same as web v0.1)
- Push notifications
- App Store / Play Store submission (dev builds + TestFlight/internal testing first)
- Tablet-optimized layout (phones first, tablet works but isn't custom-designed)

---

## 1b. Prerequisites and Registrations

### Hardware

- **Main development machine** (any OS) — where you write code and run the Expo dev server
- **Mac** (build machine) — handles iOS Simulator, Xcode compilation, and TestFlight uploads. Can be an older MacBook on your local network, accessed via SSH. Minimum: macOS 13 (Ventura) + Xcode 15 for iOS 17 SDK support
- **iPhone** (optional) — for testing via Expo Go during development, or TestFlight for release builds

### Registrations

| Registration | Cost | Purpose | Required for |
|---|---|---|---|
| **Apple Developer Program** | $99/year | Code signing, TestFlight, App Store | Any iOS distribution |
| **Expo account** | Free | EAS CLI, OTA updates | `eas build --local`, `eas submit` |
| **Google Play Developer** | $25 one-time | Play Store listing | Android distribution (later) |

### Mac setup (one-time)

1. Install **Xcode** from the App Store (~12GB)
2. Install Xcode command-line tools: `xcode-select --install`
3. Install **Node.js 20+**, **pnpm**, **git**, **Watchman** (file watcher for Metro)
4. Clone the repo: `git clone ... ~/openrift`
5. Run `pnpm install`
6. Enable **Remote Login** (System Settings → General → Sharing → Remote Login) for SSH
7. Optionally enable **Screen Sharing** for when you need to see the Simulator visually
8. Install EAS CLI: `pnpm add -g eas-cli && eas login`
9. Keep the lid open (or use `caffeinate -s` to prevent sleep) when using as a build server

### Verify Mac connectivity from your main machine

```bash
# Find the Mac on your network
ssh your-mac.local

# Or by IP
ssh user@192.168.1.xx
```

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Expo SDK 53+** | Managed workflow, OTA updates, EAS Build for CI |
| Routing | **Expo Router v4** | File-based routing (matches web's single-page mental model) |
| Language | **TypeScript 5.9** (strict) | Same tsconfig strictness as web and shared |
| Styling | **Uniwind** (Tailwind for RN) | Same utility classes as web; if issues arise, fall back to NativeWind v4 |
| UI primitives | **React Native Reusables** | shadcn/ui-style components for native (Button, Input, Sheet, Badge, Slider) |
| List rendering | **FlashList** (Shopify) | Handles 664+ cards at 60fps; recycling architecture beats FlatList |
| Images | **Expo Image** | Disk caching, blurhash placeholders, priority loading |
| Bottom sheet | **@gorhom/bottom-sheet** | Gesture-driven, snap points, keyboard-aware — industry standard |
| State | **React useState/useReducer** | No external state library needed; filter state lives in component tree |
| Storage | **AsyncStorage** | Persist display settings, search scope, theme preference |
| Icons | **Lucide React Native** | Same icon set as web |

### Why Uniwind over NativeWind

Uniwind has a faster runtime and is a drop-in replacement for NativeWind. The API is nearly identical (`className` prop, same Tailwind utilities). If Uniwind causes compatibility issues with React Native Reusables (which originally targeted NativeWind), we swap `cssInterop` calls for Uniwind's `withUniwind` — or fall back entirely to NativeWind v4.

### Why not React Native Web / single codebase

The web app is already built and deployed. Retrofitting it into a universal app would mean:
- Replacing shadcn/ui with cross-platform components everywhere
- Replacing nuqs URL state with a cross-platform alternative
- Replacing Vite with Metro
- Losing Cloudflare Workers deployment

Not worth it. Two thin UI layers sharing one thick logic layer is the right split.

---

## 3. Project Structure

```
apps/mobile/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout (theme provider, safe area)
│   ├── index.tsx                 # Card browser screen (home)
│   └── card/
│       └── [id].tsx              # Card detail screen (modal)
├── components/
│   ├── cards/
│   │   ├── CardGrid.tsx          # FlashList grid of card thumbnails
│   │   ├── CardThumbnail.tsx     # Single card in grid (pressable, image)
│   │   ├── CardDetail.tsx        # Full card detail view
│   │   ├── CardPlaceholder.tsx   # Domain-colored gradient placeholder
│   │   └── CardText.tsx          # Glyph pattern parser (:rb_*: → icons)
│   ├── filters/
│   │   ├── FilterSheet.tsx       # Bottom sheet with all filter controls
│   │   ├── FilterChips.tsx       # Horizontal scrollable active filter badges
│   │   ├── SearchBar.tsx         # Search input with scope selector
│   │   ├── RangeSlider.tsx       # Energy/might/power range filter
│   │   └── MultiSelect.tsx       # Reusable multi-select for sets/rarities/etc.
│   ├── layout/
│   │   ├── Header.tsx            # Top bar with logo, filter button, settings
│   │   └── SortMenu.tsx          # Sort option selector
│   └── ui/                       # React Native Reusables components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── input.tsx
│       ├── sheet.tsx
│       ├── slider.tsx
│       └── ...
├── hooks/
│   ├── use-card-filters.ts       # Filter state management (React state + AsyncStorage)
│   ├── use-debounce.ts           # Debounced search (port from web)
│   ├── use-theme.ts              # Dark/light mode with system preference
│   └── use-search-scope.ts       # Search field toggle (persisted to AsyncStorage)
├── lib/
│   ├── utils.ts                  # cn() helper for conditional classes
│   ├── cards.ts                  # Load & flatten card data from shared package
│   └── storage.ts                # AsyncStorage typed helpers
├── assets/
│   ├── icons/                    # Domain icons, stat icons (SVG → RN)
│   └── images/                   # App icon, splash screen
├── app.json                      # Expo config
├── metro.config.js               # Metro bundler config (monorepo support)
├── tailwind.config.ts            # Uniwind/NativeWind config
├── tsconfig.json                 # TypeScript config (extends root)
├── babel.config.js               # Babel config for Expo
└── package.json
```

---

## 4. Screens

### 4.1 Card Browser (Home) — `app/index.tsx`

The main screen. Composes all sub-components.

**Layout (top to bottom):**
1. **Header bar** — OpenRift logo/title, filter button (badge with active count), sort button, settings button
2. **Search bar** — Text input with scope selector dropdown, debounced 200ms
3. **Active filter chips** — Horizontal `ScrollView` of dismissible badges, "Clear all" at end
4. **Results count** — "Showing 142 of 664 cards"
5. **Card grid** — FlashList with 3 columns (phone portrait), 4 columns (phone landscape / tablet)
6. **Empty state** — "No cards match your filters" with clear button

**Behavior:**
- Filter button opens FilterSheet (bottom sheet with snap points)
- Tapping a card navigates to `card/[id]` as a modal
- Pull-to-refresh is a no-op for now (data is static) but wired up for future API integration
- Scroll position preserved when returning from detail

**Mapping from web:**
| Web component | Mobile equivalent | Key difference |
|---|---|---|
| `CardBrowser.tsx` | `app/index.tsx` | Same orchestration, native layout |
| `CardGrid.tsx` (CSS grid) | `CardGrid.tsx` (FlashList) | Recycling vs DOM rendering |
| `CardThumbnail.tsx` | `CardThumbnail.tsx` | `Pressable` + `Expo Image` instead of `<button>` + `<img>` |
| `FilterBar.tsx` (inline/sheet) | `FilterSheet.tsx` (always bottom sheet) | `@gorhom/bottom-sheet` instead of shadcn Sheet |
| `ActiveFilters.tsx` | `FilterChips.tsx` | Horizontal `ScrollView` instead of flex wrap |
| `use-card-filters.ts` (nuqs) | `use-card-filters.ts` (React state) | No URL sync; filter state in memory, settings in AsyncStorage |

### 4.2 Card Detail — `app/card/[id].tsx`

Full-screen modal showing a single card.

**Layout (scrollable):**
1. **Header** — Card name, close button (X), back gesture to dismiss
2. **Card image** — Full-width, zoomable (pinch-to-zoom), blurhash placeholder during load
3. **Stats bar** — Energy / Might / Power in a horizontal row with icons
4. **Info section** — Type, supertype, rarity, domain(s), set, collector number, variant
5. **Card text** — Keywords, description, effect (with `:rb_*:` glyph rendering)
6. **Artist credit** — "Illustrated by {artist}"
7. **Navigation** — Swipe left/right to move between cards in the current filtered list

**Behavior:**
- Presented as a modal (slides up from bottom on iOS, slides in from right on Android)
- Swipe down to dismiss (iOS) / back gesture (Android)
- Swipe left/right to navigate to previous/next card in the filtered results
- Share button in header → native share sheet with card name and image URL
- Image can be tapped to go full-screen with pinch-to-zoom

**Mapping from web:**
| Web component | Mobile equivalent | Key difference |
|---|---|---|
| `CardDetail.tsx` (side panel / sheet) | `app/card/[id].tsx` (full-screen modal) | Dedicated screen instead of overlay |
| Domain gradient backgrounds | Same gradients via Uniwind | Tailwind classes translate directly |
| Card text glyph parsing | `CardText.tsx` (shared logic) | SVG → react-native-svg |

### 4.3 Settings (future)

Not a separate screen for v1. Settings are accessible via a menu in the header:
- Dark mode toggle
- Show/hide card fields (ID, title, type, supertype, rarity) — same as web's DisplaySettingsMenu
- Clear all cached data

---

## 5. Shared Package Reuse

Everything in `packages/shared` is pure TypeScript with zero React or DOM dependencies. The mobile app imports it unchanged.

### Direct imports

```typescript
// Types
import type { Card, CardFilters, SortOption, SortDirection } from "@openrift/shared";

// Filter logic
import { filterCards, sortCards, getAvailableFilters, flattenWithVariants } from "@openrift/shared";

// Search parsing
import { parseSearchTerms } from "@openrift/shared";

// Card data
import galleryData from "@openrift/shared/data/gallery.json";
```

### What the mobile app must implement on its own

| Concern | Web | Mobile | Why different |
|---|---|---|---|
| Filter state storage | nuqs (URL query params) | React state + AsyncStorage | No URL bar in native apps |
| Debounce | `use-debounce.ts` | Port or rewrite (trivial) | Same logic, different timer API (both use `setTimeout`) |
| Theme detection | `matchMedia("prefers-color-scheme")` | `Appearance.getColorScheme()` | Different platform APIs |
| Class merging | `cn()` via clsx + tailwind-merge | `cn()` via clsx + Uniwind merge | Same concept, different merge utils |
| Component library | shadcn/ui (Radix) | React Native Reusables | Same design, native primitives |

---

## 6. Filter State Architecture

The web app syncs filter state to URL query parameters via `nuqs`, making filtered views shareable as URLs. Mobile doesn't have URLs, so we use a different approach while keeping the same `CardFilters` interface from `packages/shared`.

```
┌──────────────────────────────────────────────────────┐
│ useCardFilters() hook                                │
│                                                      │
│  ┌─────────────┐    ┌──────────────────────────┐     │
│  │ React state │───▶│ CardFilters (from shared) │     │
│  │ (in-memory) │    │                           │     │
│  └─────────────┘    │ {search, sets, rarities,  │     │
│        │            │  types, domains, energy*,  │     │
│        │            │  might*, power*, variants} │     │
│        │            └──────────┬───────────────┘     │
│        │                       │                      │
│        ▼                       ▼                      │
│  ┌─────────────┐    ┌──────────────────────────┐     │
│  │ AsyncStorage│    │ filterCards(cards, filters)│     │
│  │ (persist    │    │ sortCards(result, sortBy)  │     │
│  │  settings)  │    │ (from @openrift/shared)    │     │
│  └─────────────┘    └──────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

**What gets persisted to AsyncStorage:**
- Search scope preference (which fields to search)
- Display settings (show images, visible card fields)
- Theme preference (dark/light/system)
- Sort preference (last used sort option + direction)

**What does NOT get persisted:**
- Active filters (search text, selected sets/rarities/etc.) — these reset on app launch
- Scroll position

---

## 7. Monorepo Integration

### 7.1 pnpm workspace

No changes needed. `pnpm-workspace.yaml` already includes `apps/*`.

### 7.2 Turborepo

`turbo.json` already defines `build` with `dependsOn: ["^build"]`, so `packages/shared` builds before `apps/mobile`. No changes needed for build ordering.

Add mobile-specific scripts to root `package.json`:

```json
{
  "scripts": {
    "dev:mobile": "pnpm --filter mobile start",
    "build:mobile": "pnpm --filter mobile export"
  }
}
```

### 7.3 Metro bundler monorepo config

Metro needs explicit configuration to resolve packages outside `apps/mobile/`. This is the most common pain point in Expo monorepos.

```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root for changes in shared packages
config.watchFolders = [monorepoRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
```

### 7.4 TypeScript

```jsonc
// apps/mobile/tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@/*": ["./src/*"],
      "@openrift/shared": ["../../packages/shared/src/index.ts"],
      "@openrift/shared/*": ["../../packages/shared/*"]
    }
  }
}
```

### 7.5 Linting

oxlint and oxfmt already run on `apps/` and `packages/` — `apps/mobile` is picked up automatically. No config changes needed.

---

## 8. Implementation Steps

### Step 1: Scaffold Expo project

- Run `npx create-expo-app@latest apps/mobile --template blank-typescript`
- Configure `metro.config.js` for monorepo resolution
- Configure `tsconfig.json` with strict mode and path aliases
- Verify `@openrift/shared` imports resolve correctly
- Add to root `package.json` scripts: `dev:mobile`, `build:mobile`
- Run `pnpm install` from root

**Verify:** `pnpm dev:mobile` launches Expo dev server, app renders a blank screen.

### Step 2: Install and configure Uniwind

- Install Uniwind (or NativeWind v4 as fallback)
- Configure `tailwind.config.ts` with content paths for `apps/mobile/**/*.tsx` and `../../packages/shared/**/*.ts`
- Set up CSS variables for dark mode colors matching the web's design tokens:
  - `--background`, `--foreground`, `--card`, `--primary`, `--muted`, etc.
- Verify a `<Text className="text-red-500">Hello</Text>` renders red text

**Verify:** Tailwind utility classes apply correctly. Dark mode class toggle works.

### Step 3: Install UI dependencies

- Install React Native Reusables components (Button, Input, Badge, Sheet, Slider, Separator)
- Install `@gorhom/bottom-sheet` + `react-native-reanimated` + `react-native-gesture-handler`
- Install `@shopify/flash-list`
- Install `expo-image`
- Install `lucide-react-native` + `react-native-svg`
- Install `@react-native-async-storage/async-storage`
- Configure Reanimated Babel plugin

**Verify:** Each dependency imports without errors. A basic FlashList renders.

### Step 4: Root layout and theme

- Create `app/_layout.tsx` with:
  - `GestureHandlerRootView` (required for bottom sheet and gestures)
  - `BottomSheetModalProvider`
  - Theme provider (dark/light detection via `Appearance.getColorScheme()`)
  - `SafeAreaProvider`
  - Stack navigator configuration (home screen + modal for detail)
- Create `hooks/use-theme.ts` — port from web, replace `matchMedia` with `Appearance` API
- Create `lib/utils.ts` — `cn()` helper

**Verify:** App renders with correct safe area insets. Theme switches between dark and light.

### Step 5: Card data loading

- Create `lib/cards.ts`:
  - Import `galleryData` from `@openrift/shared/data/gallery.json`
  - Import `flattenWithVariants` from `@openrift/shared`
  - Export flattened card list (computed once at module level)
  - Export `getAvailableFilters(cards)` result for filter options
- Verify all 664 cards load and have correct variant annotations

**Verify:** `console.log(cards.length)` outputs 664. Variants are correctly assigned.

### Step 6: Card grid (FlashList)

- Create `components/cards/CardThumbnail.tsx`:
  - `Pressable` wrapping `Expo Image` with blurhash placeholder
  - Card name, ID, rarity badge overlay
  - Domain-based gradient background (for placeholder / loading state)
  - Memoized with `React.memo` for FlashList recycling
- Create `components/cards/CardGrid.tsx`:
  - FlashList with `numColumns={3}` (portrait) or `numColumns={4}` (landscape)
  - `estimatedItemSize` based on column width
  - `renderItem` renders `CardThumbnail`
  - Section headers for set grouping (sticky)
  - `onEndReached` is a no-op (all data is local, no pagination)
- Integrate into `app/index.tsx`:
  - Load cards from `lib/cards.ts`
  - Render `CardGrid` with all cards

**Verify:** All 664 cards render in a scrollable grid. Scrolling is smooth at 60fps. Images load with placeholders.

### Step 7: Filter state hook

- Create `hooks/use-card-filters.ts`:
  - `useReducer` with actions: `setSearch`, `toggleFilter`, `setRange`, `setSortBy`, `setSortDir`, `clearAll`
  - State shape matches `CardFilters` from `@openrift/shared`
  - Apply `filterCards()` and `sortCards()` from shared to produce filtered results
  - Memoize filtered results with `useMemo`
- Create `hooks/use-debounce.ts` — port from web (identical logic)
- Create `hooks/use-search-scope.ts` — port from web, replace `localStorage` with `AsyncStorage`

**Verify:** Programmatically setting filters reduces the card count. Sort order changes.

### Step 8: Search bar

- Create `components/filters/SearchBar.tsx`:
  - `TextInput` with search icon, clear button
  - Scope selector (dropdown or modal) for search fields
  - Debounced 200ms before updating filter state
  - Supports prefix syntax (n:, d:, k:, t:, a:, id:) via `parseSearchTerms()` from shared
- Integrate into `app/index.tsx` above the card grid

**Verify:** Typing "Garen" filters to matching cards. Prefix search `a:artist_name` works. Debounce prevents jank.

### Step 9: Filter bottom sheet

- Create `components/filters/FilterSheet.tsx`:
  - `@gorhom/bottom-sheet` with snap points (30%, 60%, 90%)
  - Sections for each filter category:
    - **Sets** — Multi-select chips
    - **Rarities** — Multi-select chips (colored by rarity)
    - **Types** — Multi-select chips
    - **Supertypes** — Multi-select chips
    - **Domains** — Multi-select chips (colored by domain)
    - **Variants** — Multi-select chips
    - **Energy range** — Dual-thumb slider
    - **Might range** — Dual-thumb slider
    - **Power range** — Dual-thumb slider
  - "Clear filters" button at bottom
  - Filter options populated from `getAvailableFilters()` from shared
- Create `components/filters/MultiSelect.tsx` — Reusable chip selector for sets, rarities, etc.
- Create `components/filters/RangeSlider.tsx` — Dual-thumb slider for stat ranges
- Trigger from filter button in header (badge shows active filter count)

**Verify:** Opening sheet shows all filter options. Selecting a rarity filters the grid. Range sliders constrain energy/might/power. Active filter count badge updates.

### Step 10: Active filter chips

- Create `components/filters/FilterChips.tsx`:
  - Horizontal `ScrollView` of dismissible `Badge` components
  - Each chip shows filter type + value (e.g., "Rarity: Epic")
  - Tap X to remove that filter
  - "Clear all" chip at the end when >1 filter active
- Show between search bar and card grid

**Verify:** Selecting filters shows chips. Dismissing a chip removes that filter. "Clear all" resets everything.

### Step 11: Sort controls

- Create `components/layout/SortMenu.tsx`:
  - Dropdown or action sheet with sort options: ID, Name, Energy, Rarity
  - Direction toggle (asc/desc)
  - Triggered from sort button in header
- Integrate with `use-card-filters` hook

**Verify:** Changing sort reorders the grid. Direction toggle reverses the order.

### Step 12: Card detail screen

- Create `app/card/[id].tsx`:
  - Receives card ID from route params
  - Looks up card in the current filtered list
  - Full-screen modal presentation (Expo Router modal)
  - Scrollable content:
    - Full-width card image (zoomable via `Expo Image` or pinch-to-zoom wrapper)
    - Stats row (energy, might, power)
    - Type / supertype / rarity / domain / set / collector number / variant
    - Keywords, description, effect (with `:rb_*:` glyph rendering)
    - Artist credit
  - Swipe left/right to navigate between cards (pass filtered card list via context or params)
  - Close button + swipe-to-dismiss gesture
  - Share button → native share sheet
- Create `components/cards/CardText.tsx` — port glyph parsing from web, render with `react-native-svg`
- Create `components/cards/CardPlaceholder.tsx` — domain-colored gradient for loading state

**Verify:** Tapping a card opens detail. All card info displays correctly. Swiping navigates. Closing returns to grid with scroll position preserved.

### Step 13: Display settings

- Add settings menu accessible from header:
  - Dark mode toggle (system / light / dark)
  - Show/hide images toggle
  - Card field visibility (ID, title, type, supertype, rarity)
- Persist all settings to AsyncStorage
- Settings apply immediately to card grid

**Verify:** Toggling dark mode switches theme. Hiding images shows placeholders. Field toggles affect thumbnail labels.

### Step 14: Polish and performance

- Profile FlashList performance with 664 cards:
  - Target: 60fps scroll, <100ms filter response
  - Tune `estimatedItemSize`, `drawDistance`, `overrideItemLayout`
  - Verify image caching (Expo Image disk cache) prevents re-downloads
- Add haptic feedback on filter selection (`expo-haptics`)
- Add loading skeleton on initial card data processing
- Handle orientation changes (column count adapts)
- Handle keyboard avoidance in search and filter sheet
- Test on iOS and Android simulators/devices
- Verify all shared package filter logic works identically to web

**Verify:** Lighthouse-equivalent native audit. No dropped frames during scroll. Filters respond instantly.

### Step 15: Build and distribution

- Configure `app.json` / `app.config.ts` with:
  - App name: "OpenRift"
  - Bundle identifiers: `app.openrift.mobile` (iOS), `app.openrift.mobile` (Android)
  - App icon and splash screen
  - Required permissions (none for v1 — no camera, location, etc.)
- Set up EAS Build (`eas.json`) with local build profile (see Section 15 for full workflow)
- Create development builds for iOS Simulator
- Create release builds for TestFlight, built locally on the Mac

**Verify:** App installs and runs on physical devices via TestFlight.

---

## 9. Design Token Mapping

The web app uses CSS variables for theming. The mobile app maps these to Uniwind/NativeWind config:

```
Web CSS variable          → Mobile Tailwind token
--background              → bg-background
--foreground              → text-foreground
--card                    → bg-card
--card-foreground         → text-card-foreground
--primary                 → bg-primary / text-primary
--primary-foreground      → text-primary-foreground
--secondary               → bg-secondary
--muted                   → bg-muted / text-muted-foreground
--border                  → border-border
--ring                    → ring-ring
--destructive             → bg-destructive
```

Both light and dark values must be defined. The mobile theme provider swaps the active palette based on `Appearance.getColorScheme()` or manual override.

Domain-specific colors (for card backgrounds/accents) are the same hex values used in the web app:

| Domain | Color |
|---|---|
| Fury | Red tones |
| Calm | Blue tones |
| Mind | Purple tones |
| Body | Green tones |
| Chaos | Orange tones |
| Order | Yellow tones |
| Colorless | Gray tones |

---

## 10. Key Differences from Web

| Concern | Web | Mobile | Notes |
|---|---|---|---|
| Navigation | Single page, no router | Expo Router (stack + modal) | Detail is a modal screen |
| Filter state | URL query params (nuqs) | React state (useReducer) | No shareable URLs |
| List rendering | CSS grid + virtual scroll | FlashList (cell recycling) | FlashList handles 664+ cards natively |
| Image loading | `<img>` with lazy loading | Expo Image with disk cache | Blurhash placeholders |
| Filter UI | Inline bar (desktop) / Sheet (mobile web) | Always bottom sheet | `@gorhom/bottom-sheet` |
| Active filters | Flex-wrap badges | Horizontal scroll chips | Better for narrow screens |
| Card detail | Side panel (desktop) / Sheet (mobile web) | Full-screen modal | Swipe to navigate |
| Theme | CSS variables + `dark` class | `Appearance` API + context | Same design tokens |
| Deployment | Cloudflare Workers | Local build on Mac → TestFlight / Play Store | OTA updates via EAS Update |
| Offline | Service worker (PWA) | Bundled data (always offline) | Card data ships with the app |

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Uniwind incompatible with React Native Reusables | Medium | Medium | Fall back to NativeWind v4 (API is nearly identical). Test early in Step 2. |
| FlashList sticky headers with set grouping is complex | Medium | Low | Start with a flat list, add sticky headers as enhancement. `SectionList` fallback. |
| Metro bundler can't resolve `@openrift/shared` | Low | High | Well-documented pattern for Expo monorepos. `metro.config.js` watchFolders is the fix. |
| Card images slow to load on mobile networks | Low | Medium | Expo Image disk cache + blurhash placeholders. Images are small thumbnails (~50KB). |
| Swipe-to-navigate conflicts with swipe-to-dismiss | Medium | Low | Use horizontal `FlatList` or pager for card detail navigation; vertical swipe dismisses. |
| gallery.json bundled in app increases binary size | Low | Low | JSON is ~1.5MB uncompressed, ~300KB gzipped. Acceptable for v1. |

---

## 12. Development Workflow

The Mac acts as a headless build machine on your local network. You write code on your main computer and SSH into the Mac only for iOS-specific tasks.

### Architecture

```
┌──────────────────────────┐        SSH / Screen Sharing       ┌─────────────────────────┐
│   Main machine (any OS)  │ ◄───────────────────────────────► │   Mac (build machine)   │
│                          │                                    │                         │
│  - Write code in editor  │        LAN (same WiFi)            │  - Xcode + Simulator    │
│  - Git commit & push     │ ◄───────────────────────────────► │  - Local iOS builds     │
│  - Run Expo dev server   │    Expo Go / Simulator connects   │  - TestFlight uploads   │
│    (pnpm dev:mobile)     │    to dev server over network     │  - Code signing         │
│                          │                                    │                         │
└──────────────────────────┘                                    └─────────────────────────┘
```

### Daily development (writing code + live preview)

All from your main machine — no SSH needed:

```bash
# 1. Start the Expo dev server on your main machine
pnpm dev:mobile
# Prints: Metro waiting on exp://192.168.1.50:8081

# 2. Preview on a physical iPhone (easiest)
#    Open Expo Go app → scan the QR code (same WiFi network)
#    Changes hot-reload instantly as you edit code

# 3. Or preview on iOS Simulator (requires Mac)
#    SSH into the Mac and launch the Simulator:
ssh your-mac.local "open -a Simulator"
#    Then press 'i' in the Expo terminal on your main machine
#    (or open the Expo URL in Simulator's Safari)
```

**When you need to SEE the Simulator UI:**
- Use macOS Screen Sharing (VNC built-in): connect from your main machine via `vnc://your-mac.local`
- Or use a VNC client if on Linux/Windows

**When you don't need to see it** (e.g., running builds):
- Plain SSH is enough

### When each approach is useful

| Task | Where | Mac needed? |
|---|---|---|
| Write code, edit components | Main machine | No |
| Hot-reload preview | Expo Go on iPhone | No |
| Test in iOS Simulator | SSH + Screen Sharing to Mac | Yes |
| Run native iOS build | SSH to Mac | Yes |
| Build for TestFlight | SSH to Mac | Yes |
| Upload to TestFlight | SSH to Mac | Yes |
| Run Android emulator | Main machine (or Mac) | No |

---

## 13. Build and Release Workflow

All iOS builds run locally on the Mac. No cloud build service needed.

### Development build (for Simulator testing)

```bash
# SSH into the Mac
ssh your-mac.local
cd ~/openrift && git pull

# Generate native iOS project
npx expo prebuild --platform ios

# Build and run on Simulator
npx expo run:ios
```

### Release build (for TestFlight)

```bash
# SSH into the Mac
ssh your-mac.local
cd ~/openrift && git pull

# Option A: EAS local build (recommended — handles signing automatically)
eas build --platform ios --local --profile preview
# Outputs: ~/openrift/build-xxx.ipa

# Upload to TestFlight
eas submit --platform ios --path ./build-xxx.ipa

# Option B: Manual Xcode build (more control, same result)
npx expo prebuild --platform ios
xcodebuild -workspace apps/mobile/ios/OpenRift.xcworkspace \
  -scheme OpenRift \
  -configuration Release \
  -archivePath build/OpenRift.xcarchive \
  archive
xcodebuild -exportArchive \
  -archivePath build/OpenRift.xcarchive \
  -exportPath build/ \
  -exportOptionsPlist ExportOptions.plist
xcrun altool --upload-app -f build/OpenRift.ipa \
  -t ios -u your@apple-id.com -p app-specific-password
```

### EAS Build profiles (`eas.json`)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "credentialsSource": "local",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "credentialsSource": "local",
      "ios": { "resourceClass": "m-medium" }
    },
    "production": {
      "autoIncrement": true,
      "credentialsSource": "local"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@apple-id.com",
        "ascAppId": "your-app-store-connect-app-id",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

All three profiles work with `--local` flag (builds on the Mac, not in the cloud).

### Code signing

iOS apps must be signed with an Apple-issued certificate before they can run on real devices or be uploaded to TestFlight. The signing chain:

```
Apple Developer Program ($99/yr)
  └── issues a distribution certificate (key pair)
        └── provisioning profile links:
              ├── your certificate (who you are)
              ├── your bundle ID (app.openrift.mobile)
              └── distribution method (TestFlight / App Store)
                    └── Xcode signs the .ipa
                          └── iPhone verifies signature before installing
```

**Credential management: local-only (keys never leave the Mac).**

All build profiles use `credentialsSource: "local"` — EAS reads the signing certificate from the Mac's Keychain at build time and never uploads it to Expo's servers. This means:

- Your private keys stay on the Mac, not on a third-party server
- If the Mac is lost, revoke the old certificate and create a new one in the Apple Developer portal (takes 5 minutes, no downtime — existing TestFlight/App Store builds keep working)
- Back up the `.p12` export of your certificate to a password manager for disaster recovery

**First-time setup (on the Mac):**

```bash
# 1. EAS prompts you to log in to your Apple Developer account
eas build --platform ios --local --profile preview

# 2. When asked "How would you like to manage credentials?":
#    Select "I want to provide my own credentials"
#    Or it reads from Keychain automatically if Xcode has already set up signing

# 3. Export a backup of the certificate (one-time)
#    Keychain Access → My Certificates → export .p12
#    Store in password manager
```

After the first build, subsequent builds find the certificate in Keychain automatically.

### Why local builds over cloud EAS

| | Local Mac builds | EAS Build (cloud) |
|---|---|---|
| **Cost** | Free forever | Free tier: 30/month, then $99/mo |
| **Speed** | Depends on Mac age, but no queue wait | ~10-15 min, may queue on free tier |
| **Signing keys** | Stay on the Mac (Keychain) | Uploaded to Expo's servers (encrypted) |
| **Network** | Only for git pull + TestFlight upload | Uploads full source to Expo servers |
| **Privacy** | Code + keys stay on your machines | Code + keys sent to Expo cloud |
| **CI/CD** | Manual (SSH) or scripted | GitHub Actions integration available |

**Recommendation:** Use local Mac builds for everything. Keep signing keys local with `credentialsSource: "local"` and back up the `.p12` to a password manager. Consider cloud EAS only if you later set up CI/CD via GitHub Actions (where there's no Mac available).

---

## 14. Future Considerations (post-v1)

These are explicitly out of scope for the initial build but inform architectural decisions:

- **Backend integration**: When the Hono API is built, the mobile app will use `fetch` with Bearer token auth (not cookies). Abstract the data source behind a provider so swapping from static JSON to API is a single-file change.
- **Collection tracking**: Add screens for "My Collection" and deck building once auth exists.
- **Deep linking**: Expo Router supports deep links. A `openrift://card/RB-042` scheme can open the card detail directly.
- **OTA updates**: EAS Update allows pushing JS bundle updates without App Store review. Wire this up early for fast iteration.
- **Tablet layout**: Two-column layout with card grid on left, detail on right (like iPad split view). FlashList supports `numColumns` changes, so this is mostly a layout concern.
- **Widgets**: iOS widgets showing random card of the day or collection progress.
- **CI/CD**: GitHub Actions with `eas build` (cloud) for automated builds on push to main. Only needed once the manual local workflow becomes a bottleneck.

---

## 15. Dependencies (new for `apps/mobile`)

```
# Core
expo ~53.x
expo-router ~4.x
react-native
react ~19.x
typescript ~5.9.x

# Styling
uniwind (or nativewind ~4.x as fallback)
tailwindcss ~4.x

# UI
react-native-reusables
@gorhom/bottom-sheet ~5.x
react-native-reanimated ~3.x
react-native-gesture-handler ~2.x
react-native-safe-area-context
react-native-screens

# Lists & Images
@shopify/flash-list ~1.x
expo-image ~2.x

# Icons
lucide-react-native
react-native-svg

# Storage
@react-native-async-storage/async-storage

# Haptics
expo-haptics

# Build & Distribution
eas-cli (global install on Mac)

# Shared (workspace dependency)
@openrift/shared workspace:*
```

---

## 16. Success Criteria

The mobile app is ready for TestFlight/internal testing when:

1. All 664 cards render in a scrollable grid at 60fps
2. All filters from the web app work identically (search, sets, rarities, types, supertypes, domains, energy/might/power ranges, variants)
3. Card detail shows all card information with glyph rendering
4. Dark mode works with system detection and manual toggle
5. App works fully offline (bundled card data)
6. No crashes on iOS 17+ and Android 13+
7. App binary size < 30MB
8. Cold start < 2 seconds on mid-range devices
9. `eas build --local` produces a valid `.ipa` on the Mac
10. TestFlight upload succeeds via `eas submit`
