import type { Insertable } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import type { PlayloltcgEventStandingsTable } from "../../../db/tables/meta-sources.js";
import type { MetaEventPlayerOverlaysTable } from "../../../db/tables/meta.js";
import type { Repos } from "../../../deps.js";
import { createRepos } from "../../../deps.js";
import { createDbContext, syncCardCardTypes } from "../../../test/integration-context.js";
import { META_ARCHIVE_USER_ID } from "../repositories/meta-shared.js";
import { metaRepo } from "../repositories/meta.js";
import { promoteMetaEvent } from "./meta-promote.js";

// Uses the prefix MPI- / mpi- for everything it creates, and shop ids well
// clear of the source's own id space. Each case takes its own shop id, since
// the mirror keys an event on it and the file's cases seed different fields.

const ctx = createDbContext(crypto.randomUUID());

const SHOP_ID_BASE = 990_400;
let nextShopId = SHOP_ID_BASE;

const createdEventIds: string[] = [];
const createdShopIds: number[] = [];
const createdTids: string[] = [];
const createdDeckIds: string[] = [];
const createdCardIds: string[] = [];
let spellCardId: string;

let repos: Repos;

function takeShopId(): number {
  nextShopId++;
  createdShopIds.push(nextShopId);
  return nextShopId;
}

if (ctx) {
  const { db } = ctx;
  repos = createRepos(db);

  const [spell] = await db
    .insertInto("cards")
    .values({
      name: "MPI Spell",
      slug: "mpi-spell",
      type: "spell",
      normName: "mpispell",
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  spellCardId = spell!.id;
  createdCardIds.push(spell!.id);
  await syncCardCardTypes(db);

  afterAll(async () => {
    // Events first: `meta_event_players.deck_id` is ON DELETE RESTRICT, so the
    // archived decks are only free once the event has cascaded its rows.
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db
      .deleteFrom("playloltcgDecklistCards")
      .where("sourceDeckId", "like", "mpi-deck-%")
      .execute();
    await db
      .deleteFrom("playloltcgDecklists")
      .where("activityShopId", "in", createdShopIds)
      .execute();
    await db
      .deleteFrom("playloltcgEventStandings")
      .where("activityShopId", "in", createdShopIds)
      .execute();
    await db.deleteFrom("playloltcgEvents").where("activityShopId", "in", createdShopIds).execute();
    await db.deleteFrom("topdeckEvents").where("tid", "in", createdTids).execute();
    await db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
  });
}

describe.skipIf(!ctx)("promoteMetaEvent", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);

  /**
   * A hand-entered event, built the way the admin create route builds one:
   * everything the human typed is claimed by their accepted overlay.
   */
  async function seedLiveEvent(slug: string): Promise<string> {
    const event = await repo.createEvent({
      slug,
      name: "MPI Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "constructed",
      playerCount: null,
      organizer: null,
      notes: null,
      tier: "competitive",
      country: null,
      location: null,
    });
    createdEventIds.push(event.id);
    await repos.metaOverlays.insertEventOverlay({
      metaEventId: event.id,
      playerCount: 41,
      organizer: "MPI Card Bazaar",
      notes: "Hand entered from the organizer's post.",
      country: "DE",
      location: "Berlin",
      claimedFields: ["playerCount", "organizer", "notes", "country", "location"],
      status: "accepted",
      acceptedAt: new Date(),
      submittedByUserId: META_ARCHIVE_USER_ID,
    });
    return event.id;
  }

  async function cite(
    metaEventId: string,
    provider: string | null,
    externalId: string | null,
  ): Promise<void> {
    await repo.insertEventSource({
      metaEventId,
      provider,
      externalId,
      label: provider ?? "Submission",
      sourceUrl: null,
    });
  }

  async function seedStandingsOnlyPlayer(
    metaEventId: string,
    playerName: string,
    rank: number,
  ): Promise<string> {
    const created = await repo.createPlayer(
      {
        eventId: metaEventId,
        rank,
        rankIsTier: false,
        playerName,
        wins: null,
        losses: null,
        draws: null,
        legendCardId: null,
        championCardId: null,
        deck: null,
      },
      null,
    );
    if (created === undefined) {
      throw new Error("seedStandingsOnlyPlayer: event not found");
    }
    return created.metaEventPlayerId;
  }

  describe("event fields", () => {
    it("keeps every field of an event no source describes", async () => {
      const metaEventId = await seedLiveEvent("mpi-no-sources");

      await promoteMetaEvent(repos, metaEventId);

      expect(await repo.eventById(metaEventId)).toMatchObject({
        name: "MPI Summoner Skirmish",
        playerCount: 41,
        organizer: "MPI Card Bazaar",
        notes: "Hand entered from the organizer's post.",
        tier: "competitive",
        country: "DE",
        location: "Berlin",
      });
    });

    it("writes nothing the second time, since promotion is idempotent", async () => {
      const metaEventId = await seedLiveEvent("mpi-idempotent");
      await promoteMetaEvent(repos, metaEventId);
      const before = await repo.eventRowById(metaEventId);

      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.eventRowById(metaEventId);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
    });

    it("keeps them when the only citation is a keyless submission", async () => {
      const metaEventId = await seedLiveEvent("mpi-keyless-citation");
      await cite(metaEventId, null, null);

      await promoteMetaEvent(repos, metaEventId);

      expect(await repo.eventById(metaEventId)).toMatchObject({
        organizer: "MPI Card Bazaar",
        playerCount: 41,
        location: "Berlin",
      });
    });

    it("keeps them when a cited mirror no longer holds the key", async () => {
      const metaEventId = await seedLiveEvent("mpi-orphan-citation");
      await cite(metaEventId, "uvsgames", "mpi-uvs-never-mirrored");

      await promoteMetaEvent(repos, metaEventId);

      expect(await repo.eventById(metaEventId)).toMatchObject({
        organizer: "MPI Card Bazaar",
        notes: "Hand entered from the organizer's post.",
        country: "DE",
      });
    });
  });

  describe("standings identity", () => {
    async function seedMirroredEvent(
      slug: string,
      standings: readonly Omit<Insertable<PlayloltcgEventStandingsTable>, "activityShopId">[],
    ): Promise<{ metaEventId: string; activityShopId: number }> {
      const activityShopId = takeShopId();
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rune Cup",
          startAt: "2026-08-20",
          playerCount: standings.length,
          shopName: "MPI Card Bazaar",
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values(standings.map((row) => ({ ...row, activityShopId })))
        .execute();

      const metaEventId = await seedLiveEvent(slug);
      await cite(metaEventId, "playloltcg", String(activityShopId));
      return { metaEventId, activityShopId };
    }

    const TWO_PLAYERS = [
      { playerKey: "u5001", sourceUserId: 5001, playerName: "MPI Ashe", rank: 1, wins: 4 },
      { playerKey: "nMPI Riven#1", playerName: "MPI Riven", rank: 2, wins: 3 },
    ];

    it("files a mirrored player under the source key, and re-promotes onto the same row", async () => {
      const { metaEventId } = await seedMirroredEvent("mpi-playloltcg-twice", TWO_PLAYERS);

      await promoteMetaEvent(repos, metaEventId);
      const first = await repo.rawStandingsForEvent(metaEventId);
      await promoteMetaEvent(repos, metaEventId);
      const second = await repo.rawStandingsForEvent(metaEventId);

      expect(first).toHaveLength(2);
      expect(first.map((row) => row.sourceIdentity).toSorted()).toEqual([
        "pnMPI Riven#1",
        "pu5001",
      ]);
      expect(second.map((row) => row.id).toSorted()).toEqual(first.map((row) => row.id).toSorted());
    });

    it("does not fork a row when the source renames the player behind the key", async () => {
      const { metaEventId, activityShopId } = await seedMirroredEvent(
        "mpi-playloltcg-rename",
        TWO_PLAYERS,
      );
      await promoteMetaEvent(repos, metaEventId);
      const before = await repo.rawStandingsForEvent(metaEventId);

      await db
        .updateTable("playloltcgEventStandings")
        .set({ playerName: "MPI Ashe Renamed" })
        .where("activityShopId", "=", activityShopId)
        .where("playerKey", "=", "u5001")
        .execute();
      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(2);
      expect(after.map((row) => row.id).toSorted()).toEqual(before.map((row) => row.id).toSorted());
      expect(after.find((row) => row.sourceIdentity === "pu5001")?.playerName).toBe(
        "MPI Ashe Renamed",
      );
    });

    it("adopts a row written before the identity column existed instead of duplicating it", async () => {
      const { metaEventId } = await seedMirroredEvent("mpi-playloltcg-legacy", [TWO_PLAYERS[0]!]);
      const legacyId = await seedStandingsOnlyPlayer(metaEventId, "MPI Ashe", 9);

      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ id: legacyId, sourceIdentity: "pu5001", rank: 1 });
    });

    it("lets only one standing claim a legacy row, so a shared name cannot flip its key", async () => {
      const { metaEventId } = await seedMirroredEvent("mpi-playloltcg-legacy-shared", [
        { playerKey: "nMPI Twins#1", playerName: "MPI Twins", rank: 3 },
        { playerKey: "nMPI Twins#2", playerName: "MPI Twins", rank: 4 },
      ]);
      const legacyId = await seedStandingsOnlyPlayer(metaEventId, "MPI Twins", 9);

      await promoteMetaEvent(repos, metaEventId);
      const first = await repo.rawStandingsForEvent(metaEventId);
      await promoteMetaEvent(repos, metaEventId);
      const second = await repo.rawStandingsForEvent(metaEventId);

      expect(first).toHaveLength(2);
      expect(first.some((row) => row.id === legacyId)).toBe(true);
      expect(second.map((row) => row.id).toSorted()).toEqual(first.map((row) => row.id).toSorted());
    });

    it("keeps a maintainer's deck rename across a re-promote of the same list", async () => {
      const activityShopId = takeShopId();
      const sourceDeckId = `mpi-deck-${activityShopId}`;
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rune Cup",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgDecklists")
        .values({ sourceDeckId, activityShopId, fetchStatus: "fetched" })
        .execute();
      await db
        .insertInto("playloltcgDecklistCards")
        .values({ sourceDeckId, lineNumber: 0, zone: "main", quantity: 3, cardName: "MPI Spell" })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({
          activityShopId,
          playerKey: "u5002",
          playerName: "MPI Zed",
          rank: 1,
          sourceDeckId,
        })
        .execute();

      const metaEventId = await seedLiveEvent("mpi-deck-rename");
      await cite(metaEventId, "playloltcg", String(activityShopId));

      await promoteMetaEvent(repos, metaEventId);
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      const deckId = player!.deckId as string;
      createdDeckIds.push(deckId);
      await db
        .updateTable("decks")
        .set({ name: "MPI Curated Name" })
        .where("id", "=", deckId)
        .execute();

      await promoteMetaEvent(repos, metaEventId);

      const deck = await db
        .selectFrom("decks")
        .select("name")
        .where("id", "=", deckId)
        .executeTakeFirst();
      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "quantity"])
        .where("deckId", "=", deckId)
        .execute();
      expect(deck?.name).toBe("MPI Curated Name");
      expect(cards).toEqual([{ cardId: spellCardId, quantity: 3 }]);
    });

    it("rewrites the archived list when the source list moves", async () => {
      const activityShopId = takeShopId();
      const sourceDeckId = `mpi-deck-${activityShopId}`;
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rune Cup",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgDecklists")
        .values({ sourceDeckId, activityShopId, fetchStatus: "fetched" })
        .execute();
      await db
        .insertInto("playloltcgDecklistCards")
        .values({ sourceDeckId, lineNumber: 0, zone: "main", quantity: 3, cardName: "MPI Spell" })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({
          activityShopId,
          playerKey: "u5003",
          playerName: "MPI Lux",
          rank: 1,
          sourceDeckId,
        })
        .execute();

      const metaEventId = await seedLiveEvent("mpi-deck-moves");
      await cite(metaEventId, "playloltcg", String(activityShopId));

      await promoteMetaEvent(repos, metaEventId);
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      const deckId = player!.deckId as string;
      createdDeckIds.push(deckId);

      await db
        .updateTable("playloltcgDecklistCards")
        .set({ quantity: 1 })
        .where("sourceDeckId", "=", sourceDeckId)
        .execute();
      await promoteMetaEvent(repos, metaEventId);

      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "quantity"])
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toEqual([{ cardId: spellCardId, quantity: 1 }]);
    });

    it("rewrites a standing the source moved, and leaves its neighbour alone", async () => {
      const { metaEventId, activityShopId } = await seedMirroredEvent(
        "mpi-playloltcg-rerank",
        TWO_PLAYERS,
      );
      await promoteMetaEvent(repos, metaEventId);
      const before = await repo.rawStandingsForEvent(metaEventId);
      const untouched = before.find((row) => row.sourceIdentity !== "pu5001");

      await db
        .updateTable("playloltcgEventStandings")
        .set({ rank: 7, wins: 6 })
        .where("activityShopId", "=", activityShopId)
        .where("playerKey", "=", "u5001")
        .execute();
      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after.find((row) => row.sourceIdentity === "pu5001")).toMatchObject({
        rank: 7,
        wins: 6,
      });
      expect(after.find((row) => row.sourceIdentity === untouched?.sourceIdentity)).toMatchObject({
        rank: untouched?.rank,
        playerName: untouched?.playerName,
      });
    });
  });

  describe("multi-source citations", () => {
    async function seedTopdeckMirror(tid: string): Promise<string> {
      createdTids.push(tid);
      await db
        .insertInto("topdeckEvents")
        .values({
          tid,
          name: "MPI Rift Open",
          format: "Constructed",
          startAt: new Date("2026-08-20T18:00:00Z"),
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("topdeckEventStandings")
        .values({ tid, playerKey: "uacct-1", playerName: "MPI Topdeck Ashe", rank: 1, wins: 5 })
        .execute();
      return tid;
    }

    it("promotes a topdeck mirror that is the event's only source", async () => {
      const tid = await seedTopdeckMirror("mpi-td-only");
      const metaEventId = await seedLiveEvent("mpi-topdeck-only");
      await cite(metaEventId, "topdeck", tid);

      await promoteMetaEvent(repos, metaEventId);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows.map((row) => row.sourceIdentity)).toEqual(["tuacct-1"]);
    });

    it("cites a second mirror without reading it, so no entrant is archived twice", async () => {
      const activityShopId = takeShopId();
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rift Open",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({ activityShopId, playerKey: "u5001", playerName: "MPI Ashe", rank: 1, wins: 5 })
        .execute();
      const tid = await seedTopdeckMirror("mpi-td-second");

      const metaEventId = await seedLiveEvent("mpi-two-mirrors");
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await cite(metaEventId, "topdeck", tid);

      await promoteMetaEvent(repos, metaEventId);

      const sources = await repo.sourcesForEvent(metaEventId);
      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(sources).toHaveLength(2);
      expect(sources.find((row) => row.provider === "topdeck")?.contributes).toBe(false);
      expect(rows.map((row) => row.sourceIdentity)).toEqual(["pu5001"]);
    });

    it("reads the second mirror once an admin turns it on", async () => {
      const activityShopId = takeShopId();
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rift Open",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({ activityShopId, playerKey: "u5002", playerName: "MPI Ashe", rank: 1, wins: 5 })
        .execute();
      const tid = await seedTopdeckMirror("mpi-td-enabled");

      const metaEventId = await seedLiveEvent("mpi-two-mirrors-on");
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await cite(metaEventId, "topdeck", tid);
      const sources = await repo.sourcesForEvent(metaEventId);
      const topdeckSource = sources.find((row) => row.provider === "topdeck");
      await repo.setEventSourceContributes(topdeckSource?.id ?? "", true);

      await promoteMetaEvent(repos, metaEventId);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows.map((row) => row.sourceIdentity).toSorted()).toEqual(["pu5002", "tuacct-1"]);
    });

    async function seedReadMirror(playerKey: string): Promise<number> {
      const activityShopId = takeShopId();
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rift Open",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({ activityShopId, playerKey, playerName: "MPI Ashe", rank: 1, wins: 5 })
        .execute();
      return activityShopId;
    }

    async function readTopdeckMirror(metaEventId: string, tid: string): Promise<void> {
      await cite(metaEventId, "topdeck", tid);
      const sources = await repo.sourcesForEvent(metaEventId);
      const topdeck = sources.find((row) => row.provider === "topdeck");
      await repo.setEventSourceContributes(topdeck?.id ?? "", true);
    }

    async function readBothMirrors(
      metaEventId: string,
      activityShopId: number,
      tid: string,
    ): Promise<void> {
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await readTopdeckMirror(metaEventId, tid);
    }

    it("folds a linked entry onto the live row instead of archiving the player twice", async () => {
      const activityShopId = await seedReadMirror("u5010");
      const tid = await seedTopdeckMirror("mpi-td-linked");
      const metaEventId = await seedLiveEvent("mpi-linked-fold");
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await promoteMetaEvent(repos, metaEventId);
      const [live] = await repo.rawStandingsForEvent(metaEventId);
      await repos.metaPlayerLinks.putMany([
        {
          metaEventId,
          provider: "topdeck",
          sourceIdentity: "tuacct-1",
          metaEventPlayerId: live!.id,
        },
      ]);
      await readTopdeckMirror(metaEventId, tid);

      await promoteMetaEvent(repos, metaEventId);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sourceIdentity).toBe("pu5010");
      expect(rows[0]!.id).toBe(live!.id);
    });

    it("takes the linked mirror's legend, which the read mirror never published", async () => {
      const activityShopId = await seedReadMirror("u5011");
      const tid = await seedTopdeckMirror("mpi-td-legend");
      await db
        .updateTable("topdeckEventStandings")
        .set({ legendName: "MPI Spell" })
        .where("tid", "=", tid)
        .execute();
      const metaEventId = await seedLiveEvent("mpi-linked-legend");
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await promoteMetaEvent(repos, metaEventId);
      const [live] = await repo.rawStandingsForEvent(metaEventId);
      await repos.metaPlayerLinks.putMany([
        {
          metaEventId,
          provider: "topdeck",
          sourceIdentity: "tuacct-1",
          metaEventPlayerId: live!.id,
        },
      ]);
      await readTopdeckMirror(metaEventId, tid);

      await promoteMetaEvent(repos, metaEventId);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.legendCardId).toBe(spellCardId);
      expect(rows[0]!.wins).toBe(5);
    });

    it("mints a row for an entry reviewed as nobody the event lists", async () => {
      const activityShopId = await seedReadMirror("u5012");
      const tid = await seedTopdeckMirror("mpi-td-distinct");
      const metaEventId = await seedLiveEvent("mpi-linked-distinct");
      await repos.metaPlayerLinks.putMany([
        { metaEventId, provider: "topdeck", sourceIdentity: "tuacct-1", metaEventPlayerId: null },
      ]);
      await readBothMirrors(metaEventId, activityShopId, tid);

      await promoteMetaEvent(repos, metaEventId);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows.map((row) => row.sourceIdentity).toSorted()).toEqual(["pu5012", "tuacct-1"]);
    });

    it("leaves a hand-entered citation contributing, since it has no mirror to clash with", async () => {
      const tid = await seedTopdeckMirror("mpi-td-hand");
      const metaEventId = await seedLiveEvent("mpi-hand-citation");
      await cite(metaEventId, "topdeck", tid);
      await cite(metaEventId, null, null);

      const sources = await repo.sourcesForEvent(metaEventId);
      expect(sources.every((row) => row.contributes)).toBe(true);
    });
  });

  describe("player overlays", () => {
    async function acceptedPlayerOverlay(
      values: Omit<
        Insertable<MetaEventPlayerOverlaysTable>,
        "status" | "acceptedAt" | "submittedByUserId"
      >,
    ): Promise<string> {
      return await repos.metaOverlays.insertPlayerOverlay(
        {
          ...values,
          status: "accepted",
          acceptedAt: new Date("2026-08-22T00:00:00Z"),
          submittedByUserId: META_ARCHIVE_USER_ID,
        },
        [],
      );
    }

    it("applies a rename without forking the row it renames", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-rename");
      const activityShopId = takeShopId();
      await db
        .insertInto("playloltcgEvents")
        .values({
          activityShopId,
          name: "MPI Rune Cup",
          startAt: "2026-08-20",
          playerCount: 1,
          contentHash: "mpi-hash",
          lastSeenAt: new Date("2026-08-21T00:00:00Z"),
        })
        .execute();
      await db
        .insertInto("playloltcgEventStandings")
        .values({ activityShopId, playerKey: "u5003", playerName: "MPI Typo", rank: 1 })
        .execute();
      await cite(metaEventId, "playloltcg", String(activityShopId));
      await promoteMetaEvent(repos, metaEventId);
      const [seeded] = await repo.rawStandingsForEvent(metaEventId);

      await acceptedPlayerOverlay({
        metaEventPlayerId: seeded!.id,
        playerName: "MPI Corrected",
        claimedFields: ["playerName"],
      });
      await promoteMetaEvent(repos, metaEventId);
      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ id: seeded!.id, playerName: "MPI Corrected" });
    });

    it("matches an event-anchored overlay onto the row it names, and writes the link back", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-match");
      const playerId = await seedStandingsOnlyPlayer(metaEventId, "MPI Sett", 4);
      const overlayId = await acceptedPlayerOverlay({
        metaEventId,
        playerName: "mpi sett",
        wins: 6,
        claimedFields: ["playerName", "wins"],
      });

      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ id: playerId, wins: 6 });
      expect(await repos.metaOverlays.playerOverlayById(overlayId)).toMatchObject({
        metaEventPlayerId: playerId,
        metaEventId: null,
      });
    });

    it("breaks a shared name on the rank the overlay claims", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-shared-name");
      const first = await seedStandingsOnlyPlayer(metaEventId, "MPI Twin", 1);
      const second = await seedStandingsOnlyPlayer(metaEventId, "MPI Twin", 2);
      await acceptedPlayerOverlay({
        metaEventId,
        playerName: "MPI Twin",
        rank: 2,
        wins: 5,
        claimedFields: ["playerName", "rank", "wins"],
      });

      await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after.find((row) => row.id === second)?.wins).toBe(5);
      expect(after.find((row) => row.id === first)?.wins).toBeNull();
    });

    it("mints a row for an event-anchored overlay naming nobody the event lists", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-mint");
      const overlayId = await acceptedPlayerOverlay({
        metaEventId,
        playerName: "MPI Newcomer",
        rank: 7,
        claimedFields: ["playerName", "rank"],
      });

      const result = await promoteMetaEvent(repos, metaEventId);

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ playerName: "MPI Newcomer", rank: 7 });
      expect(result.players).toBe(1);
      const overlay = await repos.metaOverlays.playerOverlayById(overlayId);
      expect(overlay?.metaEventPlayerId).toBe(after[0]!.id);
    });

    it("mints only once, however often the event is promoted again", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-mint-twice");
      await acceptedPlayerOverlay({
        metaEventId,
        playerName: "MPI Returning",
        rank: 3,
        claimedFields: ["playerName", "rank"],
      });

      await promoteMetaEvent(repos, metaEventId);
      await promoteMetaEvent(repos, metaEventId);

      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(1);
    });

    it("reports an accepted overlay it can neither match nor mint", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-stranded");
      await acceptedPlayerOverlay({
        metaEventId,
        playerName: "MPI Ghost",
        claimedFields: ["playerName"],
      });

      const result = await promoteMetaEvent(repos, metaEventId);

      expect(await repo.rawStandingsForEvent(metaEventId)).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("MPI Ghost");
    });

    it("takes back a minted row once its overlay stops claiming it", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-minted");
      const overlayId = await acceptedPlayerOverlay({
        metaEventId,
        playerName: "MPI Minted",
        rank: 4,
        claimedFields: ["playerName", "rank"],
      });
      await promoteMetaEvent(repos, metaEventId);
      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(1);

      await repos.metaOverlays.setPlayerOverlayStatus(overlayId, "rejected", new Date());
      const result = await promoteMetaEvent(repos, metaEventId);

      expect(await repo.rawStandingsForEvent(metaEventId)).toEqual([]);
      expect(result.removedPlayers).toBe(1);
      expect(await repos.metaOverlays.playerOverlayById(overlayId)).toMatchObject({
        status: "rejected",
        metaEventId,
        metaEventPlayerId: null,
      });
    });

    it("never takes back a row a person entered by hand", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-handmade");
      const playerId = await seedStandingsOnlyPlayer(metaEventId, "MPI Handmade", 1);

      const result = await promoteMetaEvent(repos, metaEventId);

      expect(await repo.rawStandingsForEvent(metaEventId)).toMatchObject([{ id: playerId }]);
      expect(result.removedPlayers).toBe(0);
    });

    it("applies overlays to an event whose sources hold no standings at all", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-no-sources");
      const playerId = await seedStandingsOnlyPlayer(metaEventId, "MPI Solo", 1);
      await acceptedPlayerOverlay({
        metaEventPlayerId: playerId,
        wins: 3,
        losses: 1,
        claimedFields: ["wins", "losses"],
      });

      await promoteMetaEvent(repos, metaEventId);

      expect(await repo.rawStandingsForEvent(metaEventId)).toMatchObject([
        { id: playerId, wins: 3, losses: 1 },
      ]);
    });

    it("ignores a pending overlay until it is accepted", async () => {
      const metaEventId = await seedLiveEvent("mpi-overlay-pending");
      const playerId = await seedStandingsOnlyPlayer(metaEventId, "MPI Waiting", 1);
      const overlayId = await repos.metaOverlays.insertPlayerOverlay(
        {
          metaEventPlayerId: playerId,
          wins: 9,
          claimedFields: ["wins"],
          submittedByUserId: META_ARCHIVE_USER_ID,
        },
        [],
      );

      await promoteMetaEvent(repos, metaEventId);
      const unapplied = await repo.rawStandingsForEvent(metaEventId);

      await repos.metaOverlays.setPlayerOverlayStatus(overlayId, "accepted", new Date());
      await promoteMetaEvent(repos, metaEventId);
      const applied = await repo.rawStandingsForEvent(metaEventId);

      expect(unapplied[0]?.wins).toBeNull();
      expect(applied[0]?.wins).toBe(9);
    });
  });
});
