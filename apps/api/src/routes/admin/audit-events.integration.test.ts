import { describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  seedTestUser,
  syncCardCardTypes,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Uses the shared integration database; requires INTEGRATION_DB_URL.
// Prefix AER- for entities this file creates.
const ADMIN_ID = crypto.randomUUID();
const GRANT_HOLDER_ID = crypto.randomUUID();

const adminCtx = createTestContext(ADMIN_ID);
const grantCtx = createTestContext(GRANT_HOLDER_ID);

let cardId: string;

if (adminCtx && grantCtx) {
  const { db } = adminCtx;
  await seedTestUser(db, { id: ADMIN_ID, isAdmin: true });
  await seedTestUser(db, { id: GRANT_HOLDER_ID });
  await db
    .insertInto("adminGrants")
    .values({ userId: GRANT_HOLDER_ID, section: "card-review" })
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: "AER-001",
      name: "AER Audit Card",
      type: "unit",
      might: 1,
      energy: 1,
      power: 1,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = card!.id;
  await syncCardCardTypes(db);
  await db.insertInto("cardDomains").values({ cardId, domainSlug: "mind", ordinal: 0 }).execute();
  await db.insertInto("cardNameAliases").values({ cardId, normName: "aerauditcard" }).execute();
}

describe.skipIf(!adminCtx || !grantCtx)("audit-events routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: adminApp } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: grantApp } = grantCtx!;

  it("an admin mutation lands in the audit log with actor and old/new values", async () => {
    const mutation = await adminApp.fetch(
      adminReq("POST", `/cards/${cardId}/accept-field`, { field: "energy", value: 5 }),
    );
    expect(mutation.status).toBe(204);

    const res = await adminApp.fetch(
      adminReq("GET", `/audit-events?actorUserId=${ADMIN_ID}&search=AER`),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);

    expect(json.items.length).toBeGreaterThanOrEqual(1);
    const event = json.items.find(
      (e: { action: string; entityId: string }) =>
        e.action === "card.accept-field" && e.entityId === cardId,
    );
    expect(event).toBeDefined();
    expect(event.actorUserId).toBe(ADMIN_ID);
    expect(event.entityLabel).toBe("AER Audit Card");
    expect(event.cardSlug).toBe("AER-001");
    expect(event.oldValues).toEqual({ energy: 1 });
    expect(event.newValues).toEqual({ energy: 5 });
    expect(event.createdAt).toBeTypeOf("string");
  });

  it("lists the actor in the actors endpoint", async () => {
    const res = await adminApp.fetch(adminReq("GET", "/audit-events/actors"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const ids = json.actors.map((a: { userId: string }) => a.userId);
    expect(ids).toContain(ADMIN_ID);
  });

  it("403s card-review grant holders on both audit endpoints (fail closed)", async () => {
    const list = await grantApp.fetch(adminReq("GET", "/audit-events"));
    expect(list.status).toBe(403);

    const actors = await grantApp.fetch(adminReq("GET", "/audit-events/actors"));
    expect(actors.status).toBe(403);
  });
});
