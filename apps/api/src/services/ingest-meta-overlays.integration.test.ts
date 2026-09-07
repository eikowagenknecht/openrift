import { metaUploadSchema } from "@openrift/shared/contracts/admin/meta";
import type { MetaIngestEvent } from "@openrift/shared/types/api/meta";
import { afterAll, describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { createRepos } from "../deps.js";
import { createDbContext, seedTestUser, syncCardCardTypes } from "../test/integration-context.js";
import { ingestMetaOverlays, playerSourceKey } from "./ingest-meta-overlays.js";

// Prefixes all fixtures with IMO- / imo- under its own provider so this file's rows
// never collide with another test file's.
const ctx = createDbContext(crypto.randomUUID());

const PROVIDER = "imopush";
const BASE_EVENT = "imo-evt-1";
const createdUserIds: string[] = [];
const createdCardIds: string[] = [];

let repos: Repos;
let submitterId: string;

if (ctx) {
  const { db } = ctx;
  repos = createRepos(db);
  const submitter = await seedTestUser(db, { isAdmin: true });
  submitterId = submitter.id;
  createdUserIds.push(submitter.id);

  const seededCards = await db
    .insertInto("cards")
    .values([
      {
        name: "IMO Spell",
        slug: "imo-spell",
        type: "spell",
        normName: "imospell",
        keywords: [],
        tags: [],
      },
      {
        name: "IMO Champion",
        slug: "imo-champion",
        type: "unit",
        normName: "imochampion",
        keywords: [],
        tags: [],
      },
      {
        name: "IMO Legend",
        slug: "imo-legend",
        type: "legend",
        normName: "imolegend",
        keywords: [],
        tags: [],
      },
    ])
    .returning(["id", "slug"])
    .execute();
  createdCardIds.push(...seededCards.map((card) => card.id));
  await syncCardCardTypes(db);

  afterAll(async () => {
    await db.deleteFrom("metaEventPlayerOverlays").where("provider", "=", PROVIDER).execute();
    await db.deleteFrom("metaEventOverlays").where("provider", "=", PROVIDER).execute();
    await db.deleteFrom("ignoredMetaSourceEvents").where("provider", "=", PROVIDER).execute();
    await db.deleteFrom("ignoredMetaSourcePlayers").where("provider", "=", PROVIDER).execute();
    await db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
    await db.deleteFrom("users").where("id", "in", createdUserIds).execute();
  });
}

function payload(event: Record<string, unknown>): MetaIngestEvent[] {
  return metaUploadSchema.parse({ provider: PROVIDER, events: [event] }).events;
}

function eventBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalId: BASE_EVENT,
    name: "IMO Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "constructed",
    playerCount: 12,
    organizer: "IMO Card Bazaar",
    players: [
      {
        externalId: "p1",
        playerName: "IMO Ashe",
        rank: 1,
        cards: [{ name: "IMO Spell", zone: "main", quantity: 3 }],
      },
      { externalId: "p2", playerName: "IMO Riven", rank: 2 },
    ],
    ...overrides,
  };
}

describe.skipIf(!ctx)("ingestMetaOverlays", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;

  function upload(event: Record<string, unknown>) {
    return ingestMetaOverlays(repos, PROVIDER, payload(event), submitterId);
  }

  function playerOverlays() {
    return db
      .selectFrom("metaEventPlayerOverlays")
      .selectAll()
      .where("provider", "=", PROVIDER)
      .where("sourcePlayerKey", "in", [
        playerSourceKey(BASE_EVENT, "p1"),
        playerSourceKey(BASE_EVENT, "p2"),
      ])
      .orderBy("sourcePlayerKey", "asc")
      .execute();
  }

  it("keys an event and its field on the source, then leaves them alone on a repeat", async () => {
    const first = await upload(eventBody());
    const before = await playerOverlays();

    const second = await upload(eventBody());

    expect(first).toMatchObject({ newEvents: 1, newPlayers: 2, updatedEvents: 0 });
    expect(first.newEventDetails).toEqual([
      { externalId: BASE_EVENT, name: "IMO Summoner Skirmish" },
    ]);
    expect(second).toMatchObject({
      newEvents: 0,
      updatedEvents: 0,
      unchangedEvents: 1,
      newPlayers: 0,
      updatedPlayers: 0,
      unchangedPlayers: 2,
    });
    const after = await playerOverlays();
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.map((row) => row.updatedAt)).toEqual(before.map((row) => row.updatedAt));
  });

  it("reads the legend and champion off the list when the source names neither", async () => {
    await upload(
      eventBody({
        externalId: "imo-evt-zones",
        players: [
          {
            externalId: "pz",
            playerName: "IMO Zoned",
            rank: 1,
            cards: [
              { name: "IMO Legend", zone: "legend", quantity: 1 },
              { name: "IMO Champion", zone: "champion", quantity: 1 },
              { name: "IMO Spell", zone: "main", quantity: 3 },
            ],
          },
        ],
      }),
    );

    const [row] = await db
      .selectFrom("metaEventPlayerOverlays")
      .selectAll()
      .where("provider", "=", PROVIDER)
      .where("sourcePlayerKey", "=", playerSourceKey("imo-evt-zones", "pz"))
      .execute();
    const named = await db
      .selectFrom("cards")
      .select(["id", "slug"])
      .where("slug", "in", ["imo-legend", "imo-champion"])
      .execute();
    const cardId = (slug: string) => named.find((card) => card.slug === slug)?.id;

    expect(row!.legendCardId).toBe(cardId("imo-legend"));
    expect(row!.championCardId).toBe(cardId("imo-champion"));
  });

  it("claims only the event fields the upload carries", async () => {
    await upload(eventBody({ externalId: "imo-evt-sparse" }));

    const [row] = await db
      .selectFrom("metaEventOverlays")
      .selectAll()
      .where("provider", "=", PROVIDER)
      .where("externalId", "=", "imo-evt-sparse")
      .execute();

    expect(row!.claimedFields).toEqual(["name", "eventDate", "format", "playerCount", "organizer"]);
  });

  it("claims a standings column only where the source published one", async () => {
    await upload(
      eventBody({
        externalId: "imo-evt-records",
        players: [
          {
            externalId: "pr1",
            playerName: "IMO Recorded",
            rank: 1,
            wins: 5,
            entryStatus: "complete",
          },
          { externalId: "pr2", playerName: "IMO Placed", rank: 2 },
        ],
      }),
    );

    const rows = await db
      .selectFrom("metaEventPlayerOverlays")
      .select(["sourcePlayerKey", "claimedFields"])
      .where("provider", "=", PROVIDER)
      .where("sourcePlayerKey", "in", [
        playerSourceKey("imo-evt-records", "pr1"),
        playerSourceKey("imo-evt-records", "pr2"),
      ])
      .orderBy("sourcePlayerKey", "asc")
      .execute();
    const claims = (key: string) =>
      rows.find((row) => row.sourcePlayerKey === playerSourceKey("imo-evt-records", key))
        ?.claimedFields;

    expect(claims("pr1")).toEqual(["playerName", "rank", "rankIsTier", "wins", "entryStatus"]);
    expect(claims("pr2")).toEqual(["playerName", "rank", "rankIsTier"]);
  });

  it("leaves a standings-only row claiming no list status at all", async () => {
    await upload(eventBody());

    const [, standingsOnly] = await playerOverlays();
    expect(standingsOnly!.listStatus).toBeNull();
    expect(standingsOnly!.claimedFields).not.toContain("listStatus");
    expect(standingsOnly!.claimedFields).not.toContain("cards");
  });

  it("updates a changed event in place and re-opens its review", async () => {
    await upload(eventBody());
    const [existing] = await db
      .selectFrom("metaEventOverlays")
      .selectAll()
      .where("provider", "=", PROVIDER)
      .where("externalId", "=", BASE_EVENT)
      .execute();
    await repos.metaOverlays.setEventOverlayStatus(existing!.id, "accepted", new Date());

    const result = await upload(eventBody({ organizer: "IMO Renamed Bazaar" }));

    expect(result).toMatchObject({ newEvents: 0, updatedEvents: 1, unchangedEvents: 0 });
    expect(result.updatedEventDetails).toEqual([
      { externalId: BASE_EVENT, name: "IMO Summoner Skirmish" },
    ]);
    expect(await repos.metaOverlays.eventOverlayById(existing!.id)).toMatchObject({
      organizer: "IMO Renamed Bazaar",
      status: "pending",
      acceptedAt: null,
    });
  });

  it("updates a changed player in place and re-opens its review", async () => {
    await upload(eventBody());
    const [withList] = await playerOverlays();
    await repos.metaOverlays.setPlayerOverlayStatus(withList!.id, "accepted", new Date());

    const result = await upload(
      eventBody({
        players: [
          {
            externalId: "p1",
            playerName: "IMO Ashe",
            rank: 1,
            wins: 5,
            cards: [{ name: "IMO Spell", zone: "main", quantity: 3 }],
          },
          { externalId: "p2", playerName: "IMO Riven", rank: 2 },
        ],
      }),
    );

    expect(result).toMatchObject({ newPlayers: 0, updatedPlayers: 1, unchangedPlayers: 1 });
    const [after] = await playerOverlays();
    expect(after).toMatchObject({ id: withList!.id, wins: 5, status: "pending", acceptedAt: null });
  });

  it("counts a re-sent list as changed only when its lines move", async () => {
    await upload(eventBody());

    const sameLines = await upload(eventBody());
    const movedLines = await upload(
      eventBody({
        players: [
          {
            externalId: "p1",
            playerName: "IMO Ashe",
            rank: 1,
            cards: [{ name: "IMO Spell", zone: "main", quantity: 2 }],
          },
          { externalId: "p2", playerName: "IMO Riven", rank: 2 },
        ],
      }),
    );

    expect(sameLines.unchangedPlayers).toBe(2);
    expect(movedLines).toMatchObject({ updatedPlayers: 1, unchangedPlayers: 1 });
    const [after] = await playerOverlays();
    const cards = await repos.metaOverlays.cardsByOverlayIds([after!.id]);
    expect(cards.get(after!.id)).toMatchObject([{ cardName: "IMO Spell", quantity: 2 }]);
  });

  it("skips a whole event the reviewer dismissed, field included", async () => {
    await repos.metaOverlays.ignoreEvent(PROVIDER, "imo-evt-ignored");

    const result = await upload(eventBody({ externalId: "imo-evt-ignored" }));

    expect(result).toMatchObject({ newEvents: 0, newPlayers: 0, ignoredSkipped: 1 });
  });

  it("skips one dismissed player and takes the rest of the field", async () => {
    await repos.metaOverlays.ignorePlayer(PROVIDER, {
      eventExternalId: "imo-evt-partly-ignored",
      externalId: "p2",
    });

    const result = await upload(eventBody({ externalId: "imo-evt-partly-ignored" }));

    expect(result).toMatchObject({ newEvents: 1, newPlayers: 1, ignoredSkipped: 1 });
  });

  it("records a card name nothing matched, without turning the row down", async () => {
    const result = await upload(
      eventBody({
        externalId: "imo-evt-unresolved",
        players: [
          {
            externalId: "p1",
            playerName: "IMO Ashe",
            rank: 1,
            cards: [{ name: "IMO Nonexistent Card", zone: "main", quantity: 1 }],
          },
        ],
      }),
    );

    expect(result.newPlayers).toBe(1);
    expect(result.unresolvedCards).toEqual([
      {
        eventExternalId: "imo-evt-unresolved",
        playerExternalId: "p1",
        names: ["IMO Nonexistent Card"],
      },
    ]);
  });
});
