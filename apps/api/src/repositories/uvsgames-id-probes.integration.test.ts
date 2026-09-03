import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import type { UvsgamesUpsertInput } from "./uvsgames-events.js";
import { uvsgamesEventsRepo } from "./uvsgames-events.js";

// Exercises the sweep's two anti-joins against a real range — SQL logic like
// this isn't caught by mocks. The window sits far above the source's own id
// space (hundreds of thousands) to avoid colliding with real mirror rows.

const ctx = createDbContext(crypto.randomUUID());

const WINDOW_FROM = 999_000_001;
const WINDOW_TO = 999_000_010;

/** The mirrored id inside the window, and the two ids probed away. */
const MIRRORED = 999_000_003;
const PROBED = [999_000_005, 999_000_007];

const SEEN = new Date("2026-09-03T12:00:00Z");

function row(externalId: string): UvsgamesUpsertInput {
  return {
    externalId,
    name: "MTP Sweep Event",
    startAt: new Date("2026-08-15T18:00:00Z"),
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: null,
    playerCount: 8,
    eventType: "LOCALS",
    eventFormat: "CONSTRUCTED",
    storeId: null,
    storeName: null,
    location: null,
    timezone: "UTC",
    eventConfigurationTemplate: null,
    contentHash: "hash-sweep",
  };
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("uvsgamesEvents").where("externalId", "=", String(MIRRORED)).execute();
  await ctx.db
    .deleteFrom("uvsgamesIdProbes")
    .where("externalId", ">=", WINDOW_FROM)
    .where("externalId", "<=", WINDOW_TO)
    .execute();
});

describe("uvsgamesEventsRepo id sweep", () => {
  it("hands back only the ids neither table has decided", async () => {
    const repo = uvsgamesEventsRepo(ctx!.db);
    await repo.upsertBatch([row(String(MIRRORED))], SEEN);
    await repo.recordProbes([
      { externalId: PROBED[0]!, outcome: "other_game", gameType: "LORCANA" },
      { externalId: PROBED[1]!, outcome: "absent", gameType: null },
    ]);

    const candidates = await repo.sweepCandidates(WINDOW_FROM, WINDOW_TO, 100);

    expect(candidates).toEqual([
      999_000_001, 999_000_002, 999_000_004, 999_000_006, 999_000_008, 999_000_009, 999_000_010,
    ]);
    expect(await repo.sweepRemaining(WINDOW_FROM, WINDOW_TO)).toBe(candidates.length);
  });

  it("honours the limit and returns the lowest ids first", async () => {
    const repo = uvsgamesEventsRepo(ctx!.db);

    expect(await repo.sweepCandidates(WINDOW_FROM, WINDOW_TO, 2)).toEqual([
      999_000_001, 999_000_002,
    ]);
  });

  it("re-probing an id replaces its outcome rather than conflicting", async () => {
    const repo = uvsgamesEventsRepo(ctx!.db);
    await repo.recordProbes([{ externalId: PROBED[0]!, outcome: "absent", gameType: null }]);

    const stored = await ctx!.db
      .selectFrom("uvsgamesIdProbes")
      .select(["outcome", "gameType"])
      .where("externalId", "=", PROBED[0]!)
      .executeTakeFirstOrThrow();

    expect(stored).toEqual({ outcome: "absent", gameType: null });
  });

  it("reads the mirror's numeric span, ignoring keys that are not numbers", async () => {
    const repo = uvsgamesEventsRepo(ctx!.db);

    const bounds = await repo.sweepBounds();

    expect(bounds).toBeDefined();
    expect(bounds!.toId).toBeGreaterThanOrEqual(MIRRORED);
    expect(Number.isInteger(bounds!.fromId)).toBe(true);
  });
});
