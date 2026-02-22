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

## Phase 3: Deployment — DONE

- [x] `wrangler.json` for Cloudflare Workers (static assets mode)
- [x] Deployed to `openrift.app`

## Phase 4: Shared Package — DONE

- [x] Card types (`types.ts`) — based on Riftbound gallery data
- [x] Zod schemas (`schemas.ts`) — validate card data JSON
- [x] Filter logic (`filters.ts`) — `filterCards`, `getAvailableFilters`, `sortCards`
- [x] Real card data (`data/gallery.json`) — 664 cards across 3 sets, scraped from Riftbound gallery

## Phase 5: Web App — Tailwind + shadcn/ui Setup — DONE

- [x] Install Tailwind CSS v4
- [x] Install and configure shadcn/ui
- [x] Set up dark mode (CSS variables, system preference detection)
- [x] Base layout (header, footer with legal disclaimer)

## Phase 6: Web App — Card Browser UI — DONE

- [x] Card grid (responsive: 2/3-4/5-6 columns)
- [x] Card thumbnails with lazy loading + shimmer placeholders
- [x] Card detail sheet (shadcn/ui Sheet — side panel on desktop, slide-up on mobile)
- [x] Filter bar (search, set, rarity, type, supertype, domain, energy, might, power, variants)
- [x] URL-synced filter state via nuqs
- [x] Sort controls (name, ID, energy, rarity)
- [x] Active filter badges + "Clear all" button
- [x] Results count display

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
