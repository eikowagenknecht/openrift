import { afterAll, describe, expect, it } from "vitest";

import { adminReq, createTestContext, seedTestUser } from "../../../test/integration-context.js";
import type { JsonBody } from "../../../test/read-json.js";
import { readJson } from "../../../test/read-json.js";

// Everything this file creates is prefixed mcd- / MCD. The user starts as a
// non-admin so the 403 case runs before promotion — the isAdmin cache only
// caches positive results, so a never-admin user always re-checks the DB.
//
// The describes run in file order and share state on purpose: review is a
// sequence (upload, queue, accept, re-upload), and testing each step against a
// freshly re-seeded world would test something the product never does.

const USER_ID = crypto.randomUUID();
const ctx = createTestContext(USER_ID);

const PROVIDER = "mcd-provider";
const FORMAT = "freeform";

let legendCardId: string;
let mainCardId: string;

const createdMetaEventIds: string[] = [];
const createdCardIds: string[] = [];

async function seedCard(name: string, normName: string, type: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  createdCardIds.push(card!.id);
  return card!.id;
}

function fullList() {
  return [
    { name: "MCD Legend", zone: "legend", quantity: 1 },
    { name: "MCD Main", zone: "main", quantity: 3 },
  ];
}

function player(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    playerName: "MCD Player",
    rank: 1,
    wins: 5,
    losses: 1,
    cards: fullList(),
    ...overrides,
  };
}

function event(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    name: `MCD ${externalId}`,
    eventDate: "2026-08-15",
    format: FORMAT,
    players: [player(`${externalId}-p1`)],
    ...overrides,
  };
}

async function upload(events: unknown[]): Promise<Response> {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  return await ctx!.app.fetch(adminReq("POST", "/meta/upload", { provider: PROVIDER, events }));
}

async function get(path: string): Promise<Response> {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  return await ctx!.app.fetch(adminReq("GET", path));
}

async function post(path: string, body?: unknown): Promise<Response> {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  return await ctx!.app.fetch(adminReq("POST", path, body));
}

async function queue(): Promise<JsonBody> {
  return await readJson(await get("/meta/overlays"));
}

if (ctx) {
  await seedTestUser(ctx.db, { id: USER_ID });
  legendCardId = await seedCard("MCD Legend", "mcd-legend", "legend");
  mainCardId = await seedCard("MCD Main", "mcd-main", "unit");
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  if (createdMetaEventIds.length > 0) {
    await ctx.db.deleteFrom("metaEvents").where("id", "in", createdMetaEventIds).execute();
  }
  await ctx.db.deleteFrom("metaEventOverlays").where("provider", "=", PROVIDER).execute();
  await ctx.db.deleteFrom("ignoredMetaSourceEvents").where("provider", "=", PROVIDER).execute();
  await ctx.db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
});

describe.skipIf(!ctx)("meta overlay review", () => {
  it("refuses a non-admin", async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    const response = await ctx!.app.fetch(adminReq("GET", "/meta/overlays"));

    expect(response.status).toBe(403);
  });

  it("takes a push provider's payload as pending overlays", async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    await ctx!.db.insertInto("admins").values({ userId: USER_ID }).execute();

    const response = await upload([event("mcd-1")]);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ newEvents: 1, newPlayers: 1 });

    const listed = await queue();
    const overlays = listed.overlays as { kind: string; proposedName: string | null }[];
    // A proposed event and the player under it, both awaiting review.
    expect(overlays.filter((row) => row.kind === "event")).toHaveLength(1);
    expect(overlays.filter((row) => row.kind === "player")).toHaveLength(1);
  });

  it("resolves every card name it knows, and reports the ones it does not", async () => {
    const response = await upload([
      event("mcd-2", {
        players: [
          player("mcd-2-p1", {
            cards: [...fullList(), { name: "MCD Missing", zone: "main", quantity: 1 }],
          }),
        ],
      }),
    ]);
    const body = await readJson(response);

    expect(body.unresolvedCards).toMatchObject([
      { eventExternalId: "mcd-2", names: ["MCD Missing"] },
    ]);
  });

  it("shows a submitted list with its unmatched names called out", async () => {
    const listed = await queue();
    const withCards = (listed.overlays as { cards: unknown[]; unresolvedNames: string[] }[]).find(
      (row) => row.unresolvedNames.length > 0,
    );

    expect(withCards?.unresolvedNames).toEqual(["MCD Missing"]);
  });

  it("mints the live event when a proposal is accepted, and files its field under it", async () => {
    const listed = await queue();
    const proposal = (listed.overlays as { id: string; kind: string; proposedName: string }[]).find(
      (row) => row.kind === "event" && row.proposedName === "MCD mcd-1",
    );

    const response = await post(`/meta/overlays/events/${proposal?.id}/accept`);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ created: true });
    createdMetaEventIds.push(body.metaEventId as string);

    const players = await ctx!.db
      .selectFrom("metaEventPlayerOverlays")
      .select(["metaEventId", "eventOverlayId"])
      .where("id", "in", (eb) => eb.selectFrom("metaEventPlayerOverlays").select("id"))
      .execute();
    expect(players.some((row) => row.metaEventId === body.metaEventId)).toBe(true);
  });

  it("refuses to accept an entry whose event is still only proposed", async () => {
    const listed = await queue();
    const orphan = (
      listed.overlays as { id: string; kind: string; metaEventId: string | null }[]
    ).find((row) => row.kind === "player" && row.metaEventId === null);

    const response = await post(`/meta/overlays/players/${orphan?.id}/accept`);

    expect(response.status).toBe(409);
  });

  it("leaves a rejected overlay in place, settled rather than deleted", async () => {
    const listed = await queue();
    const target = (listed.overlays as { id: string; kind: string }[])[0];

    const response = await post(`/meta/overlays/${target?.kind}/${target?.id}/reject`);

    expect(response.status).toBe(200);
    const row = await ctx!.db
      .selectFrom("metaEventOverlays")
      .select("status")
      .where("id", "=", target?.id ?? "")
      .executeTakeFirst();
    const playerRow = await ctx!.db
      .selectFrom("metaEventPlayerOverlays")
      .select("status")
      .where("id", "=", target?.id ?? "")
      .executeTakeFirst();
    expect(row?.status ?? playerRow?.status).toBe("rejected");
  });

  it("drops a dismissed key out of the next upload", async () => {
    await post("/meta/source-events/ignore", { provider: PROVIDER, externalId: "mcd-3" });

    const response = await upload([event("mcd-3")]);
    const body = await readJson(response);

    expect(body).toMatchObject({ newEvents: 0, ignoredSkipped: 1 });
  });

  it("lists the dismissed key and takes it back off the list", async () => {
    const listed = await readJson(await get("/meta/ignored"));
    expect(listed.events).toMatchObject([{ provider: PROVIDER, externalId: "mcd-3" }]);

    const removed = await post("/meta/source-events/unignore", {
      provider: PROVIDER,
      externalId: "mcd-3",
    });
    expect(removed.status).toBe(200);

    const second = await post("/meta/source-events/unignore", {
      provider: PROVIDER,
      externalId: "mcd-3",
    });
    expect(second.status).toBe(404);
  });

  it("re-opens review when a provider re-uploads an event it already sent", async () => {
    await upload([event("mcd-4")]);
    const first = await ctx!.db
      .selectFrom("metaEventOverlays")
      .select(["id", "status"])
      .where("provider", "=", PROVIDER)
      .where("externalId", "=", "mcd-4")
      .executeTakeFirstOrThrow();

    await ctx!.db
      .updateTable("metaEventOverlays")
      .set({ status: "accepted", acceptedAt: new Date() })
      .where("id", "=", first.id)
      .execute();

    const response = await upload([event("mcd-4", { name: "MCD Renamed" })]);
    const body = await readJson(response);

    expect(body).toMatchObject({ updatedEvents: 1 });
    const after = await ctx!.db
      .selectFrom("metaEventOverlays")
      .select(["id", "status", "name"])
      .where("id", "=", first.id)
      .executeTakeFirstOrThrow();
    expect(after).toMatchObject({ status: "pending", name: "MCD Renamed" });
  });

  it("refuses an overlay holding a value it does not claim", async () => {
    await expect(
      ctx!.db
        .insertInto("metaEventOverlays")
        .values({
          provider: PROVIDER,
          externalId: "mcd-mask",
          name: "MCD Unclaimed",
          claimedFields: ["tier"],
          submittedByUserId: USER_ID,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("refuses an overlay that claims a field outside the vocabulary", async () => {
    await expect(
      ctx!.db
        .insertInto("metaEventOverlays")
        .values({
          provider: PROVIDER,
          externalId: "mcd-vocab",
          claimedFields: ["notAField"] as never,
          submittedByUserId: USER_ID,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("reports drift between a live event and nothing linked to it", async () => {
    const metaEventId = createdMetaEventIds[0];
    const response = await get(`/meta/events/${metaEventId}/drift`);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.sources).toMatchObject([
      { provider: PROVIDER, externalId: "mcd-1", hasMirror: false },
    ]);
    expect((body.fields as { field: string }[]).map((row) => row.field)).toContain("name");
  });

  it("keeps the seeded cards addressable, so the fixtures stay honest", () => {
    expect(legendCardId).toBeDefined();
    expect(mainCardId).toBeDefined();
  });
});
