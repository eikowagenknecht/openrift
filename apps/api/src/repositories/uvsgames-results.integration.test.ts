import type { Insertable } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import type { UvsgamesEventStandingsTable } from "../db/index.js";
import { createDbContext } from "../test/integration-context.js";
import { uvsgamesResultsRepo } from "./uvsgames-results.js";

// The mirror has no provider column, so isolation is by key: every row here
// hangs off one `mtr-`-prefixed event, where the source's own ids are numeric.

const ctx = createDbContext(crypto.randomUUID());

const EXTERNAL_ID = "mtr-wide";

/**
 * A field wide enough to overrun one statement's parameters. A standings row
 * binds 16 columns, so postgres's 65534 ceiling falls at 4096 rows.
 */
const FIELD_SIZE = 5000;

const FETCHED_AT = new Date("2026-08-20T12:00:00Z");

function standing(index: number): Insertable<UvsgamesEventStandingsTable> {
  return {
    externalId: EXTERNAL_ID,
    registrationId: `reg-${index}`,
    uvsgamesPlayerId: null,
    playerName: `MTR Player ${index}`,
    rank: index + 1,
    wins: 3,
    losses: 1,
    draws: 0,
    matchPoints: 9,
    opponentMatchWinPct: 0.5,
    gameWinPct: 0.6,
    opponentGameWinPct: 0.5,
    entryStatus: null,
    legendName: "Ashe",
    sourceDeckId: null,
    fetchedAt: FETCHED_AT,
  };
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("uvsgamesEventStandings").where("externalId", "=", EXTERNAL_ID).execute();
  await ctx.db.deleteFrom("uvsgamesEvents").where("externalId", "=", EXTERNAL_ID).execute();
});

describe.skipIf(!ctx)("uvsgamesResultsRepo", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = uvsgamesResultsRepo(db);

  it("replaces a field wider than one statement can bind", async () => {
    await db
      .insertInto("uvsgamesEvents")
      .values({
        externalId: EXTERNAL_ID,
        name: "MTR Continental",
        startAt: new Date("2026-08-15T09:00:00Z"),
        displayStatus: "complete",
        eventFormat: "CONSTRUCTED",
        playerCount: FIELD_SIZE,
        contentHash: "mtr-hash",
        lastSeenAt: FETCHED_AT,
      })
      .execute();

    await repo.replaceStandings(
      EXTERNAL_ID,
      Array.from({ length: FIELD_SIZE }, (_entry, index) => standing(index)),
    );

    const stored = await repo.standings(EXTERNAL_ID);
    expect(stored).toHaveLength(FIELD_SIZE);
    expect(stored.at(-1)?.registrationId).toBe(`reg-${FIELD_SIZE - 1}`);
  });

  it("still replaces wholesale, so a re-fetch does not stack batches", async () => {
    await repo.replaceStandings(EXTERNAL_ID, [standing(0)]);

    const stored = await repo.standings(EXTERNAL_ID);
    expect(stored).toHaveLength(1);
  });
});
