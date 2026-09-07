import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../../../test/integration-context.js";
import { PLAYLOLTCG_PROVIDER } from "../lib/playloltcg-catalog.js";
import { TOPDECK_PROVIDER } from "../lib/topdeck-catalog.js";
import { metaRepo } from "./meta.js";
import type { TopdeckUpsertInput } from "./topdeck-events.js";
import { topdeckEventsRepo } from "./topdeck-events.js";

// The mirror table has no provider column, so isolation is by key: every tid
// this file writes carries the `tdi-` prefix.

const ctx = createDbContext(crypto.randomUUID());

const KEYS = {
  hashed: "tdi-hashed",
  gone: "tdi-gone",
  fresh: "tdi-fresh",
  live: "tdi-live",
  dismissed: "tdi-dismissed",
  sortA: "tdi-sort-a",
  sortB: "tdi-sort-b",
  sortC: "tdi-sort-c",
  sealed: "tdi-sealed",
  rival: "tdi-rival",
  rivalRead: "tdi-rival-read",
} as const;
const ALL_KEYS = Object.values(KEYS);

const SEEN = new Date("2026-09-04T12:00:00Z");
const STARTED = new Date("2026-08-20T18:00:00Z");

const createdEventIds: string[] = [];

function row(overrides: Partial<TopdeckUpsertInput> = {}): TopdeckUpsertInput {
  return {
    tid: KEYS.hashed,
    name: "TDI Summoner Skirmish",
    format: "Constructed",
    startAt: STARTED,
    swissRounds: 9,
    topCut: 16,
    playerCount: 41,
    isTeamEvent: false,
    teamSize: null,
    city: "Kissimmee",
    state: "Florida",
    country: "US",
    address: "1875 Silver Spur Ln",
    longitude: -81.369,
    latitude: 28.298,
    contentHash: "hash-1",
    ...overrides,
  };
}

/** A live event and a citation linking the given catalogue key to it. */
async function seedAccepted(tid: string, alsoCitedBy?: string): Promise<string> {
  const repo = metaRepo(ctx!.db);
  const live = await ctx!.db
    .insertInto("metaEvents")
    .values({
      slug: `tdi-${crypto.randomUUID().slice(0, 8)}`,
      name: `TDI ${tid}`,
      eventDate: "2026-08-20",
      format: "freeform",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  createdEventIds.push(live.id);

  if (alsoCitedBy !== undefined) {
    await repo.insertEventSource({
      metaEventId: live.id,
      provider: alsoCitedBy,
      externalId: `${tid}-other`,
      label: alsoCitedBy,
      sourceUrl: null,
    });
  }
  await repo.insertEventSource({
    metaEventId: live.id,
    provider: TOPDECK_PROVIDER,
    externalId: tid,
    label: TOPDECK_PROVIDER,
    sourceUrl: null,
  });
  return live.id;
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db.deleteFrom("topdeckEventStandings").where("tid", "in", ALL_KEYS).execute();
  await ctx.db.deleteFrom("topdeckEvents").where("tid", "in", ALL_KEYS).execute();
  await ctx.db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
  await ctx.db
    .deleteFrom("ignoredMetaSourceEvents")
    .where("provider", "=", TOPDECK_PROVIDER)
    .where("externalId", "in", ALL_KEYS)
    .execute();
});

describe.skipIf(!ctx)("topdeckEventsRepo", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = topdeckEventsRepo(db);

  describe("upsertBatch", () => {
    it("inserts a new row, then costs an unchanged one only a last-seen write", async () => {
      const first = await repo.upsertBatch([row()], SEEN);
      const later = new Date(SEEN.getTime() + 60_000);
      const second = await repo.upsertBatch([row()], later);

      expect(first.inserted).toEqual([KEYS.hashed]);
      expect(second).toMatchObject({ inserted: [], changed: [], unchanged: [KEYS.hashed] });
      const stored = await repo.byKey(KEYS.hashed);
      expect(stored?.lastSeenAt.toISOString()).toBe(later.toISOString());
    });

    it("reports a row whose hash moved as changed", async () => {
      await repo.upsertBatch([row({ tid: KEYS.fresh })], SEEN);
      const result = await repo.upsertBatch(
        [row({ tid: KEYS.fresh, playerCount: 64, contentHash: "hash-2" })],
        SEEN,
      );

      expect(result.changed).toEqual([KEYS.fresh]);
      const stored = await repo.byKey(KEYS.fresh);
      expect(stored?.playerCount).toBe(64);
    });

    it("clears the missing flag when a row comes back", async () => {
      await repo.upsertBatch([row({ tid: KEYS.gone })], SEEN);
      await repo.markMissing({
        format: "Constructed",
        from: new Date(STARTED.getTime() - 1000),
        to: new Date(STARTED.getTime() + 1000),
        seenBefore: new Date(SEEN.getTime() + 1000),
        at: SEEN,
      });
      const flagged = await repo.byKey(KEYS.gone);
      expect(flagged?.missingSince).not.toBeNull();

      await repo.upsertBatch([row({ tid: KEYS.gone })], new Date(SEEN.getTime() + 60_000));

      const back = await repo.byKey(KEYS.gone);
      expect(back?.missingSince).toBeNull();
    });
  });

  describe("requeueResults", () => {
    it("makes the next pass read the row as changed, so its results are written again", async () => {
      await repo.upsertBatch([row({ tid: KEYS.live })], SEEN);
      await repo.requeueResults([KEYS.live]);

      const result = await repo.upsertBatch([row({ tid: KEYS.live })], SEEN);

      expect(result.changed).toEqual([KEYS.live]);
    });
  });

  describe("markMissing", () => {
    it("only flags rows of the format it was asked about", async () => {
      await repo.upsertBatch(
        [row({ tid: KEYS.sealed, format: "Sealed" }), row({ tid: KEYS.sortA })],
        SEEN,
      );

      await repo.markMissing({
        format: "Sealed",
        from: new Date(STARTED.getTime() - 1000),
        to: new Date(STARTED.getTime() + 1000),
        seenBefore: new Date(SEEN.getTime() + 1000),
        at: SEEN,
      });

      const sealed = await repo.byKey(KEYS.sealed);
      const other = await repo.byKey(KEYS.sortA);
      expect(sealed?.missingSince).not.toBeNull();
      expect(other?.missingSince).toBeNull();
    });
  });

  describe("triage", () => {
    it("calls an uncited, unignored row new", async () => {
      await repo.upsertBatch([row({ tid: KEYS.sortB })], SEEN);
      const stored = await repo.byKey(KEYS.sortB);
      expect(stored?.triage).toBe("new");
    });

    it("calls a cited row accepted and names the live event", async () => {
      await repo.upsertBatch([row({ tid: KEYS.sortC })], SEEN);
      const metaEventId = await seedAccepted(KEYS.sortC);

      const stored = await repo.byKey(KEYS.sortC);

      expect(stored?.triage).toBe("accepted");
      expect(stored?.metaEventId).toBe(metaEventId);
    });

    it("calls an ignored row dismissed even after it was cited", async () => {
      await repo.upsertBatch([row({ tid: KEYS.dismissed })], SEEN);
      await seedAccepted(KEYS.dismissed);
      await db
        .insertInto("ignoredMetaSourceEvents")
        .values({ provider: TOPDECK_PROVIDER, externalId: KEYS.dismissed })
        .execute();

      const stored = await repo.byKey(KEYS.dismissed);
      expect(stored?.triage).toBe("dismissed");
    });
  });

  describe("rivalProvider", () => {
    it("names the provider the linked live event already reads", async () => {
      await repo.upsertBatch([row({ tid: KEYS.rival })], SEEN);
      await seedAccepted(KEYS.rival, PLAYLOLTCG_PROVIDER);

      const stored = await repo.byKey(KEYS.rival);
      expect(stored?.rivalProvider).toBe(PLAYLOLTCG_PROVIDER);
    });

    it("says nothing for an event only this source describes", async () => {
      const stored = await repo.byKey(KEYS.sortC);
      expect(stored?.rivalProvider).toBeNull();
    });

    it("says nothing once the cross-mirror review has let this citation contribute", async () => {
      await repo.upsertBatch([row({ tid: KEYS.rivalRead })], SEEN);
      const metaEventId = await seedAccepted(KEYS.rivalRead, PLAYLOLTCG_PROVIDER);
      const meta = metaRepo(ctx!.db);
      const sources = await meta.sourcesForEvent(metaEventId);
      const own = sources.find((source) => source.provider === TOPDECK_PROVIDER);
      await meta.setEventSourceContributes(own?.id ?? "", true);

      const stored = await repo.byKey(KEYS.rivalRead);
      expect(stored?.rivalProvider).toBeNull();
    });
  });

  describe("list", () => {
    it("filters on the source's own format word", async () => {
      const { rows } = await repo.list(
        { format: "Sealed", search: "TDI" },
        { limit: 50, offset: 0 },
      );
      expect(rows.map((r) => r.tid)).toEqual([KEYS.sealed]);
    });

    it("reads a calendar-day bound against the instant the source publishes", async () => {
      const { rows } = await repo.list(
        { search: "TDI", dateFrom: "2026-08-20", dateTo: "2026-08-20" },
        { limit: 50, offset: 0 },
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.startAt.toISOString() === STARTED.toISOString())).toBe(true);
    });

    it("excludes a day the events fall outside", async () => {
      const { total } = await repo.list(
        { search: "TDI", dateFrom: "2026-08-21" },
        { limit: 50, offset: 0 },
      );
      expect(total).toBe(0);
    });

    it("filters on the minimum field size", async () => {
      const { rows } = await repo.list({ search: "TDI", minPlayers: 64 }, { limit: 50, offset: 0 });
      expect(rows.map((r) => r.tid)).toEqual([KEYS.fresh]);
    });
  });

  describe("cardsByShortCode", () => {
    it("answers nothing for an empty list rather than querying", async () => {
      const bridge = await repo.cardsByShortCode([]);
      expect(bridge.size).toBe(0);
    });
  });

  describe("syncOverview", () => {
    it("reports zero for the queue counters, since this source has no queue", async () => {
      const overview = await repo.syncOverview();
      expect(overview).toMatchObject({ queued: 0, dueRecheck: 0, acceptedAwaitingResults: 0 });
      expect(overview.total).toBeGreaterThan(0);
    });
  });
});
