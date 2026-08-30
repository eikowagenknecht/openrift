import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import type { MetaClassificationRow } from "../repositories/meta-candidates.js";
import { reclassifyMetaEvents } from "./meta-reclassify.js";

const CANDIDATE_ID = "3f7a1c2e-0000-7000-8000-000000000001";
const LIVE_ID = "3f7a1c2e-0000-7000-8000-000000000002";

function row(overrides: Partial<MetaClassificationRow> = {}): MetaClassificationRow {
  return {
    candidateEventId: CANDIDATE_ID,
    name: "Vendetta Summoner Skirmish I",
    playerCount: 16,
    tier: null,
    country: null,
    location: null,
    sourceLocation: "Kartenstraße 1, 10115, DE",
    templateTier: "store",
    metaEventId: LIVE_ID,
    liveTier: "store",
    liveCountry: null,
    liveLocation: null,
    ...overrides,
  };
}

function harness(rows: MetaClassificationRow[]) {
  const setClassifications = vi.fn().mockResolvedValue(undefined);
  const setEventClassifications = vi.fn().mockResolvedValue(rows.length);
  const repos = {
    metaCandidates: {
      classificationRows: vi.fn().mockResolvedValue(rows),
      setClassifications,
    },
    meta: { setEventClassifications },
  } as unknown as Repos;
  /** Every candidate patch one run wrote, across its chunks. */
  const candidatePatches = () => setClassifications.mock.calls.flatMap((call) => call[0]);
  const livePatches = () => setEventClassifications.mock.calls.flatMap((call) => call[0]);
  return { repos, candidatePatches, livePatches };
}

describe("reclassifyMetaEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills a candidate staged before the columns existed, live row included", async () => {
    const { repos, candidatePatches, livePatches } = harness([row()]);
    const result = await reclassifyMetaEvents(repos);

    expect(candidatePatches()).toEqual([
      { id: CANDIDATE_ID, tier: "store", country: "DE", location: "Kartenstraße 1, 10115, DE" },
    ]);
    // The live row still sits at the column defaults, so every field follows.
    expect(livePatches()).toEqual([
      { id: LIVE_ID, country: "DE", location: "Kartenstraße 1, 10115, DE" },
    ]);
    expect(result).toEqual({ candidates: 1, liveEvents: 1, keptManual: 0 });
  });

  it("writes one batch for many events rather than one statement each", async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row({
        candidateEventId: `${CANDIDATE_ID.slice(0, -1)}${index}`,
        metaEventId: `${LIVE_ID.slice(0, -1)}${index}`,
      }),
    );
    const { repos, candidatePatches, livePatches } = harness(rows);

    const result = await reclassifyMetaEvents(repos);

    expect(candidatePatches()).toHaveLength(5);
    expect(livePatches()).toHaveLength(5);
    expect(result).toMatchObject({ candidates: 5, liveEvents: 5 });
  });

  it("walks the mirror a page at a time, resuming after the last id it read", async () => {
    const unlinked = { metaEventId: null, liveTier: null, liveCountry: null, liveLocation: null };
    const page = Array.from({ length: 500 }, (_, index) =>
      row({ candidateEventId: `mrc-${index}`, ...unlinked }),
    );
    const { repos, candidatePatches } = harness([]);
    const reads = vi.mocked(repos.metaCandidates.classificationRows);
    reads
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([row({ candidateEventId: "mrc-last", ...unlinked })]);

    const result = await reclassifyMetaEvents(repos, { templateId: "tpl-1" });

    expect(reads).toHaveBeenCalledTimes(2);
    expect(reads.mock.calls[0][0]).toEqual({ templateId: "tpl-1", limit: 500 });
    expect(reads.mock.calls[1][0]).toEqual({
      templateId: "tpl-1",
      afterId: "mrc-499",
      limit: 500,
    });
    expect(candidatePatches()).toHaveLength(501);
    expect(result.candidates).toBe(501);
  });

  it("writes each chunk inside its own transaction when given one", async () => {
    const { repos, candidatePatches } = harness([row()]);
    const transact = vi.fn((fn: (scoped: Repos) => Promise<unknown>) => fn(repos));

    await reclassifyMetaEvents(repos, { transact: transact as never });

    expect(transact).toHaveBeenCalledTimes(1);
    expect(candidatePatches()).toHaveLength(1);
  });

  it("moves a live value the pipeline set when the mapping changes what it says", async () => {
    const { repos, livePatches } = harness([
      row({
        templateTier: "competitive",
        tier: "store",
        country: "DE",
        location: "Kartenstraße 1, 10115, DE",
        liveTier: "store",
        liveCountry: "DE",
        liveLocation: "Kartenstraße 1, 10115, DE",
      }),
    ]);
    const result = await reclassifyMetaEvents(repos);

    expect(livePatches()).toEqual([{ id: LIVE_ID, tier: "competitive" }]);
    expect(result.liveEvents).toBe(1);
  });

  it("keeps a live value a human changed, and counts the event once", async () => {
    const { repos, candidatePatches, livePatches } = harness([
      row({
        templateTier: "competitive",
        tier: "store",
        // The admin also rewrote the venue, so two fields are theirs, not three.
        country: "DE",
        location: "Kartenstraße 1, 10115, DE",
        liveTier: "premier",
        liveCountry: "FR",
        liveLocation: "Kartenstraße 1, 10115, DE",
      }),
    ]);
    const result = await reclassifyMetaEvents(repos);

    expect(candidatePatches()).toEqual([
      expect.objectContaining({ id: CANDIDATE_ID, tier: "competitive" }),
    ]);
    expect(livePatches()).toEqual([]);
    // The count is events, not fields: two of this one's values were manual.
    expect(result).toEqual({ candidates: 1, liveEvents: 0, keptManual: 1 });
  });

  it("writes nothing when the stored classification already matches", async () => {
    const { repos, candidatePatches, livePatches } = harness([
      row({
        tier: "store",
        country: "DE",
        location: "Kartenstraße 1, 10115, DE",
        liveTier: "store",
        liveCountry: "DE",
        liveLocation: "Kartenstraße 1, 10115, DE",
      }),
    ]);
    const result = await reclassifyMetaEvents(repos);

    expect(candidatePatches()).toEqual([]);
    expect(livePatches()).toEqual([]);
    expect(result).toEqual({ candidates: 0, liveEvents: 0, keptManual: 0 });
  });

  it("updates only the candidate while it is unlinked", async () => {
    const { repos, candidatePatches, livePatches } = harness([
      row({ metaEventId: null, liveTier: null, liveCountry: null, liveLocation: null }),
    ]);
    const result = await reclassifyMetaEvents(repos);

    expect(candidatePatches()).toHaveLength(1);
    expect(livePatches()).toEqual([]);
    expect(result).toEqual({ candidates: 1, liveEvents: 0, keptManual: 0 });
  });

  it("follows the rules down to null when an address stops parsing", async () => {
    const { repos, livePatches } = harness([
      row({
        sourceLocation: "Somewhere on Runeterra",
        tier: "store",
        country: "DE",
        location: "Kartenstraße 1, 10115, DE",
        liveTier: "store",
        liveCountry: "DE",
        liveLocation: "Kartenstraße 1, 10115, DE",
      }),
    ]);
    await reclassifyMetaEvents(repos);

    expect(livePatches()).toEqual([
      { id: LIVE_ID, country: null, location: "Somewhere on Runeterra" },
    ]);
  });
});
