import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { buildKeysetCursor } from "../lib/keyset-cursor.js";
import { createDbContext } from "../test/integration-context.js";
import { adminEventsRepo } from "./admin-events.js";

// Keyset cursor pagination against real microsecond timestamps. Requires
// INTEGRATION_DB_URL. Rows seed into admin_events under a random actor id
// so no other file's filters can see them.

const ACTOR = crypto.randomUUID();

// Fixed, ordered ids so "createdAt desc, id desc" is deterministic, matching
// the alignment uuidv7 gives in production (later rows carry higher ids).
const ID_EARLIER = "0f9c0000-0000-7000-b000-000000000000";
const ID_MICRO_LOW = "0f9c0000-0000-7000-b000-000000000001";
const ID_MICRO_MID = "0f9c0000-0000-7000-b000-000000000002";
const ID_MICRO_HIGH = "0f9c0000-0000-7000-b000-000000000003";

const ctx = createDbContext(ACTOR);

if (ctx) {
  const { db } = ctx;
  // Three rows inside one millisecond (µs precision a JS Date cursor can't
  // carry) plus one a full millisecond earlier.
  const seed = [
    { id: ID_EARLIER, at: "2026-03-01 10:00:00.999000+00", label: "QHC earlier" },
    { id: ID_MICRO_LOW, at: "2026-03-01 10:00:01.000100+00", label: "QHC micro low" },
    { id: ID_MICRO_MID, at: "2026-03-01 10:00:01.000500+00", label: "QHC micro mid" },
    { id: ID_MICRO_HIGH, at: "2026-03-01 10:00:01.000900+00", label: "QHC micro high" },
  ];
  for (const row of seed) {
    await db
      .insertInto("adminEvents")
      .values({
        id: row.id,
        actorUserId: ACTOR,
        action: "card.create",
        entityType: "card",
        entityId: row.id,
        entityLabel: row.label,
        cardSlug: null,
        oldValues: null,
        newValues: null,
        createdAt: sql<Date>`${row.at}::timestamptz`,
      })
      .execute();
  }
}

afterAll(async () => {
  if (ctx) {
    await ctx.db.deleteFrom("adminEvents").where("actorUserId", "=", ACTOR).execute();
  }
});

describe.skipIf(!ctx)("keysetCursorPredicate (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const repo = adminEventsRepo(ctx!.db);

  it("orders the seeded rows newest first", async () => {
    const rows = await repo.list({ actorUserId: ACTOR }, 50);
    expect(rows.map((row) => row.id)).toEqual([
      ID_MICRO_HIGH,
      ID_MICRO_MID,
      ID_MICRO_LOW,
      ID_EARLIER,
    ]);
  });

  // The predicate needs a bare-column `createdAt < cursor + 1ms` bound so an
  // index can seek it; a bound at the cursor time itself would drop rows
  // sharing the cursor's millisecond.
  it("keeps rows sharing the cursor's millisecond on the next page", async () => {
    const first = await repo.list({ actorUserId: ACTOR }, 1);
    // limit + 1 probe row
    expect(first.length).toBe(2);
    expect(first[0]!.id).toBe(ID_MICRO_HIGH);

    const cursor = buildKeysetCursor(first[0]!.createdAt, first[0]!.id);
    const second = await repo.list({ actorUserId: ACTOR }, 50, cursor);

    expect(second.map((row) => row.id)).toEqual([ID_MICRO_MID, ID_MICRO_LOW, ID_EARLIER]);
  });

  it("walks the whole list one row at a time without gaps or repeats", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const rows = await repo.list({ actorUserId: ACTOR }, 1, cursor);
      const row = rows[0];
      if (row === undefined) {
        break;
      }
      seen.push(row.id);
      cursor = buildKeysetCursor(row.createdAt, row.id);
    }
    expect(seen).toEqual([ID_MICRO_HIGH, ID_MICRO_MID, ID_MICRO_LOW, ID_EARLIER]);
  });
});
