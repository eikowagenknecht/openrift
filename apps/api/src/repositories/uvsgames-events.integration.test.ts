import { afterAll, describe, expect, it } from "vitest";

import { UVSGAMES_PROVIDER } from "../lib/uvsgames-catalog.js";
import { createDbContext } from "../test/integration-context.js";
import type { UvsgamesUpsertInput } from "./uvsgames-events.js";
import { uvsgamesEventsRepo } from "./uvsgames-events.js";

// The mirror has no provider column, so isolation is by key: every event
// this file writes is `mtc-`-prefixed. `meta_sync_settings` is the
// migration's singleton and is restored in afterAll.

const ctx = createDbContext(crypto.randomUUID());

const EXTERNAL_IDS = [
  "mtc-1",
  "mtc-gone",
  "mtc-new",
  "mtc-live",
  "mtc-out",
  "mtc-cover",
  "mtc-empty",
  "mtc-done",
  "mtc-soon",
  "mtc-acc-gone",
  "mtc-official",
  "mtc-tpl-1",
  "mtc-tpl-2",
  "mtc-avg-ran",
  "mtc-avg-unrated",
  "mtc-avg-upcoming",
  "mtc-fmt-1",
  "mtc-store-1",
  "mtc-store-2",
  "mtc-queue-1",
  "mtc-wait",
  "mtc-wait-done",
  "mtc-sort-a",
  "mtc-sort-b",
  "mtc-sort-c",
  "mtc-dismissed-after-accept",
];

const STORE_ID = 990_001;
const SEEN = new Date("2026-08-20T12:00:00Z");

const createdEventIds: string[] = [];
const createdCardIds: string[] = [];

function row(overrides: Partial<UvsgamesUpsertInput> = {}): UvsgamesUpsertInput {
  return {
    externalId: "mtc-1",
    name: "MTC Regional",
    startAt: new Date("2026-08-15T18:00:00Z"),
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: null,
    playerCount: 64,
    eventType: "LOCALS",
    eventFormat: "CONSTRUCTED",
    storeId: null,
    storeName: "MTC Store",
    location: null,
    timezone: "UTC",
    eventConfigurationTemplate: null,
    contentHash: "hash-1",
    ...overrides,
  };
}

async function seedAcceptedEvent(
  externalId: string,
  values: { fetchedAt?: Date } = {},
): Promise<string> {
  const live = await ctx!.db
    .insertInto("metaEvents")
    .values({
      slug: `mtc-${externalId}-${crypto.randomUUID().slice(0, 8)}`,
      name: `MTC ${externalId}`,
      eventDate: "2026-08-15",
      format: "freeform",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  createdEventIds.push(live.id);

  await ctx!.db
    .insertInto("metaEventSources")
    .values({
      metaEventId: live.id,
      provider: UVSGAMES_PROVIDER,
      externalId,
      label: UVSGAMES_PROVIDER,
      sourceUrl: null,
    })
    .execute();

  if (values.fetchedAt !== undefined) {
    await ctx!.db
      .insertInto("uvsgamesEventStandings")
      .values({
        externalId,
        registrationId: "reg-1",
        playerName: "Seeded",
        rank: 1,
        fetchedAt: values.fetchedAt,
      })
      .execute();
  }
  return live.id;
}

afterAll(async () => {
  if (!ctx) {
    return;
  }
  await ctx.db
    .deleteFrom("uvsgamesEventStandings")
    .where("externalId", "in", EXTERNAL_IDS)
    .execute();
  await ctx.db.deleteFrom("uvsgamesEvents").where("externalId", "in", EXTERNAL_IDS).execute();
  await ctx.db.deleteFrom("uvsgamesStores").where("id", "=", STORE_ID).execute();
  await ctx.db
    .deleteFrom("uvsgamesEventTemplates")
    .where("templateId", "in", ["mtc-template-a", "mtc-template-b", "mtc-template-avg"])
    .execute();
  await ctx.db
    .deleteFrom("uvsgamesFormatMappings")
    .where("sourceFormat", "=", "MTC Sealed")
    .execute();
  await ctx.db
    .deleteFrom("ignoredMetaSourceEvents")
    .where("provider", "=", UVSGAMES_PROVIDER)
    .where("externalId", "in", EXTERNAL_IDS)
    .execute();
  if (createdEventIds.length > 0) {
    await ctx.db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
  }
  if (createdCardIds.length > 0) {
    await ctx.db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
  }
  await ctx.db
    .updateTable("metaSyncSettings")
    .set({
      autoAcceptMinPlayers: null,
      autoAcceptNotable: false,
      autoAcceptOfficial: false,
      competitivePlayerFloor: 128,
    })
    .where("id", "=", 1)
    .execute();
});

describe.skipIf(!ctx)("uvsgamesEventsRepo", () => {
  const repo = () => uvsgamesEventsRepo(ctx!.db);

  it("hash-gates the upsert: unchanged rows only move last_seen_at", async () => {
    const first = await repo().upsertBatch([row()], SEEN);
    expect(first.inserted).toEqual(["mtc-1"]);

    const later = new Date(SEEN.getTime() + 60_000);
    const again = await repo().upsertBatch([row()], later);
    expect(again).toMatchObject({ inserted: [], changed: [], unchanged: ["mtc-1"] });

    const stored = await repo().byKey("mtc-1");
    expect(stored?.lastSeenAt.getTime()).toBe(later.getTime());

    const moved = await repo().upsertBatch(
      [row({ displayStatus: "inProgress", contentHash: "hash-2" })],
      later,
    );
    expect(moved.changed).toEqual(["mtc-1"]);
    const reread = await repo().byKey("mtc-1");
    expect(reread?.displayStatus).toBe("inProgress");
  });

  it("flags a row a covering crawl stopped returning, then clears the flag once seen again", async () => {
    await repo().upsertBatch([row({ externalId: "mtc-gone" })], SEEN);

    const flagged = await repo().markMissing({
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-09-01T00:00:00Z"),
      seenBefore: new Date(SEEN.getTime() + 1000),
      at: new Date(SEEN.getTime() + 1000),
    });

    expect(flagged).toBeGreaterThanOrEqual(1);
    const stored = await repo().byKey("mtc-gone");
    expect(stored?.missingSince).not.toBeNull();

    await repo().upsertBatch([row({ externalId: "mtc-gone" })], new Date(SEEN.getTime() + 2000));
    const reseen = await repo().byKey("mtc-gone");
    expect(reseen?.missingSince).toBeNull();
  });

  it("derives triage state from the candidate link and the ignore table", async () => {
    await repo().upsertBatch(
      [
        row({ externalId: "mtc-new", contentHash: "h-new" }),
        row({ externalId: "mtc-live", contentHash: "h-live" }),
        row({ externalId: "mtc-out", contentHash: "h-out" }),
      ],
      SEEN,
    );

    const live = await ctx!.db
      .insertInto("metaEvents")
      .values({
        slug: `mtc-live-${crypto.randomUUID().slice(0, 8)}`,
        name: "MTC Live",
        eventDate: "2026-08-15",
        format: "freeform",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    createdEventIds.push(live.id);

    await ctx!.db
      .insertInto("metaEventSources")
      .values({
        metaEventId: live.id,
        provider: UVSGAMES_PROVIDER,
        externalId: "mtc-live",
        label: UVSGAMES_PROVIDER,
        sourceUrl: null,
      })
      .execute();

    await ctx!.db
      .insertInto("ignoredMetaSourceEvents")
      .values({ provider: UVSGAMES_PROVIDER, externalId: "mtc-out" })
      .execute();

    const [fresh, accepted, ignored] = await Promise.all([
      repo().byKey("mtc-new"),
      repo().byKey("mtc-live"),
      repo().byKey("mtc-out"),
    ]);
    expect(fresh?.triage).toBe("new");
    expect(accepted?.triage).toBe("accepted");
    expect(ignored?.triage).toBe("dismissed");

    const unaccepted = await repo().unacceptedByKeys(["mtc-new", "mtc-live", "mtc-out"]);
    expect(unaccepted.map((entry) => entry.externalId)).toContain("mtc-new");
    expect(unaccepted.map((entry) => entry.externalId)).not.toContain("mtc-live");
    expect(unaccepted.map((entry) => entry.externalId)).not.toContain("mtc-out");
  });

  it("looks up more keys than one id list can bind", async () => {
    // One bind parameter per key, so a long backfill overruns postgres's
    // 65534-parameter ceiling.
    const keys = [
      "mtc-new",
      ...Array.from({ length: 70_000 }, (_entry, index) => `mtc-absent-${index}`),
    ];

    const unaccepted = await repo().unacceptedByKeys(keys);

    expect(unaccepted.map((entry) => entry.externalId)).toContain("mtc-new");
  });

  it("names every key still awaiting triage, for the backlog sweep", async () => {
    const keys = await repo().newKeys();

    expect(keys).toContain("mtc-new");
    expect(keys).not.toContain("mtc-live");
    expect(keys).not.toContain("mtc-out");
  });

  it("filters and pages the triage list", async () => {
    const filtered = await repo().list(
      { search: "Regional", triage: "new" },
      { limit: 2, offset: 0 },
    );

    expect(filtered.rows.length).toBeLessThanOrEqual(2);
    expect(filtered.rows.every((entry) => entry.triage === "new")).toBe(true);
    expect(filtered.total).toBeGreaterThanOrEqual(filtered.rows.length);

    const counts = await repo().triageCounts();
    expect(counts.new + counts.accepted + counts.dismissed).toBeGreaterThan(0);
  });

  it("splits the catalogue into the same three buckets the counts report", async () => {
    const key = "mtc-dismissed-after-accept";
    await repo().upsertBatch([row({ externalId: key, contentHash: "h-both" })], SEEN);
    const live = await ctx!.db
      .insertInto("metaEvents")
      .values({
        slug: `uvs-${key}`,
        name: "UVS dismissed after accept",
        eventDate: "2026-08-15",
        format: "freeform",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    createdEventIds.push(live.id);
    await ctx!.db
      .insertInto("metaEventSources")
      .values({
        metaEventId: live.id,
        provider: UVSGAMES_PROVIDER,
        externalId: key,
        label: UVSGAMES_PROVIDER,
        sourceUrl: null,
      })
      .execute();
    await ctx!.db
      .insertInto("ignoredMetaSourceEvents")
      .values({ provider: UVSGAMES_PROVIDER, externalId: key })
      .execute();
    const both = await repo().byKey(key);
    expect(both?.triage).toBe("dismissed");

    const page = { limit: 1, offset: 0 };
    const [all, listed, counts] = await Promise.all([
      repo().list({}, page),
      Promise.all([
        repo().list({ triage: "new" }, page),
        repo().list({ triage: "accepted" }, page),
        repo().list({ triage: "dismissed" }, page),
      ]),
      repo().triageCounts(),
    ]);
    const [fresh, accepted, dismissed] = listed;

    expect(fresh.total).toBe(counts.new);
    expect(accepted.total).toBe(counts.accepted);
    expect(dismissed.total).toBe(counts.dismissed);
    expect(fresh.total + accepted.total + dismissed.total).toBe(all.total);
  });

  describe("ordering one page of the triage list", () => {
    const SORTED_KEYS = ["mtc-sort-b", "mtc-sort-a", "mtc-sort-c"];

    async function ordered(order: Parameters<ReturnType<typeof repo>["list"]>[2]) {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-sort-a",
            name: "MTC Sorting Beta",
            startAt: new Date("2026-03-01T10:00:00Z"),
            playerCount: 12,
            contentHash: "h-sort-a",
          }),
          row({
            externalId: "mtc-sort-b",
            name: "MTC Sorting alpha",
            startAt: new Date("2026-05-01T10:00:00Z"),
            playerCount: 900,
            contentHash: "h-sort-b",
          }),
          row({
            externalId: "mtc-sort-c",
            name: "MTC Sorting Gamma",
            startAt: new Date("2026-04-01T10:00:00Z"),
            playerCount: null,
            contentHash: "h-sort-c",
          }),
        ],
        SEEN,
      );
      const { rows } = await repo().list(
        { search: "MTC Sorting" },
        { limit: 10, offset: 0 },
        order,
      );
      return rows.map((entry) => entry.externalId);
    }

    it("defaults to the newest events first", async () => {
      expect(await ordered(undefined)).toEqual(["mtc-sort-b", "mtc-sort-c", "mtc-sort-a"]);
    });

    it("orders by event date the other way round", async () => {
      expect(await ordered({ sort: "startAt", direction: "asc" })).toEqual([
        "mtc-sort-a",
        "mtc-sort-c",
        "mtc-sort-b",
      ]);
    });

    it("orders by name without letting case decide", async () => {
      expect(await ordered({ sort: "name", direction: "asc" })).toEqual([
        "mtc-sort-b",
        "mtc-sort-a",
        "mtc-sort-c",
      ]);
    });

    it("keeps an unknown player count out of both ends of the player sort", async () => {
      expect(await ordered({ sort: "playerCount", direction: "desc" })).toEqual([
        "mtc-sort-b",
        "mtc-sort-a",
        "mtc-sort-c",
      ]);
      expect(await ordered({ sort: "playerCount", direction: "asc" })).toEqual([
        "mtc-sort-a",
        "mtc-sort-b",
        "mtc-sort-c",
      ]);
    });

    it("carries a sort across page boundaries", async () => {
      await ordered({ sort: "playerCount", direction: "desc" });
      const order = { sort: "playerCount", direction: "desc" } as const;
      const first = await repo().list({ search: "MTC Sorting" }, { limit: 2, offset: 0 }, order);
      const second = await repo().list({ search: "MTC Sorting" }, { limit: 2, offset: 2 }, order);

      expect([...first.rows, ...second.rows].map((entry) => entry.externalId)).toEqual(SORTED_KEYS);
      expect(first.total).toBe(SORTED_KEYS.length);
    });
  });

  it("narrows to the accepted rows a deep fetch has never reached", async () => {
    await repo().upsertBatch(
      [
        row({ externalId: "mtc-wait", name: "MTC Waiting", contentHash: "h-wait" }),
        row({ externalId: "mtc-wait-done", name: "MTC Waiting Done", contentHash: "h-wait-done" }),
      ],
      SEEN,
    );
    await seedAcceptedEvent("mtc-wait");
    await seedAcceptedEvent("mtc-wait-done", {
      fetchedAt: new Date("2026-08-21T06:00:00Z"),
    });

    const { rows, total } = await repo().list({ awaitingResults: true }, { limit: 200, offset: 0 });
    const keys = rows.map((entry) => entry.externalId);
    expect(keys).toContain("mtc-wait");
    expect(keys).not.toContain("mtc-wait-done");
    expect(rows.every((entry) => entry.triage === "accepted" && entry.fetchedAt === null)).toBe(
      true,
    );
    expect(total).toBeGreaterThanOrEqual(rows.length);
  });

  it("reports what the deep fetch staged under each row's candidate", async () => {
    await repo().upsertBatch(
      [
        row({ externalId: "mtc-cover", name: "MTC Coverage", contentHash: "h-cover" }),
        row({ externalId: "mtc-empty", name: "MTC Coverage Empty", contentHash: "h-empty" }),
      ],
      SEEN,
    );

    const [legend] = await ctx!.db
      .insertInto("cards")
      .values({
        name: "MTC Legend",
        slug: "mtc-legend",
        type: "legend",
        normName: "mtc-legend",
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();
    createdCardIds.push(legend!.id);

    const fetchedAt = new Date("2026-08-21T06:00:00Z");
    await seedAcceptedEvent("mtc-cover", { fetchedAt });
    await seedAcceptedEvent("mtc-empty", { fetchedAt });

    await ctx!.db
      .insertInto("uvsgamesEventStandings")
      .values([
        {
          externalId: "mtc-cover",
          registrationId: "mtc-cover-p2",
          playerName: "MTC Ekko",
          rank: 2,
          legendName: "MTC Legend",
          sourceDeckId: "mtc-deck-1",
          fetchedAt,
        },
        {
          externalId: "mtc-cover",
          registrationId: "mtc-cover-p3",
          playerName: "MTC Vi",
          rank: 3,
          legendName: "MTC Legend",
          fetchedAt,
        },
      ])
      .execute();

    await ctx!.db
      .insertInto("uvsgamesDecklists")
      .values({
        sourceDeckId: "mtc-deck-1",
        externalId: "mtc-cover",
        fetchStatus: "fetched",
        fetchedAt,
      })
      .execute();

    const { rows } = await repo().list({ search: "MTC Coverage" }, { limit: 10, offset: 0 });
    const staged = rows.find((entry) => entry.externalId === "mtc-cover");
    expect(staged).toMatchObject({
      stagedPlayerCount: 3,
      stagedLegendCount: 2,
      stagedDeckCount: 1,
    });
    expect(staged?.fetchedAt?.toISOString()).toBe(fetchedAt.toISOString());

    expect(rows.find((entry) => entry.externalId === "mtc-empty")).toMatchObject({
      stagedPlayerCount: 1,
      stagedLegendCount: 0,
      stagedDeckCount: 0,
    });

    const bare = await repo().list(
      { search: "MTC Regional", triage: "new" },
      { limit: 10, offset: 0 },
    );
    expect(bare.rows.length).toBeGreaterThan(0);
    expect(
      bare.rows.every(
        (entry) =>
          entry.fetchedAt === null &&
          entry.stagedPlayerCount === 0 &&
          entry.stagedLegendCount === 0 &&
          entry.stagedDeckCount === 0,
      ),
    ).toBe(true);
  });

  it("returns only rows whose next visit is due, oldest first", async () => {
    const now = new Date("2026-08-25T00:00:00Z");
    await repo().setRecheck("mtc-1", {
      nextCheckAt: new Date("2026-08-24T00:00:00Z"),
      checkStage: 2,
    });
    await repo().setRecheck("mtc-new", {
      nextCheckAt: new Date("2026-09-30T00:00:00Z"),
      checkStage: 1,
    });

    const due = await repo().dueForRecheck(now, 10);

    expect(due.map((entry) => entry.externalId)).toContain("mtc-1");
    expect(due.map((entry) => entry.externalId)).not.toContain("mtc-new");
    expect(due.find((entry) => entry.externalId === "mtc-1")?.checkStage).toBe(2);
  });

  it("reads and writes the singleton sync settings", async () => {
    const updated = await repo().updateSettings({
      autoAcceptMinPlayers: 64,
      autoAcceptOfficial: true,
    });

    expect(updated).toMatchObject({
      autoAcceptMinPlayers: 64,
      autoAcceptOfficial: true,
      autoAcceptNotable: false,
    });
    expect(await repo().settings()).toMatchObject({
      autoAcceptMinPlayers: 64,
      autoAcceptOfficial: true,
      competitivePlayerFloor: 128,
    });

    await repo().updateSettings({ competitivePlayerFloor: 64 });
    expect(await repo().settings()).toMatchObject({ competitivePlayerFloor: 64 });
  });

  it("stores the source's event template and reads it back on the row", async () => {
    const template = "0cbcab3e-be80-4d1d-a450-9485e584906d";
    await repo().upsertBatch(
      [
        row({
          externalId: "mtc-official",
          name: "MTC Official",
          contentHash: "h-official",
          eventConfigurationTemplate: template,
        }),
      ],
      SEEN,
    );

    const stored = await repo().byKey("mtc-official");
    expect(stored?.eventConfigurationTemplate).toBe(template);

    const moved = await repo().upsertBatch(
      [
        row({
          externalId: "mtc-official",
          name: "MTC Official",
          contentHash: "h-official-2",
          eventConfigurationTemplate: null,
        }),
      ],
      SEEN,
    );
    expect(moved.changed).toEqual(["mtc-official"]);
    const cleared = await repo().byKey("mtc-official");
    expect(cleared?.eventConfigurationTemplate).toBeNull();
  });

  it("summarizes the catalogue for the sync panel", async () => {
    await repo().upsertBatch(
      [
        row({ externalId: "mtc-done", contentHash: "h-done", decklistStatus: "PUBLISHED" }),
        row({
          externalId: "mtc-soon",
          contentHash: "h-soon",
          displayStatus: "upcoming",
          decklistStatus: null,
        }),
      ],
      SEEN,
    );

    const overview = await repo().syncOverview();

    expect(overview.total).toBeGreaterThan(0);
    expect(overview.queued).toBeGreaterThanOrEqual(1);
    expect(overview.lastSeenAt).not.toBeNull();
    expect(overview.completed).toBeGreaterThanOrEqual(1);
    expect(overview.completed).toBeLessThan(overview.total);
    expect(overview.decklistPublished).toBeGreaterThanOrEqual(1);
    expect(overview.decklistPublished).toBeLessThanOrEqual(overview.completed);
  });

  it("counts the accepted events still waiting on results, and those gone from the listing", async () => {
    // Read as a delta: earlier tests in this file leave accepted rows of their
    // own behind, and only the one seeded here is this test's to assert.
    const before = await repo().syncOverview();

    await repo().upsertBatch(
      [row({ externalId: "mtc-acc-gone", name: "MTC Accepted Gone", contentHash: "h-acc-gone" })],
      SEEN,
    );
    await seedAcceptedEvent("mtc-acc-gone");
    await ctx!.db
      .updateTable("uvsgamesEvents")
      .set({ missingSince: SEEN })
      .where("externalId", "=", "mtc-acc-gone")
      .execute();

    const overview = await repo().syncOverview();

    expect(overview.acceptedAwaitingResults).toBe(before.acceptedAwaitingResults + 1);
    expect(overview.acceptedMissing).toBe(before.acceptedMissing + 1);
    expect(overview.missing).toBeGreaterThanOrEqual(overview.acceptedMissing);
  });
  describe("the source's vocabularies", () => {
    const TEMPLATE = "mtc-template-a";

    it("stores the vocabulary the source publishes, names and all", async () => {
      await repo().upsertTemplates([
        { templateId: TEMPLATE, sourceName: "MTC Series" },
        { templateId: "mtc-template-b", sourceName: "MTC Sideshow" },
      ]);

      const templates = await repo().listTemplates();
      expect(templates.find((entry) => entry.templateId === TEMPLATE)).toMatchObject({
        sourceName: "MTC Series",
        watched: false,
        eventCount: 0,
        sampleEventName: null,
      });
    });

    it("counts the events running a template and names the newest", async () => {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-tpl-1",
            name: "MTC Template Older",
            contentHash: "h-tpl-1",
            startAt: new Date("2026-08-10T18:00:00Z"),
            eventConfigurationTemplate: TEMPLATE,
          }),
          row({
            externalId: "mtc-tpl-2",
            name: "MTC Template Newest",
            contentHash: "h-tpl-2",
            startAt: new Date("2026-08-19T18:00:00Z"),
            eventConfigurationTemplate: TEMPLATE,
          }),
        ],
        SEEN,
      );

      const templates = await repo().listTemplates();
      const found = templates.find((entry) => entry.templateId === TEMPLATE);

      expect(found).toMatchObject({ eventCount: 2, sampleEventName: "MTC Template Newest" });
      expect(found?.lastStartAt?.toISOString()).toBe("2026-08-19T18:00:00.000Z");
    });

    it("averages the players of events that have run, not the ones still filling up", async () => {
      const AVG_TEMPLATE = "mtc-template-avg";
      const DAY_MS = 24 * 60 * 60 * 1000;
      await repo().upsertTemplates([{ templateId: AVG_TEMPLATE, sourceName: "MTC Averages" }]);
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-avg-ran",
            contentHash: "h-avg-1",
            startAt: new Date(Date.now() - 30 * DAY_MS),
            playerCount: 30,
            eventConfigurationTemplate: AVG_TEMPLATE,
          }),
          row({
            externalId: "mtc-avg-unrated",
            contentHash: "h-avg-2",
            startAt: new Date(Date.now() - 20 * DAY_MS),
            playerCount: null,
            eventConfigurationTemplate: AVG_TEMPLATE,
          }),
          row({
            externalId: "mtc-avg-upcoming",
            contentHash: "h-avg-3",
            startAt: new Date(Date.now() + 30 * DAY_MS),
            playerCount: 2,
            eventConfigurationTemplate: AVG_TEMPLATE,
          }),
        ],
        SEEN,
      );

      const templates = await repo().listTemplates();
      const found = templates.find((entry) => entry.templateId === AVG_TEMPLATE);

      expect(found).toMatchObject({ eventCount: 3, avgPlayers: 30, ranEventCount: 1 });
    });

    it("reports no average for a template none of whose events have run", async () => {
      const templates = await repo().listTemplates();
      const found = templates.find((entry) => entry.templateId === "mtc-template-b");

      expect(found).toMatchObject({ avgPlayers: null, ranEventCount: 0 });
    });

    it("refreshes a renamed template without touching the watch flag", async () => {
      await repo().updateTemplate(TEMPLATE, { watched: true });
      await repo().upsertTemplates([{ templateId: TEMPLATE, sourceName: "MTC Series Renamed" }]);

      const templates = await repo().listTemplates();
      const found = templates.find((entry) => entry.templateId === TEMPLATE);
      expect(found).toMatchObject({ sourceName: "MTC Series Renamed", watched: true });
    });

    it("watches a template, which is what puts it in the poll's set", async () => {
      const updated = await repo().updateTemplate(TEMPLATE, { watched: true });

      expect(updated).toMatchObject({ watched: true, eventCount: 2 });
      const watched = await repo().watchedTemplates();
      expect(watched.get(TEMPLATE)).toBe("MTC Series Renamed");
    });

    it("drops an un-watched template out of that set but keeps its row", async () => {
      const updated = await repo().updateTemplate(TEMPLATE, { watched: false });

      expect(updated).toMatchObject({ sourceName: "MTC Series Renamed", watched: false });
      const watched = await repo().watchedTemplates();
      expect(watched.has(TEMPLATE)).toBe(false);
    });

    it("refuses to watch a template the source never published", async () => {
      expect(
        await repo().updateTemplate("mtc-template-never-seen", { watched: true }),
      ).toBeUndefined();
    });

    it("gives a nameless row to a template id only the mirror carries", async () => {
      await ctx?.db
        .deleteFrom("uvsgamesEventTemplates")
        .where("templateId", "=", TEMPLATE)
        .execute();

      await repo().discoverTemplatesFromEvents();

      const templates = await repo().listTemplates();
      const found = templates.find((entry) => entry.templateId === TEMPLATE);
      expect(found).toMatchObject({ sourceName: null, watched: false, eventCount: 2 });
    });

    it("discovers the format strings the listing carries", async () => {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-fmt-1",
            name: "MTC Sealed Night",
            contentHash: "h-fmt-1",
            eventFormat: "MTC Sealed",
          }),
        ],
        SEEN,
      );

      const formats = await repo().listFormats();
      expect(formats.find((entry) => entry.sourceFormat === "MTC Sealed")).toEqual({
        sourceFormat: "MTC Sealed",
        eventCount: 1,
        mappedFormat: null,
      });
    });

    it("maps a format, matches it however the source cased it, and un-maps it again", async () => {
      const mapped = await repo().setFormatMapping("MTC Sealed", "freeform");
      expect(mapped).toMatchObject({ sourceFormat: "MTC Sealed", mappedFormat: "freeform" });
      const mappings = await repo().formatMappings();
      expect(mappings.get("mtcsealed")).toBe("freeform");

      const unmapped = await repo().setFormatMapping("MTC Sealed", null);
      expect(unmapped).toMatchObject({ sourceFormat: "MTC Sealed", mappedFormat: null });
      const afterUnmap = await repo().formatMappings();
      expect(afterUnmap.has("mtcsealed")).toBe(false);
    });

    it("keeps one row however the source cases the format it maps", async () => {
      await repo().setFormatMapping("MTC Sealed", "freeform");
      await repo().setFormatMapping("mtc sealed", "constructed");

      const stored = await ctx!.db
        .selectFrom("uvsgamesFormatMappings")
        .select(["sourceFormat", "mappedFormat"])
        .execute();
      const mine = stored.filter((entry) => entry.sourceFormat.includes("mtcsealed"));
      expect(mine).toEqual([{ sourceFormat: "mtcsealed", mappedFormat: "constructed" }]);

      const mappings = await repo().formatMappings();
      expect(mappings.get("mtcsealed")).toBe("constructed");

      await repo().setFormatMapping("MTC SEALED", null);
      const afterUnmap = await repo().formatMappings();
      expect(afterUnmap.has("mtcsealed")).toBe(false);
    });

    it("knows nothing about a format no event carries", async () => {
      expect(await repo().formatByName("MTC Never Published")).toBeUndefined();
    });
  });
  describe("stores", () => {
    it("normalizes the store out of the row and resolves its current name", async () => {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-store-1",
            contentHash: "h-store-1",
            storeId: STORE_ID,
            storeName: "MTC Store",
          }),
          row({
            externalId: "mtc-store-2",
            contentHash: "h-store-2",
            storeId: STORE_ID,
            storeName: "MTC Store",
          }),
        ],
        SEEN,
      );

      const stored = await repo().byKey("mtc-store-1");
      expect(stored?.storeId).toBe(STORE_ID);
      expect(stored?.storeDisplayName).toBe("MTC Store");
    });

    it("propagates a rename to every event the store runs", async () => {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-store-1",
            contentHash: "h-store-1b",
            storeId: STORE_ID,
            storeName: "MTC Store Renamed",
          }),
        ],
        SEEN,
      );

      const untouched = await repo().byKey("mtc-store-2");
      expect(untouched?.storeDisplayName).toBe("MTC Store Renamed");
    });

    it("falls back to the row's own name when the source keyed no store", async () => {
      await repo().upsertBatch(
        [
          row({
            externalId: "mtc-queue-1",
            contentHash: "h-queue-1",
            storeId: null,
            storeName: "MTC Keyless Store",
          }),
        ],
        SEEN,
      );

      const stored = await repo().byKey("mtc-queue-1");
      expect(stored?.storeId).toBeNull();
      expect(stored?.storeDisplayName).toBe("MTC Keyless Store");
    });
  });

  describe("the recheck queue", () => {
    it("has no row until an event is armed, and reads zero for the stage", async () => {
      const unarmed = await repo().byKey("mtc-store-2");
      expect(unarmed?.nextCheckAt).toBeNull();
      expect(unarmed?.checkStage).toBe(0);
    });

    it("arms an event, advances its ladder, and keeps the row once exhausted", async () => {
      const due = new Date("2026-08-21T00:00:00Z");
      await repo().setRecheck("mtc-queue-1", { nextCheckAt: due, checkStage: 0 });

      const armed = await repo().byKey("mtc-queue-1");
      expect(armed?.nextCheckAt?.toISOString()).toBe(due.toISOString());

      await repo().setRecheck("mtc-queue-1", { nextCheckAt: null, checkStage: 4 });

      const exhausted = await repo().byKey("mtc-queue-1");
      expect(exhausted?.nextCheckAt).toBeNull();
      expect(exhausted?.checkStage).toBe(4);
    });

    it("returns only the events whose next visit is due", async () => {
      await repo().setRecheck("mtc-queue-1", {
        nextCheckAt: new Date("2026-08-24T00:00:00Z"),
        checkStage: 2,
      });
      await repo().setRecheck("mtc-store-1", {
        nextCheckAt: new Date("2026-09-30T00:00:00Z"),
        checkStage: 1,
      });

      const due = await repo().dueForRecheck(new Date("2026-08-25T00:00:00Z"), 10);
      const keys = due.map((entry) => entry.externalId);

      expect(keys).toContain("mtc-queue-1");
      expect(keys).not.toContain("mtc-store-1");
      expect(due.find((entry) => entry.externalId === "mtc-queue-1")?.checkStage).toBe(2);
    });
  });
});
