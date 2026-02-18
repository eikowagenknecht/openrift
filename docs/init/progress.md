# OpenRift — Build Progress

## Phase 1: Monorepo Scaffolding — DONE

- [x] Turborepo + pnpm workspaces (`pnpm-workspace.yaml`, `turbo.json`)
- [x] `apps/web` — Vite 7 + React 19 + TypeScript 5.9 + SWC (scaffolded via `create-vite`)
- [x] `packages/shared` — skeleton with TypeScript, exports `@openrift/shared`
- [x] All dependency versions pinned (no `^` or `~`)
- [x] `.npmrc` with `auto-install-peers` and `manage-package-manager-versions`

## Phase 2: Tooling & DX — DONE

- [x] **oxlint** — primary linter with plugins (jsdoc, import, typescript, oxc, unicorn, react, react-perf)
- [x] **oxfmt** — primary formatter with import sorting enabled
- [x] **ESLint** — scoped to `react-compiler` plugin only (in `apps/web`)
- [x] **lefthook** — pre-commit: typecheck → oxlint → eslint → oxfmt; commit-msg: commitlint
- [x] **commitlint** — conventional commit enforcement
- [x] **Dependabot** — weekly grouped dependency update PRs

## Phase 3: Deployment & API Access — DONE

- [x] `wrangler.json` for Cloudflare Workers (static assets mode)
- [x] Deployed to `openrift.eikowagenknecht.com`
- [x] `riot.txt` domain verification file
- [x] Riot API application submitted via Developer Portal
- [ ] Waiting for Riot API approval (standard dev keys return 403 for Riftbound)

## Phase 4: Shared Package — TODO

- [ ] Card types (`types.ts`) — based on Riot's documented API format
- [ ] Zod schemas (`schemas.ts`) — validate card data JSON
- [ ] Filter logic (`filters.ts`) — `filterCards`, `getAvailableFilters`, `sortCards`
- [ ] Mock card data (`data/cards.json`, `data/sets.json`) — 20-30 cards across 2 sets
- [ ] Fetch script (`scripts/fetch-cards.ts`) — Riot API → normalized JSON

> **Note:** Types are based on Riot's documentation and will be adjusted once we have real API access.

## Phase 5: Web App — Tailwind + shadcn/ui Setup — TODO

- [ ] Install Tailwind CSS v4
- [ ] Install and configure shadcn/ui
- [ ] Set up dark mode (CSS variables, system preference detection)
- [ ] Base layout (header, footer with legal disclaimer)

## Phase 6: Web App — Card Browser UI — TODO

- [ ] Card grid with TanStack Virtual (responsive: 2/3-4/5-6 columns)
- [ ] Card thumbnails with lazy loading + shimmer placeholders
- [ ] Card detail sheet (shadcn/ui Sheet — side panel on desktop, slide-up on mobile)
- [ ] Filter bar (search, set, rarity, type, faction, cost)
- [ ] URL-synced filter state via nuqs
- [ ] Sort controls (name, collector number, cost, rarity)
- [ ] Active filter badges + "Clear all" button
- [ ] Results count display

## Phase 7: Mobile App (Expo) — TODO

- [ ] Scaffold `apps/mobile` with Expo (SDK 53+) + Expo Router
- [ ] Uniwind (or NativeWind fallback) for Tailwind styling
- [ ] React Native Reusables for UI components
- [ ] Card browser screen with FlashList grid
- [ ] Filter bottom sheet
- [ ] Card detail screen (full-screen modal, swipe navigation)
- [ ] Dark mode support

## Phase 8: Polish & Deploy — TODO

- [ ] Lighthouse audit (target 90+ performance, accessibility)
- [ ] Mobile performance testing (60fps with 500+ cards)
- [ ] Final Cloudflare Workers deployment
- [ ] Update fetch script once Riot API access is granted
- [ ] Replace mock data with real card data
