---
status: accepted
date: 2026-06-08
---

# ADR-022: FFA Pod Pairing for Multiplayer Tournaments

## Context and Problem Statement

Riftbound is played one-on-one, but it is also played as a free-for-all (FFA) multiplayer format where three or four players share a table and fight for placement. There is no good tool to run a Swiss-style FFA event: an organizer who wants fair pods round after round currently does it by hand on paper or in a spreadsheet, juggling who has played whom, who keeps landing in the smaller three-player pods, and who is on a similar record.

We want a **pod-tournament runner** inside OpenRift. The organizer (a logged-in OpenRift account) creates a tournament, adds a roster of free-text players, and each round the software splits the active players into three- and four-player **pods**. A pod is one game group. The split has to be _fair_: players on a similar record play each other, the same players do not keep meeting, the three-player pods are spread around, and nobody floats too far from their score group. After each round, results are entered (placement per player), scores and opponent history update, and the next round pairs off the new standings.

The non-trivial part is the pairing itself. A pod that looks good on its own can force bad or impossible pods out of the players left over, so the software must evaluate the **whole round at once**, score every candidate full-round pairing with a penalty function, and pick the lowest-penalty one. This ADR decides where that lives in OpenRift, how the data is modeled, how the pairing engine is structured, and what ships in v1.

The closest precedent in the repo is **ADR-021 (Match Tracker)**, a game-time scorepad, but that one is deliberately client-only and single-game. A pod tournament is multi-round and persistent (scores and opponent history must survive across rounds and devices), so it is a server-backed feature modeled on **ADR-013 (Friend Groups)**: an owner who is an account, child rows scoped to that owner, a nullable share token for unauthenticated access.

## Decision Drivers

- **The pairing must be evaluated per whole round, not greedily pod-by-pod.** This is the explicit requirement: a locally good first pod can wreck the rest of the round. The engine scores complete round pairings and minimizes a penalty total.
- **Penalty priority is fixed by the spec.** In order of weight: produce _a valid pairing_ at all, avoid rematches, group similar scores, spread three-player pods, minimize floats, and only then break ties at random. Rematch penalties must dominate score-spread penalties so the engine never trades a rematch for a slightly tighter pod.
- **State is multi-round and must persist.** Scores, opponent counts, and three/four-pod tallies accumulate across rounds and have to survive a reload, a second organizer device, and a closed laptop. That rules out the client-only `localStorage` model and points at the server-backed Friend Groups shape.
- **Only the organizer needs an account; players do not.** The creator is an OpenRift user who owns the tournament. Players are free-text entries with no login, exactly like ADR-014's `player_name`. Result entry can additionally be delegated to anonymous participants through a share link.
- **Use a bounded local-search heuristic, not brute force.** Enumerating every valid pairing to pick the provable optimum explodes super-exponentially (NP-hard set partitioning), and a tournament needs a good pairing, not a provably-optimal one. Local search (the spec's Variante B: construct, then improve by swaps, with random restarts) runs in milliseconds at any field size. The engine sits behind a thin strategy interface so an exact small-field solver could be added later without touching callers.
- **Reuse the established server-feature wiring.** Migrations registered in the barrel, repository factories on the Hono context, zod schemas in `packages/shared`, server functions plus suspense queries in the web app, slug plus nullable share token. No new architectural patterns.
- **Stay lean for v1.** Ship the engine, results, standings, drops, and the anonymous-report link. Defer manual pairing edits, the warning system, configurable scoring weights, seed-based round one, and standings tie-breakers.

## Considered Options

**Where the tournament state lives**

- **Server-backed, owner is an account, players are free-text (chosen).** New tables, repository, API, web routes, modeled on Friend Groups. Survives reloads and devices; supports the anonymous-report share link.
- Client-only, `localStorage`, like the Match Tracker. Rejected: multi-round accumulating state on one browser is fragile, and there is no way to hand a result-entry link to the table.
- Server-backed but players are real OpenRift accounts. Rejected: forces every participant to have a login and re-introduces the player-identity and claim machinery ADR-014 deliberately avoided.

**How the pairing is computed**

- **Bounded local search behind a `PairingStrategy` interface (chosen).** Construct a pairing, improve it with whole-round swaps, restart a few dozen times from randomized starts, keep the best. Milliseconds at any field size, no size cap. This is the spec's Variante B.
- Exhaustive enumeration of every pairing (provably optimal). Rejected as the v1 default: it explodes (~2.6 million pairings at 16 players, billions at 20), forces multi-second synchronous compute near the limit, and is NP-hard to scale. Kept as a possible future exact strategy for tiny fields behind the same seam.
- Greedy pod-by-pod assignment. Rejected outright: violates the core requirement to evaluate the whole round.

**Where the engine code lives**

- **Pure engine in `packages/shared/src/pairing/`, DB orchestration in an `apps/api` service (chosen).** Mirrors how card filter/sort logic lives in shared and is unit-tested without a database. The web app can later import the same pure functions to preview a manual edit's penalty.
- Engine inside the API only. Rejected: loses the no-DB unit-test surface and the future client-side preview.

**Who may enter results**

- **Organizer plus anonymous report link (chosen).** The owner can always enter results; a per-tournament share token opens a result-entry surface for the table. The organizer **finalizes** a round, which is the single moment scores and history commit. Anonymous entries are drafts until then.
- Organizer only. Rejected: the user explicitly wants participants to enter their own pod's result.
- Full anonymous co-management (anyone with the link adds players, triggers pairings). Rejected: too large a write surface and too weak an access control for v1.

## Decision Outcome

Chosen: **a server-backed pod-tournament runner under a shared `/tournaments` hub (the runner at `/tournaments/run`), owned by an OpenRift account, with free-text players, a pure local-search pairing engine in `packages/shared` behind a strategy interface, an `apps/api` service plus repository that loads state, runs the engine, and persists each round in a transaction, and a token-gated participant surface (read-only follow-along plus result entry for any pod in the open round). The organizer finalizes each round, which is the gate that turns drafts into counted results; standings, opponent history, and pod-size tallies are derived on read from the finalized rounds (the lean model — see "Data model"), so finalize is just a status flip and there is no denormalized state to keep in sync.**

### v1 scope (lean core plus the report link)

In:

- Create / rename / delete a tournament (owner).
- Manage a free-text player roster; drop a player (excluded from the next round, results retained).
- Automatic three/four-pod size decomposition.
- Round 1: random pairing that respects the required pod sizes.
- Round 2+: penalty-minimizing pairing via bounded local search (milliseconds, no size cap).
- Enter results with a 1..N placement selector per player (ties allowed); points derived from placement.
- Token follow-along link: participants report a pod's result (any pod in the open round, trust-on-link) and view read-only standings and current / historical pairings.
- Organizer finalizes a round: scores, opponent history, and three/four-pod tallies commit transactionally.
- Edit any finalized round's results (standings re-derive on read); re-roll an open round before results are entered; add players or drop players mid-tournament (drops apply from the next round).
- Standings table sorted by score.
- Organizer display per pod and per round (scores, three-pod counts, rematches, score spread, penalty).
- Equal-priority responsive UI (desktop and mobile both first-class). The tournament page is tabbed (Pairings / Standings / Players / Settings), reusing the Friend Groups `?tab=` pattern.

Deferred (each is additive and the schema leaves room):

- Manual pairing edits and the post-edit warning system.
- Configurable scoring weights and the reduced three-pod scoring scheme as a live setting (the column exists; v1 uses `standard`).
- Seed-based round 1.
- Standings tie-breakers beyond score (pod wins, average opponent points, game points).
- An exact/optimal solver for tiny fields (the strategy seam is in place; local search already covers every size).
- Co-organizers (multiple owners), per-pod report codes, and a late-joiner catch-up score / bye.
- Top cut, a public (un-tokened, indexable) standings page beyond the token follow-along, export, in-game-points tracking.

### Consequences

- Good, because scores and opponent history persist across rounds and devices; the organizer can close the laptop and reopen the tournament.
- Good, because the engine is a pure module with no database dependency, so the entire penalty function and pod-size logic is unit-tested against the spec's exact numbers.
- Good, because the engine runs in milliseconds at any field size with no size cap, so generating a round is never a multi-second synchronous request.
- Good, because the `PairingStrategy` seam keeps an exact small-field solver an additive option (a new file), not a rewrite of the callers.
- Good, because it reuses Friend Groups' wiring end to end (migration barrel, repo factory, server functions, slug plus token), so it is not a special case.
- Good, because the anonymous-report link lets the table enter its own results without anyone else needing an account.
- Bad, because local search does not _prove_ it found the best pairing; it returns the best of its restarts. Mitigated because the penalty landscape is easy (rematches dominate), so a few dozen restarts reach the optimum or something indistinguishable for these field sizes, and the work is bounded to milliseconds regardless of size.
- Bad, because anonymous writes are trust-on-link: anyone with the token can overwrite a pending pod result. Mitigated because results are drafts until the organizer finalizes the round, so a wrong number is visible and correctable before it counts, and the token is rotatable / disable-able.
- Good, because the lean model stores no denormalized player aggregates and no opponent table: standings, pod tallies, rounds played, and opponent counts are derived on read from the finalized rounds (the result rows are the single source of truth). At tournament scale that read is sub-millisecond, so the drift surface and the `recomputeAggregates` machinery the first draft needed are gone, finalize is a status flip, and editing a finalized result is a single-row write that re-derives automatically.

## Design Decisions

### Naming and route namespace (shared `/tournaments` hub)

This runner and ADR-014 (the Tournament Decks Archive) both belong under one **`/tournaments`** home, but they share only the URL namespace and a hub, not a data model: the archive is a public, admin-curated, read-only collection of other people's decklists for meta research, and this runner is a user-owned, write-heavy tool to run your own event. They keep separate tables, repositories, and ownership rules. ADR-014 is adjusted in lockstep (its `/tournaments` index becomes the shared hub; `run` joins its reserved-slug set).

```text
/tournaments                   shared hub: "Browse decks & meta" + "Run a tournament" (public)
── archive (ADR-014) ──
/tournaments/decks             cross-event deck browser
/tournaments/meta              meta stats
/tournaments/$slug             an archived event   (slug not in {decks, meta, run, new, admin})
/tournaments/$slug/$shareToken an archived deck
── runner (this ADR) ──
/tournaments/run               your tournaments + "Create"            (authenticated)
/tournaments/run/$id           a tournament you manage (tabbed)       (authenticated, owner only)
/tournaments/run/report/$token participant follow-along + result entry (public, noIndex)
```

The only collision risk (an archived event's `$slug` versus the runner) is removed by putting the entire runner under the reserved `/tournaments/run/` segment, so the archive's slug space and the runner never meet. **The runner does not use user-defined slugs at all: a tournament is identified by its `uuidv7` id** (decided during implementation; simpler than a slug, and no collisions or reserved words to police). A uuid id never collides with the `report` sub-route. Each tournament carries a nullable `report_token` (12-char base62 from `generateShareToken()`), enabled / rotated / disabled by the owner exactly like a friend group's `code`; the token authorizes the participant surface.

Table names keep the `pod_` prefix (`pod_tournaments`, etc.) precisely so they never collide with ADR-014's `tournaments` / `tournaments_decks`. The web URL says `tournaments/run`; the tables say `pod_`; that mismatch is intentional and harmless.

### Pod-size decomposition

`determinePodSizes(playerCount)` returns the number of four- and three-player pods. The rule: maximize four-player pods, then minimize three-player pods, never produce a two- or five-player pod. Concretely, find the largest `fours` such that `(playerCount - 4 * fours)` is non-negative and divisible by 3; `threes` is the remainder over 3.

`{3, 4}` is a numerical semigroup whose only unrepresentable counts are **1, 2, and 5** (the Frobenius number of {3,4} is 5). So the function has a solution for every active-player count except 1, 2, and 5. For those three it returns no decomposition and the API surfaces a clear error ("a round needs at least 3 active players, and 5 cannot be split into 3s and 4s; add or drop a player"). Bye handling is deferred.

Worked checks (these become test cases):

```text
8  -> 2x4            12 -> 3x4
9  -> 3x3            13 -> 1x4 + 3x3
10 -> 1x4 + 2x3      14 -> 2x4 + 2x3
11 -> 2x4 + 1x3      15 -> 3x4 + 1x3
                     16 -> 4x4
3 -> 1x3   4 -> 1x4   6 -> 2x3   7 -> 1x4 + 1x3
1, 2, 5 -> no valid decomposition (error)
```

### The pairing engine (`packages/shared/src/pairing/`)

A pure, database-free module. Input is a flat snapshot, output is a scored pairing. Nothing in here imports Kysely or touches the network.

```ts
interface PairingPlayer {
  id: string;
  score: number;
  pods3: number; // times already in a 3-player pod
  pods4: number; // times already in a 4-player pod
  opponents: Map<string, number>; // opponentId -> prior meetings
}

interface Pod {
  size: 3 | 4;
  playerIds: string[];
}

interface PodPenaltyBreakdown {
  rematch: number;
  scoreSpread: number;
  imbalance: number; // the >=6 / >=9 surcharges
  float: number;
  threePodRepeat: number;
  total: number;
  rematchPairs: number; // count, for the organizer display
  spread: number; // raw highest-lowest, for the display
}

interface PairingResult {
  pods: Pod[];
  totalPenalty: number;
  perPod: PodPenaltyBreakdown[];
  strategy: "local-search"; // which engine produced it (forward-compat)
}

interface PairingConfig {
  rematchPenalties: [number, number, number, number]; // [0, 1, 2, 3+] meetings
  scoreSpreadWeight: number; // *10
  spreadSurcharge6: number; // +50 at spread >= 6
  spreadSurcharge9: number; // +150 at spread >= 9
  floatWeight: number; // *5
  threePodRepeatPenalties: [number, number, number, number]; // [0,1,2,3+]
  pairwiseScoreWeight: number; // *2, optional finer term; default 0 (off)
}

const DEFAULT_PAIRING_CONFIG: PairingConfig = {
  rematchPenalties: [0, 100, 500, 2000],
  scoreSpreadWeight: 10,
  spreadSurcharge6: 50,
  spreadSurcharge9: 150,
  floatWeight: 5,
  threePodRepeatPenalties: [0, 25, 100, 300],
  pairwiseScoreWeight: 0,
};
```

**`evaluatePairing(pods, players, config)`** implements the spec's penalty function verbatim and returns the per-pod breakdown plus the round total:

- Rematches: for every pair in a pod, look up prior meetings and add `rematchPenalties[min(meetings, 3)]`. This term dominates by construction.
- Score spread: `(max - min) * scoreSpreadWeight`, plus `+50` if spread >= 6 and a further `+150` if spread >= 9.
- Float: per player, `abs(playerScore - podAverage) * floatWeight`.
- Three-pod repeat: per player in a three-player pod, add `threePodRepeatPenalties[min(pods3, 3)]`.
- Optional pairwise score term (off by default).

**Why local search, not brute force.** Splitting `n` players into pods of 3 and 4 to minimize the penalty is a set-partitioning problem; enumerating every split explodes super-exponentially (16 players is ~2.6 million distinct pairings, 20 is ~2.5 billion), and finding the provably-optimal split is NP-hard. A tournament needs a _good_ pairing, not a provably-optimal one, so the engine uses **bounded local search** (the spec's own Variante B). It runs in single-digit milliseconds at any field size, scales without a cap, and still evaluates the _whole round_ at every step (it is not greedy pod-by-pod). The only thing given up versus brute force is the guarantee of the single best pairing, which for these small fields the search finds, or matches, almost every time anyway.

**`LocalSearchStrategy`** (the v1 engine, behind a thin `PairingStrategy` seam so an exact solver could be added later for tiny fields):

```ts
interface PairingStrategy {
  pair(
    players: PairingPlayer[],
    sizes: { fours: number; threes: number },
    config: PairingConfig,
    rng: () => number,
  ): PairingResult;
}

interface LocalSearchBudget {
  restarts: number; // randomized starting orders (e.g. ~30)
  maxSwapsPerRestart: number; // local-improvement steps before stopping (e.g. ~2000)
}
```

The algorithm:

1. **Construct** a starting pairing: order players by score (with a small `rng` shuffle within equal-score bands so restarts differ), then fill the determined pod sizes top to bottom. O(n).
2. **Improve** by local moves: repeatedly try a 2-swap (exchange two players in different pods) or a 3-cycle (rotate three across three pods); compute the penalty _delta_ incrementally from only the touched pods (O(pod size), no full re-score), and keep the move only if the whole-round penalty drops. Stop at a local minimum or `maxSwapsPerRestart`.
3. **Restart** from several randomized constructions and keep the lowest-penalty result. Restarts are what escape local minima; because rematches dominate the penalty, the landscape is easy and a few dozen restarts reliably reach the optimum (or something indistinguishable).

The whole budget (`restarts × maxSwapsPerRestart`, a fixed few-tens-of-thousands of cheap delta evaluations) bounds the work regardless of field size, so a round always pairs in milliseconds. Exact tie-breaking among equal-penalty results uses the injected `rng` (the spec's "pick randomly among equal pairings").

**`generatePairing(players, roundNumber, config, rng, budget?)`** orchestrates: round 1 returns a random valid partition (no scores or history to optimize yet, still respecting the pod sizes); round 2+ runs `LocalSearchStrategy`. The `rng` is injectable so tests are deterministic (default `Math.random`); the `budget` defaults to `DEFAULT_LOCAL_SEARCH_BUDGET` and is overridable.

### Result scoring and ties

Points come from placement, not entered directly. `pointsForPlacements(placements, podSize, scheme)` is a pure function in `packages/shared`. Base points:

```text
4-pod standard: [3, 2, 1, 0]
3-pod standard: [3, 2, 1]
3-pod reduced:  [3, 1.5, 0]   // future scheme; column exists, UI deferred
```

Ties average the points of the positions they span. The spec's worked example, a four-pod finishing 1 / 2= / 2= / 4, yields A=3, the two tied seconds = (2+1)/2 = 1.5 each, D=0. Because of the 1.5s and the reduced scheme, all point columns are SQL `numeric`, not integer.

Placements are read by **order, not by the literal number entered**: group players by their entered placement value, sort the groups ascending, hand each group the next consecutive position slot(s), and average the base points within a tied group. So `[1, 3, 3, 4]` in a four-pod is read as "1st, two tied across the 2nd/3rd slots, 4th" and scores `[3, 1.5, 1.5, 0]`; a gap in the entered numbers never skips a points slot. Every player in a pod must have a placement in `1..podSize` for the pod to count as reported.

### Data model

**Lean model (decided during implementation, deviating from this ADR's first draft).** Five tables, all under one migration `145-pod-tournaments.ts` (registered in `apps/api/src/db/migrations/index.ts`). `uuidv7()` PKs and `timestamptz` defaults follow the house convention. A tournament is tiny (tens of players, single-digit rounds, a few hundred result rows), so the player aggregates and the opponent history are **not stored** — they are derived on read from the finalized rounds, with `pod_members.placement` as the single source of truth. The only stored derived values are the engine's write-once penalty outputs (`pod_rounds.penalty_total`, `pods.penalty_breakdown`), which a randomized search cannot reproduce. Compared with the original six-table draft this drops the `pod_opponents` table and the `pod_players` aggregate columns (`current_score`, `pods3_count`, `pods4_count`, `rounds_played`), drops `pod_members.points_awarded` and `game_points`, removes the `recomputeAggregates` machinery, and reduces finalize to a status flip. Penalties use `double precision` so postgres.js returns a JS number (a `numeric` comes back as a string under Bun).

```sql
-- The event. Owner is an OpenRift account; players are not.
CREATE TABLE pod_tournaments (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),   -- the public identifier (no slug)
  owner_user_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status         text NOT NULL DEFAULT 'setup'
                   CHECK (status IN ('setup', 'running', 'completed')),
  current_round  integer NOT NULL DEFAULT 0,
  scoring_scheme text NOT NULL DEFAULT 'standard'
                   CHECK (scoring_scheme IN ('standard', 'three_pod_reduced')),
  report_token   text UNIQUE,        -- nullable; anonymous result-entry link
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pod_tournaments_owner ON pod_tournaments (owner_user_id);
CREATE UNIQUE INDEX uq_pod_tournaments_report_token
  ON pod_tournaments (report_token) WHERE report_token IS NOT NULL;

-- Free-text participants. No stored aggregates — score, pod tallies, rounds
-- played, and opponent counts are derived on read from the finalized rounds.
CREATE TABLE pod_players (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  tournament_id  uuid NOT NULL REFERENCES pod_tournaments(id) ON DELETE CASCADE,
  display_name   text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'dropped')),
  dropped_after_round integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pod_players_tournament ON pod_players (tournament_id);

CREATE TABLE pod_rounds (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  tournament_id  uuid NOT NULL REFERENCES pod_tournaments(id) ON DELETE CASCADE,
  round_number   integer NOT NULL CHECK (round_number > 0),
  status         text NOT NULL DEFAULT 'reporting'
                   CHECK (status IN ('reporting', 'finalized')),
  penalty_total  double precision NOT NULL,   -- engine output (write-once)
  pairing_strategy text NOT NULL,             -- 'random' (round 1) or 'local-search'
  created_at     timestamptz NOT NULL DEFAULT now(),
  finalized_at   timestamptz,
  UNIQUE (tournament_id, round_number)
);
CREATE INDEX idx_pod_rounds_tournament ON pod_rounds (tournament_id);

CREATE TABLE pods (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  round_id       uuid NOT NULL REFERENCES pod_rounds(id) ON DELETE CASCADE,
  pod_number     integer NOT NULL CHECK (pod_number > 0),
  size           integer NOT NULL CHECK (size IN (3, 4)),
  penalty_breakdown jsonb NOT NULL,   -- the engine's PodPenaltyBreakdown (write-once)
  result_status  text NOT NULL DEFAULT 'pending'
                   CHECK (result_status IN ('pending', 'reported')),
  UNIQUE (round_id, pod_number)
);
CREATE INDEX idx_pods_round ON pods (round_id);

-- Membership plus that player's result in that pod. `placement` is the only
-- stored result fact; points are derived from it on read.
CREATE TABLE pod_members (
  pod_id         uuid NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES pod_players(id) ON DELETE CASCADE,
  placement      integer CHECK (placement IS NULL OR (placement >= 1 AND placement <= 4)),
  PRIMARY KEY (pod_id, player_id)
);
CREATE INDEX idx_pod_members_player ON pod_members (player_id);
```

After applying it, regenerate `docs/schema.sql` (`pg_dump --schema-only`) in the same commit, per docs/contributing.md.

### Round lifecycle and the finalize transaction

1. **Pair a round (owner).** `POST /api/v1/pod-tournaments/:id/rounds` derives the active players' snapshot (score, pod tallies, opponent maps) from the finalized rounds via the repo, calls `generatePairing`, and in one transaction inserts the `pod_rounds` row (`status='reporting'`), its `pods` (each with its stored `penalty_breakdown`), and `pod_members` (no placements yet). It stores the round and per-pod penalties for the organizer display.
2. **Report results.** The owner (cookie auth) or an anonymous participant (report token) sets `pod_members.placement` for a pod; the pod flips to `result_status='reported'`. These are drafts; standings ignore non-finalized rounds, so nothing counts yet. Points are never stored — they are derived from the placements on read.
3. **Finalize the round (owner).** `POST /api/v1/pod-tournaments/:id/rounds/:n/finalize` validates that every pod has a complete result, then in a single transaction flips the round to `finalized` and advances `current_round`. That is the whole transaction: there are no aggregates to write. Standings, pod tallies, and opponent history re-derive from the now-finalized rows on the next read.

Because nothing is denormalized, there is no `recomputeAggregates` helper and no drift surface: the result rows are the source of truth and every read re-folds them through the pure scorer.

### Lifecycle, edits, drops, and late entry

**Tournament status.** `setup` until the first round is paired, then `running`. There is no automatic end: the organizer decides when to stop. As guidance, the Pairings tab shows the Swiss-convention suggested round count (`suggestedRoundCount = ceil(log2(active players))`, a pure helper in the engine) and nudges toward ending once that many rounds are finalized, but never forces it. An explicit "End tournament" moves it to `completed`, which is enforced read-only (no new rounds, no result edits, no roster changes); Settings stays available to reopen to `running`, rename, manage the report link, or delete. Status gates which controls show; it does not change pairing logic.

**One open round at a time.** Pairing is rejected while a non-finalized round exists. Before any result is entered the organizer can **re-roll** an open round (delete and regenerate); the regenerated round keeps the same `round_number`. This is how an organizer who dislikes a draw gets another one without a manual edit.

**Editing a finalized round (any round).** Finalized results stay editable on every round. Editing a `pod_members.placement` just writes the new value (the owner result endpoint allows finalized rounds; the participant link does not). There is nothing else to do: the next standings read re-folds the placements through the pure scorer, so the corrected totals appear automatically. Worked case: correcting a 1st/2nd swap in round 1 immediately re-derives both players' scores. The one limitation the UI states plainly: editing an **earlier** round fixes scores but does not redraw the pods later rounds already used (we fix scores, not games that were physically played). For the latest round there is no later round, so no caveat.

**Drops take effect from the next round.** Dropping a player sets `status='dropped'` and `dropped_after_round = current_round`. If they are already in a paired-but-unfinalized pod, they stay in it for that round's result (the organizer records a placement at their discretion, for example last place); the drop only removes them from the next pairing. No short-pod surgery, no re-pair. Dropped players remain in standings, marked.

**Late registration.** The organizer can add a player at any point. A late joiner has no finalized results, so they derive to score 0 with no opponent history and zero pod tallies, and are paired from the next round; their rounds-played trails the field. No catch-up score or bye in v1.

**Report-link scope.** The single `report_token` authorizes submitting **any** pod's result in the open round, not one specific pod. This is deliberate trust-on-link for a link shared at the table; finalize-gated commit and a rotatable token bound the risk. Per-pod codes are a deferred tightening.

**Concurrency.** Two submissions to the same pod are last-write-wins on the pending result. A submission after the round is finalized is rejected. Generating a round is guarded by the one-open-round rule, so a double-click cannot create two open rounds.

**Follow-along scope.** The token surface shows names, scores, placements, and pairings. It does **not** expose the penalty / fairness internals (per-pod penalty, rematch counts, float); those stay organizer-only.

**Feature flag.** The whole feature ships behind a `pod-tournaments` flag (registered in `KNOWN_FLAGS` in the admin feature-flags page) for staged rollout, not a migration-seeded flag.

### Participant link: follow-along reads and one write

The `report_token` grants a read-only follow-along of the whole tournament plus exactly one write: submitting a pod's result while its round is `reporting`. The public `report` sub-router resolves the token to a tournament in-handler (`findByReportToken` + `assertFound`, the established public-route pattern; a disabled / rotated token simply fails the lookup with 404) rather than via a dedicated middleware. Endpoints (under the API prefix `/api/v1/pod-tournaments`, kept distinct from ADR-014's `/api/v1/tournaments`):

- `GET /api/v1/pod-tournaments/report/:token` — the follow-along payload: tournament name and status, standings, and every round's pairings, plus which pods in the current `reporting` round are still open. Read-only. Nothing here is private beyond what the table already sees (names, scores, placements).
- `PUT /api/v1/pod-tournaments/report/:token/pods/:podId/result` — submit one pod's placements; points are derived from them on read, never stored. Allowed only while that pod's round is `reporting`; rejected once the round is `finalized`. Overwrites any pending result for that pod.

The token authorizes submitting _any_ pod's result in the open round, not one specific pod (trust-on-link). The accepted risk (a link holder can scribble a pending result for any pod) is bounded by finalize-gated commit (drafts do not touch standings until the owner finalizes) and a rotatable / disable-able token. Read-only follow-along plus that single write are the whole of what the token allows.

### Repository, service, and API wiring

- **Repository** `apps/api/src/repositories/pod-tournaments.ts`: a `podTournamentsRepo(db)` factory returning namespaced methods (tournaments, players, rounds, pods, the finalize status-flip, and the derive-on-read folds `loadPairingSnapshot` / `computeStandings` / `loadRounds` that build the engine snapshot, standings, and round views from the finalized rows), registered on the Hono context in `apps/api/src/deps.ts` and reached via `c.get("repos").podTournaments`. All DB access goes through it (no raw Kysely in routes), per docs/contributing.md.
- **Service** `apps/api/src/services/pod-pairing.ts`: loads the snapshot from the repo, calls the pure `generatePairing`, hands the result back to the repo to persist. Keeps the engine pure and the DB I/O in one place.
- **Routes** mounted at `/api/v1/pod-tournaments` (distinct from ADR-014's `/api/v1/tournaments`): `apps/api/src/routes/authenticated/pod-tournaments.ts` for the owner endpoints (cookie auth, owner checks like Friend Groups' `requireRole`), plus a small unauthenticated `report` sub-router (`apps/api/src/routes/public/pod-tournaments.ts`) that resolves the token in-handler. Bodies validated by zod schemas from `@openrift/shared`.

### Shared types and schemas

Response interfaces in `packages/shared/src/types/api/pod-tournament.ts`, zod request schemas in `packages/shared/src/schemas.ts` (create takes only a `name`; the id-param schema is `{ id: z.uuid() }`; the response mirror is in `response-schemas.ts`), consumed by both api and web. The pure engine lives alongside under `packages/shared/src/pairing/` and is exported for the api service (and, later, a web-side manual-edit preview).

### User experience surfaces

Both the organizer dashboard and the participant link are **equally first-class on desktop and mobile** (no primary form factor): a desktop organizer sees the round's pods in a grid with standings alongside; the same screen collapses to a single column with big tap targets on a phone, and the participant link is phone-shaped by default. The Friend Groups data layer is reused verbatim: `createServerFn` wrappers in `apps/web/src/hooks/use-pod-tournaments.ts`, suspense queries with centralized query keys, mutations with cache invalidation. React Compiler, BaseUI / shadcn (`base-nova`), the typography scale, `cn()`, and lucide `*Icon` imports apply as everywhere. Any `<Select.Root>` is passed `items` (docs/contributing.md).

**Organizer dashboard.** `/tournaments/run` lists the user's tournaments with a "Create" CTA. `/tournaments/run/$id` is the tournament, a **tabbed page where each tab is its own route** (`/$id`, `/$id/standings`, `/$id/players`, `/$id/settings`), mirroring the route-based tabs `groups/$slug` now uses (a shared `TournamentPageFrame` shell renders the header + tab nav, each tab route supplies the content):

- **Pairings** (default): the current round's pods. Each pod card shows its players with their current score and prior three-pod count, the in-pod rematch count, the pod's score spread, and the pod's penalty; the round header shows total penalty, total rematches, count of players in three-player pods, and the largest pod spread. All of this is read straight from `evaluatePairing`'s stored breakdown, not recomputed. Controls: "Generate round" (when none is open), per-pod result entry, and "Finalize round" (enabled once every pod is reported).
- **Standings**: players sorted by score (v1 has no further tie-breaker), each row showing score, rounds played, and three/four-pod tallies.
- **Players**: the roster, add a player, drop a player. Dropped players are visibly marked and excluded from the next pairing.
- **Settings**: rename / delete the tournament, and manage the participant link (enable, copy, rotate, disable the `report_token`).

**Result entry (placement selector).** Inside a pod, each player row has a placement `<Select>` (1..N for the pod size). Ties are entered by giving two players the same placement; `pointsForPlacements` then averages, so points are always derived, never typed. The form requires every placement to be within 1..N and every player to have one before it can submit; the exact value-to-points mapping (including non-canonical sets like `[1,3,3,4]`) is the order-based rule defined under "Result scoring and ties." The same component renders on the organizer dashboard and on the participant link.

**Participant link (full follow-along).** `/tournaments/run/report/$token` is public (`noIndex`) and token-gated, also a tabbed page so a participant or spectator can follow the whole event read-only and submit pod results:

- **Pairings**: current and past rounds, read-only (find your pod).
- **Standings**: read-only leaderboard between rounds.
- **Report**: pick a pod in the current reporting round (the token opens any pod, trust-on-link) and enter its placements with the same selector. This is the only write the token allows, and only while the round is `reporting`. The fairness internals (penalties, rematch counts) are not shown here.

**Navigation.** A single **"Tournaments"** entry in the header **"More"** menu (desktop dropdown and mobile sheet) points at the runner. ADR-014's archive is not built yet, so the shared `/tournaments` hub described above does not exist; the entry links **directly to `/tournaments/run`** and the runner still lives under the reserved `/run` segment so the future hub can slot in without a slug collision. The entry is gated behind the `pod-tournaments` feature flag (`useFeatureEnabled`). There is no "Tools" menu in OpenRift.

## Confirmation

Pure-engine unit tests (`packages/shared/src/pairing/*.test.ts`), no database:

- `determinePodSizes` matches every worked example (3, 4, 6..16) and returns the no-solution signal for 1, 2, and 5.
- `pointsForPlacements` reproduces the spec's tie example (1 / 2= / 2= / 4 -> 3 / 1.5 / 1.5 / 0) and both schemes.
- `evaluatePairing` returns the exact spec penalties: rematch tiers (0 / 100 / 500 / 2000), spread `*10` plus the +50 / +150 surcharges at 6 / 9, float `*5`, three-pod tiers (0 / 25 / 100 / 300).
- `generatePairing`: round 1 respects pod sizes; round 2 finds a low-penalty pairing that prefers a wider score spread over a rematch (the priority ordering); a seeded `rng` makes construction and tie-breaks deterministic; the run stays within its `budget`; a large field (24+ players) still returns a valid pairing in bounded time; and on a small hand-checked field the search reaches the known optimum.

Repository integration tests (`*.integration.test.ts`, temporary DB via `setupTestDb()`, run from main):

- Create tournament, add players, pair round 1, report all pods, finalize: the derived standings (score, rounds played, 3/4-pod tallies) and the pairing snapshot's opponent counts are correct (each player met its three pod-mates once).
- A player dropped after a round is paired stays in that round's pod result and is excluded only from the next pairing; dropped players keep their standings position, marked.
- A player added after round 1 starts at score 0 with no opponent history and is paired only from the next round.
- Pairing is rejected while a non-finalized round exists; re-rolling an open round (delete + regenerate) keeps the same `round_number` and leaves finalized rounds untouched.
- Finalize rejects a round with any unreported pod.
- Editing a finalized round's placement re-derives the corrected standings on the next read (the 1st/2nd-swap worked case); editing an earlier round does not alter later rounds' pod memberships.
- A late joiner derives to score 0 with no opponent history and is paired only from the next round.
- Cascades: deleting a tournament removes its players, rounds, pods, and members; deleting a round removes its pods and members.

Route tests (`*.test.ts`):

- Owner-only endpoints reject non-owners (403) and missing tournaments (404); tournaments are addressed by their uuid id (no slug collisions or reserved words to police).
- The follow-along GET returns standings and every round's pairings read-only for a valid token, and 404s a disabled / wrong token.
- The result-submit endpoint accepts a valid token against a `reporting` round, rejects a placement outside 1..N, and rejects any write once the round is `finalized`.

## Will Not Be Built (v1)

- **Real player accounts / profiles / cross-event history.** Players are free text, like ADR-014. No `players`-to-`users` link, no claim flow.
- **Greedy pod-by-pod pairing.** The engine always evaluates the whole round.
- **A scraper or import.** Rosters are entered by hand or, later, pasted.

## Deferred / Out of Scope

- Manual pairing edits and the post-edit warning surface ("A and B have already met", "C has been in two three-pods", "this pod's spread is very large").
- Configurable penalty weights and the reduced three-pod scoring scheme as a live setting (the `scoring_scheme` column exists; v1 is `standard` only).
- Seed-based round 1.
- Standings tie-breakers (pod wins, average opponent points, game points, head-to-head). v1 sorts by score.
- An exact/optimal small-field solver behind the strategy seam (the local-search engine already covers every size; this would only add a provable optimum for tiny fields).
- Top cut / bracket, a public (un-tokened, indexable) standings page beyond the token follow-along, CSV / export, QR check-in, in-game-points tracking as a first-class standings input.
- Byes for unrepresentable counts (1, 2, 5 active players): v1 asks the organizer to add or drop a player.

## More Information

Relationship to other ADRs:

- **ADR-013 (Friend Groups)** is the structural template: account-owned root, child rows, slug plus nullable share token, repository factory on the Hono context, server-function plus suspense-query web layer. Pod tournaments are not group-scoped in v1 (no friend-group integration).
- **ADR-021 (Match Tracker)** is the spiritual sibling (a Riftbound play-time tool) but deliberately client-only and single-game; pod tournaments diverge because their state is multi-round and must persist and be shared.
- **ADR-014 (Tournament Decks Archive)** now shares the `/tournaments` namespace with this runner through a common hub: the runner lives under `/tournaments/run`, the archive keeps `/tournaments`, `/tournaments/decks`, `/tournaments/meta`, and `/tournaments/$slug`, and `run` is added to ADR-014's reserved-slug set. They share only the URL home and the free-text `player_name` precedent; their tables (`pod_tournaments` vs `tournaments`), repositories, ownership, and audiences stay separate. ADR-014 is updated in lockstep with this decision.
