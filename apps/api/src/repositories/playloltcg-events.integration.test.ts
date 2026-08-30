import { afterAll, describe, expect, it } from "vitest";

import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { createDbContext } from "../test/integration-context.js";
import type { PlayloltcgUpsertInput } from "./playloltcg-events.js";
import { playloltcgEventsRepo } from "./playloltcg-events.js";

// The mirror is one source's table with no provider column, so isolation is by
// key: the source's own `activityShopId`s are six-digit, and every row this file
// writes sits in a 990_0xx block nothing else touches. The candidate rows it
// links do carry a provider, and it has to be the real one, since the mirror's
// joins pin it.

const ctx = createDbContext(crypto.randomUUID());

const KEYS = {
  hashed: 990_001,
  gone: 990_002,
  fresh: 990_003,
  live: 990_004,
  out: 990_005,
  queued: 990_006,
  linked: 990_007,
  sortA: 990_008,
  sortB: 990_009,
  sortC: 990_010,
} as const;
const ALL_KEYS = Object.values(KEYS);

/** The store this file invents, well clear of the source's own id space. */
const DETAIL_SHOP_ID = 990_101;

const SEEN = new Date("2026-08-20T12:00:00Z");

const createdEventIds: string[] = [];
const createdCandidateIds: string[] = [];

function row(overrides: Partial<PlayloltcgUpsertInput> = {}): PlayloltcgUpsertInput {
  return {
    activityShopId: KEYS.hashed,
    shopName: "卡之域卡牌",
    name: "本命传奇挑战",
    activityType: "rune_competition",
    activityTypeName: "符文竞技",
    battleMode: "1v1",
    status: 5,
    startAt: "2026-08-15",
    endAt: "2026-08-15",
    playerCount: 41,
    maxUser: 66,
    fee: 0,
    province: "广东省",
    city: "深圳市",
    area: "福田区",
    address: "华强北世纪汇商场6层",
    longitude: 114.083809,
    latitude: 22.541325,
    contentHash: "hash-1",
    ...overrides,
  };
}

/** A live event and a candidate linking the given catalogue key to it. */
async function seedAcceptedCandidate(
  activityShopId: number,
  values: { fetchedAt?: Date } = {},
): Promise<string> {
  const live = await ctx!.db
    .insertInto("metaEvents")
    .values({
      slug: `plt-${activityShopId}-${crypto.randomUUID().slice(0, 8)}`,
      name: `PLT ${activityShopId}`,
      eventDate: "2026-08-15",
      format: "freeform",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  createdEventIds.push(live.id);

  const candidate = await ctx!.db
    .insertInto("candidateMetaEvents")
    .values({
      provider: PLAYLOLTCG_PROVIDER,
      externalId: String(activityShopId),
      name: `PLT ${activityShopId}`,
      eventDate: "2026-08-15",
      format: "freeform",
      metaEventId: live.id,
      fetchedAt: values.fetchedAt ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  createdCandidateIds.push(candidate.id);
  return candidate.id;
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db
    .deleteFrom("playloltcgEventChecks")
    .where("activityShopId", "in", ALL_KEYS)
    .execute();
  await ctx.db.deleteFrom("playloltcgEvents").where("activityShopId", "in", ALL_KEYS).execute();
  await ctx.db.deleteFrom("playloltcgShops").where("id", "=", DETAIL_SHOP_ID).execute();
  await ctx.db
    .deleteFrom("ignoredCandidateMetaEvents")
    .where("provider", "=", PLAYLOLTCG_PROVIDER)
    .where("externalId", "in", ALL_KEYS.map(String))
    .execute();
  if (createdCandidateIds.length > 0) {
    await ctx.db.deleteFrom("candidateMetaEvents").where("id", "in", createdCandidateIds).execute();
  }
  if (createdEventIds.length > 0) {
    await ctx.db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
  }
});

describe.skipIf(!ctx)("playloltcgEventsRepo", () => {
  const repo = () => playloltcgEventsRepo(ctx!.db);

  it("hash-gates the upsert and hands the start day back as a string", async () => {
    const first = await repo().upsertBatch([row()], SEEN);
    expect(first.inserted).toEqual([KEYS.hashed]);

    const stored = await repo().byKey(KEYS.hashed);
    // `start_at` is a `date` column: anything that treats it as a Date crashes.
    expect(stored?.startAt).toBe("2026-08-15");
    expect(stored?.endAt).toBe("2026-08-15");

    const later = new Date(SEEN.getTime() + 60_000);
    const again = await repo().upsertBatch([row()], later);
    expect(again).toMatchObject({ inserted: [], changed: [], unchanged: [KEYS.hashed] });
    const reseen = await repo().byKey(KEYS.hashed);
    expect(reseen?.lastSeenAt.getTime()).toBe(later.getTime());

    const moved = await repo().upsertBatch([row({ status: 4, contentHash: "hash-2" })], later);
    expect(moved.changed).toEqual([KEYS.hashed]);
    const rewritten = await repo().byKey(KEYS.hashed);
    expect(rewritten?.status).toBe(4);
  });

  it("flags a row a covering crawl stopped returning, and never deletes it", async () => {
    await repo().upsertBatch([row({ activityShopId: KEYS.gone, contentHash: "h-gone" })], SEEN);

    const flagged = await repo().markMissing({
      from: "2026-08-01",
      to: "2026-09-01",
      seenBefore: new Date(SEEN.getTime() + 1000),
      at: new Date(SEEN.getTime() + 1000),
    });

    expect(flagged).toBeGreaterThanOrEqual(1);
    const flaggedRow = await repo().byKey(KEYS.gone);
    expect(flaggedRow?.missingSince).not.toBeNull();

    // A crawl that sees it again clears the flag.
    await repo().upsertBatch(
      [row({ activityShopId: KEYS.gone, contentHash: "h-gone" })],
      new Date(SEEN.getTime() + 2000),
    );
    const cleared = await repo().byKey(KEYS.gone);
    expect(cleared?.missingSince).toBeNull();
  });

  it("leaves a row outside the crawled day range alone", async () => {
    await repo().upsertBatch(
      [row({ activityShopId: KEYS.fresh, startAt: "2026-11-20", contentHash: "h-fresh" })],
      SEEN,
    );

    await repo().markMissing({
      from: "2026-08-01",
      to: "2026-09-01",
      seenBefore: new Date(SEEN.getTime() + 1000),
      at: new Date(SEEN.getTime() + 1000),
    });

    const untouched = await repo().byKey(KEYS.fresh);
    expect(untouched?.missingSince).toBeNull();
  });

  it("derives triage state from the candidate link and the ignore table", async () => {
    await repo().upsertBatch(
      [
        row({ activityShopId: KEYS.live, contentHash: "h-live" }),
        row({ activityShopId: KEYS.out, contentHash: "h-out" }),
      ],
      SEEN,
    );
    await seedAcceptedCandidate(KEYS.live);
    await ctx!.db
      .insertInto("ignoredCandidateMetaEvents")
      .values({ provider: PLAYLOLTCG_PROVIDER, externalId: String(KEYS.out) })
      .execute();

    const [fresh, accepted, ignored] = await Promise.all([
      repo().byKey(KEYS.fresh),
      repo().byKey(KEYS.live),
      repo().byKey(KEYS.out),
    ]);
    expect(fresh?.triage).toBe("new");
    expect(accepted?.triage).toBe("accepted");
    expect(ignored?.triage).toBe("dismissed");

    const unaccepted = await repo().unacceptedByKeys([KEYS.fresh, KEYS.live, KEYS.out]);
    const keys = unaccepted.map((entry) => entry.activityShopId);
    expect(keys).toContain(KEYS.fresh);
    expect(keys).not.toContain(KEYS.live);
    expect(keys).not.toContain(KEYS.out);
  });

  it("links an event to the store the detail named, upserting the store first", async () => {
    await repo().upsertBatch([row({ activityShopId: KEYS.linked, contentHash: "h-link" })], SEEN);

    await repo().linkShopFromDetail(KEYS.linked, { id: DETAIL_SHOP_ID, name: "元宇宙卡牌" });

    const stored = await repo().byKey(KEYS.linked);
    expect(stored?.shopId).toBe(DETAIL_SHOP_ID);
    // The linked store's current name wins over the listing's own fallback.
    expect(stored?.shopDisplayName).toBe("元宇宙卡牌");
  });

  it("queues an accepted event and drains it when its visit comes due", async () => {
    await repo().upsertBatch([row({ activityShopId: KEYS.queued, contentHash: "h-queue" })], SEEN);
    await seedAcceptedCandidate(KEYS.queued);

    const due = new Date("2026-08-25T00:00:00Z");
    await repo().setRecheck(KEYS.queued, { nextCheckAt: due, checkStage: 2 });

    const ready = await repo().dueForRecheck(new Date("2026-08-26T00:00:00Z"), 50);
    const mine = ready.find((entry) => entry.activityShopId === KEYS.queued);
    expect(mine?.checkStage).toBe(2);

    const notYet = await repo().dueForRecheck(new Date("2026-08-24T00:00:00Z"), 50);
    expect(notYet.map((entry) => entry.activityShopId)).not.toContain(KEYS.queued);

    await repo().setRecheck(KEYS.queued, { nextCheckAt: null, checkStage: 5 });
    const drained = await repo().dueForRecheck(new Date("2027-01-01T00:00:00Z"), 50);
    expect(drained.map((entry) => entry.activityShopId)).not.toContain(KEYS.queued);
  });

  describe("ordering one page of the triage list", () => {
    /** Newest start first, and the same-day pair by key, highest first. */
    const SORTED_KEYS = [KEYS.sortB, KEYS.sortC, KEYS.sortA];

    it("orders by start day, then by key", async () => {
      await repo().upsertBatch(
        [
          row({ activityShopId: KEYS.sortA, startAt: "2026-07-01", contentHash: "h-a" }),
          row({ activityShopId: KEYS.sortB, startAt: "2026-09-01", contentHash: "h-b" }),
          row({ activityShopId: KEYS.sortC, startAt: "2026-09-01", contentHash: "h-c" }),
        ],
        SEEN,
      );

      const listed = await repo().list({ search: "本命传奇挑战" }, { limit: 200, offset: 0 });
      const ours = listed.rows
        .map((entry) => entry.activityShopId)
        .filter((key) => SORTED_KEYS.includes(key as (typeof SORTED_KEYS)[number]));

      expect(ours).toEqual(SORTED_KEYS);
      expect(listed.total).toBeGreaterThanOrEqual(ours.length);
    });
  });

  it("filters the triage list by status, player count and triage state", async () => {
    const byStatus = await repo().list({ status: 4 }, { limit: 50, offset: 0 });
    expect(byStatus.rows.every((entry) => entry.status === 4)).toBe(true);

    const byPlayers = await repo().list({ minPlayers: 41 }, { limit: 50, offset: 0 });
    expect(byPlayers.rows.every((entry) => (entry.playerCount ?? 0) >= 41)).toBe(true);

    const dismissed = await repo().list({ triage: "dismissed" }, { limit: 50, offset: 0 });
    expect(dismissed.rows.every((entry) => entry.triage === "dismissed")).toBe(true);

    const counts = await repo().triageCounts();
    expect(counts.new + counts.accepted + counts.dismissed).toBeGreaterThan(0);
  });

  it("counts finished events and fetched ones as separate figures", async () => {
    await seedAcceptedCandidate(KEYS.linked, { fetchedAt: new Date("2026-08-21T06:00:00Z") });

    const overview = await repo().syncOverview();

    expect(overview.total).toBeGreaterThanOrEqual(ALL_KEYS.length);
    expect(overview.completed).toBeGreaterThanOrEqual(1);
    expect(overview.decklistPublished).toBeGreaterThanOrEqual(1);
    expect(overview.acceptedAwaitingResults).toBeGreaterThanOrEqual(1);
    expect(overview.lastSeenAt).not.toBeNull();
  });
});
