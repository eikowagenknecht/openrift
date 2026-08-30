import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type {
  CandidateMetaMatchRow,
  CandidateMetaPlayerRow,
} from "../repositories/meta-candidates.js";
import type { NewMetaEventMatch, UpsertedMetaEventMatch } from "../repositories/meta.js";
import { materializeCandidateMatches } from "./meta-event-matches.js";

const CANDIDATE_EVENT_ID = "cand-1";
const META_EVENT_ID = "live-1";

function stagedMatch(overrides: Partial<CandidateMetaMatchRow> = {}): CandidateMetaMatchRow {
  const id = overrides.id ?? "m-1";
  return {
    id,
    candidateEventId: CANDIDATE_EVENT_ID,
    // Distinct per staged row unless a test says otherwise: the source's id is
    // what keys the row on both tiers.
    sourceMatchId: `match-${id}`,
    roundId: "901",
    phaseOrder: 0,
    roundNumber: 1,
    tableNumber: 1,
    isBye: false,
    isDraw: false,
    player1UvsgamesId: 11,
    player2UvsgamesId: 12,
    winnerUvsgamesId: 11,
    gamesWonP1: 2,
    gamesWonP2: 0,
    metaEventMatchId: null,
    ...overrides,
  } as CandidateMetaMatchRow;
}

function stagedPlayer(uvsgamesPlayerId: number, metaEventPlayerId: string | null) {
  return {
    id: `p-${uvsgamesPlayerId}`,
    candidateEventId: CANDIDATE_EVENT_ID,
    uvsgamesPlayerId,
    metaEventPlayerId,
  } as CandidateMetaPlayerRow;
}

/**
 * A repo pair whose upsert answers the way Postgres does: the written rows come
 * back keyed by the source's match id, in an order the caller must not rely on.
 */
function harness(options: {
  pending: CandidateMetaMatchRow[];
  players: CandidateMetaPlayerRow[];
  /** How the fake shuffles what it returns, so position-keyed code fails. */
  order?: (rows: UpsertedMetaEventMatch[]) => UpsertedMetaEventMatch[];
}) {
  const written: NewMetaEventMatch[] = [];
  const stamped = new Map<string, string>();

  const upsertEventMatches = vi.fn((rows: NewMetaEventMatch[]) => {
    written.push(...rows);
    const returned = rows.map((row, index) => ({
      id: `live-match-${index + 1}`,
      sourceMatchId: (row.sourceMatchId ?? null) as string | null,
    }));
    return Promise.resolve(options.order?.(returned) ?? returned);
  });

  const repos = {
    meta: { upsertEventMatches },
    metaCandidates: {
      unmaterializedMatches: () => Promise.resolve(options.pending),
      playersByCandidateEventIds: () => Promise.resolve(options.players),
      setMatchLiveIds: (stamps: ReadonlyMap<string, string>) => {
        for (const [id, liveId] of stamps) {
          stamped.set(id, liveId);
        }
        return Promise.resolve();
      },
    },
  } as unknown as Pick<Repos, "meta" | "metaCandidates">;

  return { repos, written, stamped, upsertEventMatches };
}

const FIELD = [stagedPlayer(11, "live-p-11"), stagedPlayer(12, "live-p-12")];

describe("materializeCandidateMatches", () => {
  it("keeps both matches when the source pairs one player twice in a round", async () => {
    const { repos, written, stamped } = harness({
      pending: [
        stagedMatch({ id: "m-1" }),
        stagedMatch({ id: "m-2", player2UvsgamesId: null, isBye: true, winnerUvsgamesId: null }),
      ],
      players: FIELD,
    });

    const summary = await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(written).toHaveLength(2);
    expect(stamped.get("m-1")).toBe("live-match-1");
    expect(stamped.get("m-2")).toBe("live-match-2");
    expect(summary).toEqual({ materialized: 2, waiting: 0 });
  });

  it("carries the source's match and round ids onto the live row", async () => {
    const { repos, written } = harness({ pending: [stagedMatch()], players: FIELD });

    await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(written[0]).toMatchObject({ sourceMatchId: "match-m-1", sourceRoundId: "901" });
  });

  it("stages both rounds when the seat repeats across rounds", async () => {
    const { repos, written } = harness({
      pending: [stagedMatch({ id: "m-1" }), stagedMatch({ id: "m-2", roundNumber: 2 })],
      players: FIELD,
    });

    const summary = await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(written.map((row) => row.roundNumber)).toEqual([1, 2]);
    expect(summary).toEqual({ materialized: 2, waiting: 0 });
  });

  it("stamps by the source match id, not by the order the write answered in", async () => {
    const { repos, stamped } = harness({
      pending: [stagedMatch({ id: "m-1" }), stagedMatch({ id: "m-2", roundNumber: 2 })],
      players: FIELD,
      order: (rows) => rows.toReversed(),
    });

    await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(stamped.get("m-1")).toBe("live-match-1");
    expect(stamped.get("m-2")).toBe("live-match-2");
  });

  it("resolves the winner to the participant the staged row names", async () => {
    const { repos, written } = harness({
      pending: [stagedMatch({ winnerUvsgamesId: 12 })],
      players: FIELD,
    });

    await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(written[0]).toMatchObject({
      player1Id: "live-p-11",
      player2Id: "live-p-12",
      winnerId: "live-p-12",
    });
  });

  it("leaves a match waiting while one participant has no live row", async () => {
    const { repos, written, stamped } = harness({
      pending: [stagedMatch()],
      players: [stagedPlayer(11, "live-p-11"), stagedPlayer(12, null)],
    });

    const summary = await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(written).toEqual([]);
    expect(stamped.size).toBe(0);
    expect(summary).toEqual({ materialized: 0, waiting: 1 });
  });

  it("writes nothing when no match is staged", async () => {
    const { repos, upsertEventMatches } = harness({ pending: [], players: FIELD });

    const summary = await materializeCandidateMatches(repos, CANDIDATE_EVENT_ID, META_EVENT_ID);

    expect(upsertEventMatches).not.toHaveBeenCalled();
    expect(summary).toEqual({ materialized: 0, waiting: 0 });
  });
});
