import { describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { adminEventsRepo, buildEventsCursor } from "./admin-events.js";

// ---------------------------------------------------------------------------
// Integration tests: admin_events repository (migration 201)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Seeds its own users (per-file random IDs) and prefixes entity labels with
// AEV- so filters can target only this file's rows.
// ---------------------------------------------------------------------------

const ACTOR_A = crypto.randomUUID();
const ACTOR_B = crypto.randomUUID();
// Never seeded as a user — proves audit rows survive without a users row.
const ACTOR_DELETED = crypto.randomUUID();

const ctx = createDbContext(ACTOR_A);

let actorAEmail: string;

if (ctx) {
  const { db } = ctx;
  ({ email: actorAEmail } = await seedTestUser(db, { id: ACTOR_A, isAdmin: true }));
  await seedTestUser(db, { id: ACTOR_B });

  const repo = adminEventsRepo(db);

  // Seed events with deterministic ordering (insert order = id order via
  // uuidv7; createdAt defaults to now() and may collide at ms precision,
  // which is exactly what the keyset cursor must handle).
  await repo.insert({
    actorUserId: ACTOR_A,
    action: "card.accept-new",
    entityType: "card",
    entityId: "AEV-001",
    entityLabel: "AEV Alpha Card",
    cardSlug: "AEV-001",
    newValues: { name: "AEV Alpha Card", types: ["unit"] },
  });
  await repo.insert({
    actorUserId: ACTOR_B,
    action: "card.accept-field",
    entityType: "card",
    entityId: "AEV-002",
    entityLabel: "AEV Beta Card",
    cardSlug: "AEV-002",
    oldValues: { energy: 2 },
    newValues: { energy: 3 },
  });
  await repo.insert({
    actorUserId: ACTOR_DELETED,
    action: "printing.delete",
    entityType: "printing",
    entityId: "AEV-003",
    entityLabel: "AEV-003b",
    oldValues: { shortCode: "AEV-003b" },
  });
}

describe.skipIf(!ctx)("adminEventsRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const repo = adminEventsRepo(ctx!.db);

  it("lists newest first with actor join and parsed jsonb payloads", async () => {
    const rows = await repo.list({ search: "AEV" }, 50);
    expect(rows.length).toBe(3);

    // newest first: printing.delete was inserted last
    expect(rows[0].action).toBe("printing.delete");
    expect(rows[2].action).toBe("card.accept-new");

    const fieldEdit = rows.find((r) => r.action === "card.accept-field");
    expect(fieldEdit?.actorUserId).toBe(ACTOR_B);
    // jsonb round-trip through parseJsonb (postgres.js under Bun returns strings)
    expect(fieldEdit?.oldValues).toEqual({ energy: 2 });
    expect(fieldEdit?.newValues).toEqual({ energy: 3 });

    const created = rows.find((r) => r.action === "card.accept-new");
    expect(created?.actorEmail).toBe(actorAEmail);
    expect(created?.oldValues).toBeNull();
    expect(created?.newValues).toEqual({ name: "AEV Alpha Card", types: ["unit"] });
  });

  it("keeps rows for actors without a users row (no FK)", async () => {
    const rows = await repo.list({ actorUserId: ACTOR_DELETED }, 50);
    expect(rows).toHaveLength(1);
    expect(rows[0].actorName).toBeNull();
    expect(rows[0].actorEmail).toBeNull();
    expect(rows[0].actorUserId).toBe(ACTOR_DELETED);
  });

  it("filters by actor and by action", async () => {
    const byActor = await repo.list({ actorUserId: ACTOR_B, search: "AEV" }, 50);
    expect(byActor).toHaveLength(1);
    expect(byActor[0].action).toBe("card.accept-field");

    const byAction = await repo.list({ action: "card.accept-new", search: "AEV" }, 50);
    expect(byAction).toHaveLength(1);
    expect(byAction[0].entityId).toBe("AEV-001");
  });

  it("searches entity label, id, and card slug case-insensitively", async () => {
    const byLabel = await repo.list({ search: "aev beta" }, 50);
    expect(byLabel).toHaveLength(1);
    expect(byLabel[0].entityLabel).toBe("AEV Beta Card");

    const bySlugFragment = await repo.list({ search: "aev-00" }, 50);
    expect(bySlugFragment.length).toBe(3);
  });

  it("paginates with the keyset cursor across same-millisecond rows", async () => {
    const firstPage = await repo.list({ search: "AEV" }, 2);
    // limit + 1 probe row
    expect(firstPage).toHaveLength(3);

    const pageRows = firstPage.slice(0, 2);
    const last = pageRows.at(-1);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- length asserted above
    const cursor = buildEventsCursor(last!.createdAt, last!.id);

    const secondPage = await repo.list({ search: "AEV" }, 2, cursor);
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].action).toBe("card.accept-new");
    // no overlap with the first page
    expect(pageRows.map((r) => r.id)).not.toContain(secondPage[0].id);
  });

  it("lists distinct actors with user details where available", async () => {
    const actors = await repo.listActors();
    const ids = actors.map((a) => a.userId);
    expect(ids).toContain(ACTOR_A);
    expect(ids).toContain(ACTOR_B);
    expect(ids).toContain(ACTOR_DELETED);

    const deleted = actors.find((a) => a.userId === ACTOR_DELETED);
    expect(deleted?.email).toBeNull();
    // each actor appears exactly once
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists distinct actions alphabetically", async () => {
    const actions = await repo.listActions();
    expect(actions).toContain("card.accept-new");
    expect(actions).toContain("card.accept-field");
    expect(actions).toContain("printing.delete");
    // each action appears exactly once, ordered alphabetically
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual([...actions].toSorted());
  });
});
