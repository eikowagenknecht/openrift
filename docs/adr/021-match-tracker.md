---
status: accepted
date: 2026-06-06
---

# ADR-021: Local Match Tracker for Points and XP

## Context and Problem Statement

OpenRift is a card-collection browser, but the people using it are also _playing_ Riftbound. During a live game, players need to track two things by hand: the points each player has scored toward winning (first to 8 in a 1v1, 11 in team play, see `apps/web/src/components/help/articles/how-to-play.tsx`) and the XP each player has accumulated and spends as an in-game resource. Today that means dice, scrap paper, or a generic life-counter app that doesn't know Riftbound's win threshold.

We want a small, mobile-first match tracker: a digital scorepad that two to four players share on one device passed around the table. It tracks each player's points and XP, knows when someone has hit the points target, and offers the table-stakes helpers (rename players, pick who goes first). It must work with no account and no network: you pull out your phone mid-game and it just runs.

This is a tool surface, not a data feature. It is closest in spirit to `/pack-opener`: a standalone, client-only route with no server involvement. It is explicitly not match history, stats, or account progression, see "Out of scope."

## Decision Drivers

- The tool is used mid-game, often offline (a friend's kitchen table, a game store with bad signal). Network or login dependence would kill it.
- It is shared on one device and passed around or laid flat between players, so the layout has to be readable from more than one side.
- Riftbound's win condition is a known number (8 / 11), so the tool can do better than a dumb counter: it can announce the winner.
- It must stay small. The value is in being instant and frictionless, not feature-rich. Scope creep (online sync, stats, arbitrary counters) would slow the thing that needs to be fast.
- It has to obey the repo's existing conventions for client state and re-render behavior (Zustand persisted stores, per-row selector subscriptions, React Compiler, hydration-safety) so it doesn't become a special case.

## Considered Options

**State & persistence**

- **Zustand store with the `persist` middleware → `localStorage`** (chosen). Matches ADR-006 and the existing persisted stores (`sidebar-fold-store`, `deck-list-prefs-store`, `theme-store`). In-progress games survive a reload for free.
- React `useState` + hand-rolled `localStorage` read/write. Rejected: reinvents what `persist` already gives us, and `useState` in the parent would defeat the per-player selector pattern below.
- Server-backed (DB table + API). Rejected by the persistence decision (local-only): adds login, network, migrations, and repositories for a tool whose whole point is working offline with zero setup.

**Per-cell re-render strategy**

- **Per-player selector subscriptions** (chosen). Each player panel subscribes to its own slice of the store; the parent maps only over a stable array of player ids. This is the repo's mandated pattern for `.map()` closures over changing state (cf. `rules-fold-store` + `RuleRow`).
- Single parent component holding all player state and prop-drilling into panels. Rejected: every counter tap would re-run the whole `.map()` and re-render all panels, exactly the anti-pattern the convention exists to prevent.

**Counter model**

- **Fixed Points + XP per player** (chosen for v1). Two well-understood counters, no configuration surface to design.
- Generic user-defined counters (add/name/remove arbitrary counters). Rejected for v1: speculative complexity. Energy/Runes/Might tracking and custom counters are a clean follow-up if demand appears.

**Layout**

- **Tabletop-oriented layout, opposing panels rotated to face each player** (chosen). The device is shared; panels must read upright from each player's seat.
- Uniform single-orientation grid. Rejected: the user explicitly wants players to read their own counters right-side-up across the table.

**Surface**

- **Standalone client-only route** (chosen), `/match-tracker`, registered in the header "Tools" menu alongside Promos and Pack opener.
- Embed in decks or profile. Rejected by the standalone-route decision; the tool is game-time, not collection-time.

## Decision Outcome

We ship a standalone, client-only `/match-tracker` route backed by a single persisted Zustand store. It renders 2–4 rotated per-player panels, each tracking Points (win condition) and XP (resource), with by-player-count default targets, automatic winner detection, editable names, and first-player / coin / dice helpers. No undo, no network, no account.

### Behaviour

- **Players:** 2–4. Player count is chosen in a lightweight setup step; players can be renamed (inline and at setup). Default names are "Player 1"…"Player N".
- **Points** (the win condition): integer, floor 0, prominent. `±1` controls. When a player's points reach the target, the game enters a `finished` state and announces the winner; the announcement is dismissible so the table can keep adjusting (e.g. to correct a misclick) and either start a new game or continue.
- **XP** (the in-game resource): integer, floor 0, no cap, accumulated and spent. Secondary visual weight to points. `±1` controls.
- **Points target:** configurable per game. Default is chosen by player count: 8 for 2 players, 11 for 3–4 players (team-play threshold), editable before/during the game.
- **Helpers:** random first-player picker, coin flip, and die roll, surfaced from a small helpers control.
- **Reset / new game:** one action returns to setup / a fresh game. No undo in v1.
- **Persistence:** the current game (status, players, counters, target, first player) is auto-saved to `localStorage` and restored on reload. "New game" clears it.

### Layout

The panels are oriented for a shared device:

- **2 players:** portrait, stacked vertically; the opponent's (top) panel is rotated to face them across the device (≈180°, the user suggested ~130°; the exact angle is a visual detail to tune against real device-on-table viewing during implementation), the near (bottom) panel upright.
- **3–4 players:** landscape; players split onto two opposing sides of the screen (2 on one long edge, the remaining 1–2 on the other). The far side is rotated 180° so each side reads upright. The UI should nudge toward landscape for 3–4 players and degrade gracefully if held in portrait.

### Consequences

- Good, because it works offline with zero setup: no login, no migrations, no API, no repositories. Pure client feature.
- Good, because it knows Riftbound's win threshold, so it announces winners instead of just counting.
- Good, because it reuses the established persisted-Zustand + per-player-selector patterns, so it isn't a special case and survives reloads.
- Good, because it's a small, focused surface that ships like `/pack-opener` (split route, `noIndex`, Tools-menu entry).
- Bad, because local-only means a game is tied to one browser: clearing site data or switching devices loses the in-progress game. Acceptable: a live game is ephemeral by nature.
- Bad, because the rotated multi-player layout (especially 3–4p landscape) is non-trivial CSS and the rotation angle needs real-device tuning. Mitigated by shipping 2-player first if needed and treating the angle as a visual detail, not a blocker.
- Neutral, because no undo ships in v1: if counter mis-taps prove annoying in practice, multi-step undo (a logged action history) is an additive follow-up, and the store shape leaves room for it.

## Design Decisions

### Store shape

A single persisted Zustand store (e.g. `apps/web/src/stores/match-tracker-store.ts`, persist key namespaced like the others, e.g. `openrift-match-tracker`):

```ts
type GameStatus = "setup" | "playing" | "finished";

interface TrackedPlayer {
  id: string; // stable id, generated at game start
  name: string;
  points: number; // floor 0
  xp: number; // floor 0, no cap
}

interface MatchTrackerState {
  status: GameStatus;
  players: TrackedPlayer[]; // length 2–4
  pointsTarget: number; // default by player count: 8 (2p) / 11 (3–4p)
  firstPlayerId: string | null;
  winnerId: string | null;

  startGame(playerCount: number): void; // seeds players, applies default target
  renamePlayer(id: string, name: string): void;
  adjustPoints(id: string, delta: number): void; // clamps to >=0; sets finished/winnerId on reaching target
  adjustXp(id: string, delta: number): void; // clamps to >=0
  setPointsTarget(target: number): void;
  pickFirstPlayer(): void; // random over current players
  newGame(): void; // back to setup, clears persisted game
}
```

Coin flip and die roll are stateless helpers (they don't need to persist) and can live in the component or a small util; only durable game state belongs in the store.

### Re-render isolation

Per the repo's `.map()`-closure convention: the parent maps over a stable array of player ids and renders `<PlayerPanel id=… />`. Each `PlayerPanel` subscribes via a selector to only its own player slice and the (stable) action refs, so a tap on one panel re-renders only that panel. The parent's `.map()` callback closes only over stable references, so the React Compiler keeps it cached. Mirror `rules-fold-store` + the `RuleRow` subscriptions in `rules-page.tsx`.

### Hydration safety

`persist` reads `localStorage`, which is unavailable during SSR; rendering store-derived state on the server would mismatch on hydration. Because the route's entire payload is client state, gate the component mount behind `useHydrated()` (`if (!hydrated) return null;`), following the pattern in `apps/web/src/routes/_app/cards.lazy.tsx`. Do not introduce a parallel `useState`+`useEffect` variant.

### Route & navigation

Split route like `/pack-opener`:

- `apps/web/src/routes/_app/match-tracker.tsx`: `createFileRoute`, `seoHead({ … noIndex: true })` (a tool, not indexable content), no server loader needed.
- `apps/web/src/routes/_app/match-tracker.lazy.tsx`: `createLazyFileRoute`, mounts the page component.
- Add a "Match tracker" entry to the Tools menu in `apps/web/src/components/layout/header.tsx`, next to Pack opener, with a suitable lucide `*Icon`.

### Conventions to honour

- **React Compiler:** no `useMemo` / `useCallback` / `React.memo`.
- **Icons:** lucide with the `Icon` suffix (`PlusIcon`, `MinusIcon`, `RotateCcwIcon`, `TrophyIcon`, dice/coin icons, etc.).
- **Styling:** Tailwind + `cn()`, theme CSS variables, type scale from `docs/typography.md` (no invented sizes).
- **UI primitives:** BaseUI / shadcn `base-nova`, not Radix. Pass `items` to any `<Select.Root>`.
- **Tests (required):** `match-tracker-store.test.ts` using `createStoreResetter()` in `beforeEach`/`afterEach`. Cover: `startGame` seeds the right player count and default target; rename; points clamp at 0; XP clamp at 0 with no cap; win detection when points reach the target (status → `finished`, `winnerId` set); default-target-by-player-count (8 vs 11); `pickFirstPlayer` returns an id within the current players; `newGame` resets to `setup` and clears state.
- **Changelog:** add a `feat:` entry to `apps/web/src/CHANGELOG.md` (e.g. "Track points and XP for 2–4 players during a game, right from your phone").

## Out of Scope (explicit non-goals for v1)

- Server persistence, accounts, cross-device sync.
- Online multiplayer / real-time shared sessions across devices.
- Match history, statistics, or account/XP progression over time.
- Energy / Runes / Might tracking, or generic user-defined counters.
- Undo / action history.

Each is an additive follow-up that the chosen store shape and route structure leave room for, without committing to it now.
