---
status: accepted
date: 2026-07-16
---

# ADR-041: Swiss 1v1 Pairing and Player Regions

## Context and Problem Statement

A store customer runs recurring events on the Custom - Region deck format: every player brings a deck built around one League region, matches are 1v1 Swiss, and the event tracks region-level results alongside player standings. They ran these events with a standalone HTML pairing tool (preserved at `data/UeB Matchmaking.html`) and asked for the workflow in OpenRift. Their one complaint about the tool: it paired greedily inside score groups, so players got matched against the same opponent again. ADR-033 left the seam for this ("Swiss / cut / 1v1 are designed-for, not built here"). How do we add a 1v1 Swiss mode, Bo1 and Bo3, with an optional region layer that also works for the existing 3/4-player pod mode?

## Considered Options

1. Swiss matches as 2-player pods on the existing pod machinery (chosen)
2. A separate match/round data model and pairing engine beside the pod tables
3. Porting the customer's greedy score-group algorithm as-is

## Decision Outcome

`pairing_style` gains `swiss`, `pods.size` widens to (2, 3, 4), and a Swiss round is an ordinary `pod_rounds` row whose pods all have size 2. Everything downstream of pairing (rounds lifecycle, result rows, byes, re-roll, manual editing, the report token pages, standings derivation) is reused unchanged. Results stay raw game points per player; Bo1 vs Bo3 (`tournaments.match_format`, frozen once rounds exist, like the pairing style) only changes the scoreline presets in the result UI. Swiss match points do not come from the placement tables: a 2-pod scores sole-first `win_points`, tie `draw_points` each, loser 0 (`tournaments.win_points` / `draw_points`, derived on read like everything else, so edits recompute finalized rounds).

Pairing runs the existing local-search engine with an all-twos decomposition. Rematch avoidance is the engine's dominant penalty (100/500/2000 per repeat meeting versus 10 per point of score spread), so the customer's complaint is solved by construction: the search reaches across score groups before repeating a matchup. Swiss skips the round-1 random shortcut so the region term is honored from the first round. An odd field auto-byes the player with the fewest byes, then lowest score (organizer byes still work; re-roll inherits the stored bye).

Regions are a per-participant label (`tournament_participants.region`, a custom-tag slug from the `region` category, the same vocabulary Custom - Region decks validate against), gated by `tournaments.regions_enabled` and assigned by staff (judges included) on the participants tab. In the penalty function a same-region pair inside any pod costs `sameRegionWeight` (70: below any rematch, above moderate spread), which gives region avoidance to pod tournaments for free. Region standings ("Regionen-Punkte") are the regions ranked by average member points, computed client-side from the standings rows.

The greedy port was rejected because its rematch handling is the reported defect; a separate match model was rejected because it duplicates every lifecycle surface the pod tables already provide for a structurally identical entity.

### Consequences

- Good, because the Swiss mode inherits ten-plus proven surfaces (byes, re-roll, manual edit, follow tokens, derive-on-read standings) instead of reimplementing them.
- Good, because rematch avoidance is strictly stronger than the reference tool's: the engine trades score spread for rematch-freedom globally, not greedily per group.
- Good, because the region layer is orthogonal: plain Swiss, region Swiss, and region pods are all just column toggles.
- Bad, because `podWins`/`pods3Count`/`pods4Count` and other pod-shaped names now also carry Swiss semantics (`podWins` doubles as match wins); the standings UI branches per style to hide the mismatch.
- Bad, because stored `penalty_breakdown` jsonb predating this ADR lacks the `sameRegion` key, so readers coalesce it to 0 forever.

## More Information

- Deferred, deliberately: deriving region suggestions from a participant's submitted deck (`deck_check_entry_cards.resolved_card_id` joined through `card_custom_tags` via `customTagsRepo.assignmentsForCardIds`), and a repeated-opposing-region history term (the reference tool's lowest-priority criterion).
- ADR-033 carries the amendment note pointing here; ADR-022 documents the pairing engine this mode reuses.
- Engine behavior is pinned in `packages/shared/src/pairing/*.test.ts` (swiss decomposition, region penalty ordering, rematch dominance) and the flow in `apps/api/src/repositories/pod-tournaments.integration.test.ts`.
