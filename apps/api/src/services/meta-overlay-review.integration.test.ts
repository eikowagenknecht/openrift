import { afterAll, describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { createRepos } from "../deps.js";
import { AppError } from "../errors.js";
import { META_ARCHIVE_USER_ID, metaRepo } from "../repositories/meta.js";
import { createDbContext, seedTestUser, syncCardCardTypes } from "../test/integration-context.js";
import { playerSourceKey } from "./ingest-meta-overlays.js";
import {
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  linkMetaPlayerOverlay,
  moveMetaEventOverlay,
  releaseEventOverlayField,
  releaseMetaPlayerOverlayField,
  revertMetaUpload,
  writeEventOverlayFields,
  writeMetaPlayerOverlayFields,
} from "./meta-overlay-review.js";
import { promoteMetaEvent } from "./meta-promote.js";

// Uses the prefix MOR- / mor- for everything it creates, and shop ids well
// clear of the source's own id space.

const ctx = createDbContext(crypto.randomUUID());

const SHOP_ID_BASE = 990_500;
let nextShopId = SHOP_ID_BASE;

const createdEventIds: string[] = [];
const createdShopIds: number[] = [];
const createdUserIds: string[] = [];
const createdCardIds: string[] = [];
const createdDeckIds: string[] = [];

let repos: Repos;
let otherAdminId: string;
let sourceCardId: string;
let addedCardId: string;
let addedPrintingId: string;
let setId: string;

function takeShopId(): number {
  nextShopId++;
  createdShopIds.push(nextShopId);
  return nextShopId;
}

if (ctx) {
  const { db } = ctx;
  repos = createRepos(db);
  const other = await seedTestUser(db, { isAdmin: true });
  otherAdminId = other.id;
  createdUserIds.push(other.id);

  const seedCard = async (name: string, normName: string): Promise<string> => {
    const [card] = await db
      .insertInto("cards")
      .values({ name, slug: normName, type: "spell", normName, keywords: [], tags: [] })
      .returning("id")
      .execute();
    createdCardIds.push(card!.id);
    return card!.id;
  };

  sourceCardId = await seedCard("MOR Source Spell", "morsourcespell");
  addedCardId = await seedCard("MOR Added Spell", "moraddedspell");
  await syncCardCardTypes(db);

  const [set] = await db
    .insertInto("sets")
    .values({ slug: "MOR-TEST", name: "MOR Test Set", printedTotal: 2, sortOrder: 941 })
    .returning("id")
    .execute();
  setId = set!.id;
  const [printing] = await db
    .insertInto("printings")
    .values({
      cardId: addedCardId,
      setId,
      shortCode: "MOR-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      size: "standard",
      artist: "MOR Artist",
      publicCode: "MOR-001",
      language: "EN",
    })
    .returning("id")
    .execute();
  addedPrintingId = printing!.id;

  afterAll(async () => {
    // Events first: meta_event_players.deck_id is ON DELETE RESTRICT, so the
    // archived decks are only free once the event has cascaded its rows.
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db.deleteFrom("metaEventOverlays").where("provider", "=", "morpush").execute();
    await db
      .deleteFrom("playloltcgDecklistCards")
      .where("sourceDeckId", "like", "mor-deck-%")
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
    await db.deleteFrom("printings").where("id", "=", addedPrintingId).execute();
    await db.deleteFrom("sets").where("id", "=", setId).execute();
    await db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
    await db.deleteFrom("users").where("id", "in", createdUserIds).execute();
  });
}

describe.skipIf(!ctx)("overlay review", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);

  async function seedLiveEvent(slug: string): Promise<string> {
    const event = await repo.createEvent({
      slug,
      name: "MOR Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "constructed",
      playerCount: null,
      organizer: null,
      notes: null,
    });
    createdEventIds.push(event.id);
    return event.id;
  }

  /** A mirrored event whose organizer promotion would otherwise decide. */
  async function seedMirroredEvent(slug: string): Promise<string> {
    const activityShopId = takeShopId();
    await db
      .insertInto("playloltcgEvents")
      .values({
        activityShopId,
        name: "MOR Rune Cup",
        startAt: "2026-08-15",
        playerCount: 12,
        shopName: "MOR Mirror Shop",
        contentHash: "mor-hash",
        lastSeenAt: new Date("2026-08-16T00:00:00Z"),
      })
      .execute();
    const metaEventId = await seedLiveEvent(slug);
    await repo.insertEventSource({
      metaEventId,
      provider: "playloltcg",
      externalId: String(activityShopId),
      label: "playloltcg",
      sourceUrl: null,
    });
    await promoteMetaEvent(repos, metaEventId);
    return metaEventId;
  }

  // One standings row the source gives a deck and a win count, promoted once,
  // so every field under test has a source value to take and release.
  async function seedMirroredPlayer(
    slug: string,
  ): Promise<{ metaEventId: string; metaEventPlayerId: string; deckId: string }> {
    const activityShopId = takeShopId();
    const sourceDeckId = `mor-deck-${activityShopId}`;
    await db
      .insertInto("playloltcgEvents")
      .values({
        activityShopId,
        name: "MOR Rune Cup",
        startAt: "2026-08-15",
        playerCount: 1,
        shopName: "MOR Mirror Shop",
        contentHash: "mor-hash",
        lastSeenAt: new Date("2026-08-16T00:00:00Z"),
      })
      .execute();
    await db
      .insertInto("playloltcgDecklists")
      .values({ sourceDeckId, activityShopId, fetchStatus: "fetched" })
      .execute();
    await db
      .insertInto("playloltcgDecklistCards")
      .values({
        sourceDeckId,
        lineNumber: 0,
        zone: "main",
        quantity: 3,
        cardName: "MOR Source Spell",
      })
      .execute();
    await db
      .insertInto("playloltcgEventStandings")
      .values({
        activityShopId,
        playerKey: "u7001",
        sourceUserId: 7001,
        playerName: "MOR Ashe",
        rank: 1,
        wins: 4,
        sourceDeckId,
      })
      .execute();

    const metaEventId = await seedLiveEvent(slug);
    await repo.insertEventSource({
      metaEventId,
      provider: "playloltcg",
      externalId: String(activityShopId),
      label: "playloltcg",
      sourceUrl: null,
    });
    await promoteMetaEvent(repos, metaEventId);

    const [player] = await repo.rawStandingsForEvent(metaEventId);
    const deckId = player!.deckId as string;
    createdDeckIds.push(deckId);
    return { metaEventId, metaEventPlayerId: player!.id, deckId };
  }

  function deckCards(deckId: string) {
    return db
      .selectFrom("deckCards")
      .select(["cardId", "quantity", "preferredPrintingId"])
      .where("deckId", "=", deckId)
      .execute();
  }

  describe("writeEventOverlayFields", () => {
    it("merges one admin's later edits into the row their earlier ones made", async () => {
      const metaEventId = await seedLiveEvent("mor-merge-edits");

      await writeEventOverlayFields(
        repos,
        metaEventId,
        [{ field: "organizer", value: "MOR Card Bazaar" }],
        META_ARCHIVE_USER_ID,
      );
      await writeEventOverlayFields(
        repos,
        metaEventId,
        [
          { field: "location", value: "Zaun" },
          { field: "playerCount", value: "128" },
        ],
        META_ARCHIVE_USER_ID,
      );

      const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
      expect(overlays).toHaveLength(1);
      expect(overlays[0]!.claimedFields.toSorted()).toEqual([
        "location",
        "organizer",
        "playerCount",
      ]);
      expect(await repo.eventById(metaEventId)).toMatchObject({
        organizer: "MOR Card Bazaar",
        location: "Zaun",
        playerCount: 128,
      });
    });

    it("keeps a second admin's edits in a row of their own", async () => {
      const metaEventId = await seedLiveEvent("mor-two-admins");

      await writeEventOverlayFields(
        repos,
        metaEventId,
        [{ field: "organizer", value: "MOR Card Bazaar" }],
        META_ARCHIVE_USER_ID,
      );
      await writeEventOverlayFields(
        repos,
        metaEventId,
        [{ field: "location", value: "Piltover" }],
        otherAdminId,
      );

      const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
      expect(overlays.map((row) => row.submittedByUserId).toSorted()).toEqual(
        [META_ARCHIVE_USER_ID, otherAdminId].toSorted(),
      );
      expect(await repo.eventById(metaEventId)).toMatchObject({
        organizer: "MOR Card Bazaar",
        location: "Piltover",
      });
    });

    it("beats the source that would otherwise decide the field", async () => {
      const metaEventId = await seedMirroredEvent("mor-beats-source");
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: "MOR Mirror Shop" });

      await writeEventOverlayFields(
        repos,
        metaEventId,
        [{ field: "organizer", value: "MOR Admin Choice" }],
        META_ARCHIVE_USER_ID,
      );

      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: "MOR Admin Choice" });
    });

    it("writes nothing for a value the field cannot hold", async () => {
      const metaEventId = await seedLiveEvent("mor-bad-value");

      await expect(
        writeEventOverlayFields(
          repos,
          metaEventId,
          [
            { field: "organizer", value: "MOR Card Bazaar" },
            { field: "eventDate", value: "not-a-day" },
          ],
          META_ARCHIVE_USER_ID,
        ),
      ).rejects.toBeInstanceOf(AppError);

      expect(await repos.metaOverlays.acceptedEventOverlays(metaEventId)).toEqual([]);
    });
  });

  describe("writeMetaPlayerOverlayFields", () => {
    it("wins the scalar it claims, and keeps winning it across re-promotes", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-scalar");

      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { fields: { wins: 9 } },
        META_ARCHIVE_USER_ID,
      );
      await promoteMetaEvent(repos, metaEventId);

      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player).toMatchObject({ id: metaEventPlayerId, wins: 9 });
    });

    it("merges a second edit into the row the first one made", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-merge");

      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { fields: { wins: 9 } },
        META_ARCHIVE_USER_ID,
      );
      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { fields: { losses: 2 } },
        META_ARCHIVE_USER_ID,
      );

      const overlays = await repos.metaOverlays.acceptedPlayerOverlays(metaEventId);
      expect(overlays).toHaveLength(1);
      expect(overlays[0]!.claimedFields.toSorted()).toEqual(["losses", "wins"]);
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player).toMatchObject({ wins: 9, losses: 2 });
    });

    it("replaces the source's list, carrying the printing each line pins", async () => {
      const { metaEventId, metaEventPlayerId, deckId } =
        await seedMirroredPlayer("mor-player-list");

      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        {
          list: {
            cards: [
              {
                cardId: addedCardId,
                zone: "main",
                quantity: 2,
                preferredPrintingId: addedPrintingId,
              },
            ],
            listStatus: "partial",
          },
        },
        META_ARCHIVE_USER_ID,
      );
      await promoteMetaEvent(repos, metaEventId);

      expect(await deckCards(deckId)).toEqual([
        { cardId: addedCardId, quantity: 2, preferredPrintingId: addedPrintingId },
      ]);
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player!.listStatus).toBe("partial");
    });

    it("detaches the deck for a claimed-empty list, and keeps it detached", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-no-list");

      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { list: null },
        META_ARCHIVE_USER_ID,
      );
      await promoteMetaEvent(repos, metaEventId);

      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player).toMatchObject({ deckId: null, listStatus: "none" });
    });

    it("renames the derived deck, and later promotes keep the name", async () => {
      const { metaEventId, metaEventPlayerId, deckId } =
        await seedMirroredPlayer("mor-player-rename");

      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        {
          list: {
            name: "MOR Curated List",
            cards: [{ cardId: addedCardId, zone: "main", quantity: 2 }],
            listStatus: "full",
          },
        },
        META_ARCHIVE_USER_ID,
      );
      const renamed = await db
        .selectFrom("decks")
        .select("name")
        .where("id", "=", deckId)
        .executeTakeFirst();

      await promoteMetaEvent(repos, metaEventId);

      const after = await db
        .selectFrom("decks")
        .select("name")
        .where("id", "=", deckId)
        .executeTakeFirst();
      expect(renamed?.name).toBe("MOR Curated List");
      expect(after?.name).toBe("MOR Curated List");
    });

    it("refuses a list naming a card the catalog does not have", async () => {
      const { metaEventId, metaEventPlayerId, deckId } =
        await seedMirroredPlayer("mor-player-bad-card");

      await expect(
        writeMetaPlayerOverlayFields(
          repos,
          metaEventPlayerId,
          {
            list: {
              cards: [{ cardId: crypto.randomUUID(), zone: "main", quantity: 1 }],
              listStatus: "full",
            },
          },
          META_ARCHIVE_USER_ID,
        ),
      ).rejects.toBeInstanceOf(AppError);

      expect(await repos.metaOverlays.acceptedPlayerOverlays(metaEventId)).toEqual([]);
      expect(await deckCards(deckId)).toMatchObject([{ cardId: sourceCardId }]);
    });

    it("refuses to clear the name of a row no source names", async () => {
      const metaEventId = await seedLiveEvent("mor-player-nameless");
      const created = await repo.createPlayer(
        {
          eventId: metaEventId,
          rank: 1,
          rankIsTier: false,
          playerName: "MOR Hand Entered",
          wins: null,
          losses: null,
          draws: null,
          legendCardId: null,
          championCardId: null,
          deck: null,
        },
        null,
      );

      await expect(
        writeMetaPlayerOverlayFields(
          repos,
          created?.metaEventPlayerId as string,
          { fields: { playerName: null } },
          META_ARCHIVE_USER_ID,
        ),
      ).rejects.toBeInstanceOf(AppError);

      expect(await repos.metaOverlays.acceptedPlayerOverlays(metaEventId)).toEqual([]);
    });

    it("404s a standings row that no longer exists", async () => {
      await expect(
        writeMetaPlayerOverlayFields(
          repos,
          crypto.randomUUID(),
          { fields: { wins: 1 } },
          META_ARCHIVE_USER_ID,
        ),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe("releaseMetaPlayerOverlayField", () => {
    it("hands a scalar back to the source and deletes the emptied admin row", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-release");
      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { fields: { wins: 9 } },
        META_ARCHIVE_USER_ID,
      );

      await releaseMetaPlayerOverlayField(repos, metaEventPlayerId, "wins");

      expect(await repos.metaOverlays.acceptedPlayerOverlays(metaEventId)).toEqual([]);
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player!.wins).toBe(4);
    });

    it("re-attaches the source's deck when the list claim is handed back", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-relist");
      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        { list: null },
        META_ARCHIVE_USER_ID,
      );

      await releaseMetaPlayerOverlayField(repos, metaEventPlayerId, "cards");

      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player!.deckId).not.toBeNull();
      createdDeckIds.push(player!.deckId as string);
      expect(await deckCards(player!.deckId as string)).toMatchObject([{ cardId: sourceCardId }]);
    });

    it("releases listStatus and cards together, since neither stands alone", async () => {
      const { metaEventId, metaEventPlayerId } =
        await seedMirroredPlayer("mor-player-release-both");
      await writeMetaPlayerOverlayFields(
        repos,
        metaEventPlayerId,
        {
          fields: { wins: 9 },
          list: { cards: [{ cardId: addedCardId, zone: "main", quantity: 1 }], listStatus: "full" },
        },
        META_ARCHIVE_USER_ID,
      );

      await releaseMetaPlayerOverlayField(repos, metaEventPlayerId, "listStatus");

      const overlays = await repos.metaOverlays.acceptedPlayerOverlays(metaEventId);
      expect(overlays).toHaveLength(1);
      expect(overlays[0]).toMatchObject({ claimedFields: ["wins"], listStatus: null });
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player!.wins).toBe(9);
    });

    it("rejects an emptied submission rather than deleting somebody's contribution", async () => {
      const { metaEventId, metaEventPlayerId } = await seedMirroredPlayer("mor-player-submission");
      const overlayId = await repos.metaOverlays.insertPlayerOverlay(
        {
          metaEventPlayerId,
          wins: 9,
          claimedFields: ["wins"],
          status: "accepted",
          acceptedAt: new Date("2026-08-16T00:00:00Z"),
          submissionNote: "Counted it off the stream.",
          submittedByUserId: otherAdminId,
        },
        [],
      );

      await releaseMetaPlayerOverlayField(repos, metaEventPlayerId, "wins");

      expect(await repos.metaOverlays.playerOverlayById(overlayId)).toMatchObject({
        status: "rejected",
        claimedFields: ["wins"],
      });
      const [player] = await repo.rawStandingsForEvent(metaEventId);
      expect(player!.wins).toBe(4);
    });

    it("404s a standings row that no longer exists", async () => {
      await expect(
        releaseMetaPlayerOverlayField(repos, crypto.randomUUID(), "wins"),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe("releaseEventOverlayField", () => {
    it("hands the field back to the source and deletes the emptied admin row", async () => {
      const metaEventId = await seedMirroredEvent("mor-release-to-source");
      await writeEventOverlayFields(
        repos,
        metaEventId,
        [{ field: "organizer", value: "MOR Admin Choice" }],
        META_ARCHIVE_USER_ID,
      );

      await releaseEventOverlayField(repos, metaEventId, "organizer");

      expect(await repos.metaOverlays.acceptedEventOverlays(metaEventId)).toEqual([]);
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: "MOR Mirror Shop" });
    });

    it("keeps the claims it did not release", async () => {
      const metaEventId = await seedLiveEvent("mor-release-one-of-two");
      await writeEventOverlayFields(
        repos,
        metaEventId,
        [
          { field: "organizer", value: "MOR Card Bazaar" },
          { field: "location", value: "Zaun" },
        ],
        META_ARCHIVE_USER_ID,
      );

      await releaseEventOverlayField(repos, metaEventId, "organizer");

      const overlays = await repos.metaOverlays.acceptedEventOverlays(metaEventId);
      expect(overlays).toHaveLength(1);
      expect(overlays[0]).toMatchObject({ claimedFields: ["location"], organizer: null });
      expect(await repo.eventById(metaEventId)).toMatchObject({
        organizer: null,
        location: "Zaun",
      });
    });

    it("rejects an emptied submission rather than deleting somebody's contribution", async () => {
      const metaEventId = await seedLiveEvent("mor-release-submission");
      const overlayId = await repos.metaOverlays.insertEventOverlay({
        metaEventId,
        organizer: "MOR Contributed Shop",
        claimedFields: ["organizer"],
        status: "accepted",
        acceptedAt: new Date("2026-08-16T00:00:00Z"),
        submissionNote: "Saw it on the organizer's stream.",
        submittedByUserId: otherAdminId,
      });

      await releaseEventOverlayField(repos, metaEventId, "organizer");

      expect(await repos.metaOverlays.eventOverlayById(overlayId)).toMatchObject({
        status: "rejected",
        claimedFields: ["organizer"],
      });
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: null });
    });
  });

  describe("acceptMetaEventOverlay", () => {
    async function seedProposal(
      externalId: string,
      values: Record<string, unknown>,
    ): Promise<string> {
      return await repos.metaOverlays.insertEventOverlay({
        metaEventId: null,
        provider: "morpush",
        externalId,
        claimedFields: ["organizer"],
        submittedByUserId: otherAdminId,
        ...values,
      });
    }

    it("leaves a proposal pending when it names too little to mint an event", async () => {
      const overlayId = await seedProposal("mor-incomplete", { organizer: "MOR Card Bazaar" });

      await expect(acceptMetaEventOverlay(repos, overlayId)).rejects.toBeInstanceOf(AppError);

      // The check runs before the status flip: an overlay marked accepted with
      // no live event behind it would never be re-offered for review.
      expect(await repos.metaOverlays.eventOverlayById(overlayId)).toMatchObject({
        status: "pending",
        metaEventId: null,
      });
    });

    it("accepts a proposal into an event the archive already has, minting nothing", async () => {
      const metaEventId = await seedLiveEvent("mor-accept-into-existing");
      const overlayId = await seedProposal("mor-duplicate", {
        name: "MOR Summoner Skirmish",
        eventDate: "2026-08-15",
        format: "constructed",
        organizer: "MOR Card Bazaar",
        claimedFields: ["name", "eventDate", "format", "organizer"],
      });
      const playerOverlayId = await repos.metaOverlays.insertPlayerOverlay(
        {
          eventOverlayId: overlayId,
          playerName: "MOR Ashe",
          rank: 1,
          claimedFields: ["playerName", "rank"],
          provider: "morpush",
          sourcePlayerKey: playerSourceKey("mor-duplicate", "p1"),
          submittedByUserId: otherAdminId,
        },
        [],
      );

      const result = await acceptMetaEventOverlay(repos, overlayId, metaEventId);

      expect(result).toEqual({ metaEventId, created: false });
      expect(await repos.metaOverlays.eventOverlayById(overlayId)).toMatchObject({
        metaEventId,
        status: "accepted",
      });
      expect(await repos.metaOverlays.playerOverlayById(playerOverlayId)).toMatchObject({
        metaEventId,
        eventOverlayId: null,
      });
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: "MOR Card Bazaar" });
    });
  });

  describe("taking an upload back", () => {
    async function acceptUpload(
      externalId: string,
      metaEventId: string,
      playerName: string,
    ): Promise<{ eventOverlayId: string; playerOverlayId: string }> {
      const eventOverlayId = await repos.metaOverlays.insertEventOverlay({
        metaEventId: null,
        provider: "morpush",
        externalId,
        name: "MOR Summoner Skirmish",
        eventDate: "2026-08-15",
        format: "constructed",
        organizer: "MOR Card Bazaar",
        claimedFields: ["name", "eventDate", "format", "organizer"],
        submittedByUserId: otherAdminId,
      });
      const playerOverlayId = await repos.metaOverlays.insertPlayerOverlay(
        {
          eventOverlayId,
          playerName,
          rank: 3,
          claimedFields: ["playerName", "rank"],
          provider: "morpush",
          sourcePlayerKey: playerSourceKey(externalId, "p1"),
          submittedByUserId: otherAdminId,
        },
        [],
      );
      await acceptMetaEventOverlay(repos, eventOverlayId, metaEventId);
      await acceptMetaPlayerOverlay(repos, playerOverlayId);
      return { eventOverlayId, playerOverlayId };
    }

    it("reverts a whole upload: claims released, minted rows taken back", async () => {
      const metaEventId = await seedLiveEvent("mor-revert-upload");
      await acceptUpload("mor-revert-evt", metaEventId, "MOR Nobody");

      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(1);
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: "MOR Card Bazaar" });

      const result = await revertMetaUpload(repos, "morpush", "mor-revert-evt");

      expect(result).toMatchObject({ players: 1, eventRejected: true });
      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(0);
      expect(await repo.eventById(metaEventId)).toMatchObject({ organizer: null });
    });

    it("keeps the rejected overlays, so a corrected file can be accepted again", async () => {
      const metaEventId = await seedLiveEvent("mor-revert-keeps-rows");
      const { eventOverlayId, playerOverlayId } = await acceptUpload(
        "mor-revert-keep",
        metaEventId,
        "MOR Kept",
      );

      await revertMetaUpload(repos, "morpush", "mor-revert-keep");

      expect(await repos.metaOverlays.eventOverlayById(eventOverlayId)).toMatchObject({
        status: "rejected",
      });
      expect(await repos.metaOverlays.playerOverlayById(playerOverlayId)).toMatchObject({
        status: "rejected",
        playerName: "MOR Kept",
      });
    });

    it("moves an upload accepted into the wrong event, leaving nothing behind", async () => {
      const wrong = await seedLiveEvent("mor-move-wrong");
      const right = await seedLiveEvent("mor-move-right");
      const { eventOverlayId, playerOverlayId } = await acceptUpload(
        "mor-move-evt",
        wrong,
        "MOR Moved",
      );

      await moveMetaEventOverlay(repos, eventOverlayId, right);

      expect(await repo.rawStandingsForEvent(wrong)).toHaveLength(0);
      expect(await repo.eventById(wrong)).toMatchObject({ organizer: null });
      const moved = await repo.rawStandingsForEvent(right);
      expect(moved).toHaveLength(1);
      expect(await repo.eventById(right)).toMatchObject({ organizer: "MOR Card Bazaar" });
      expect(await repos.metaOverlays.playerOverlayById(playerOverlayId)).toMatchObject({
        metaEventPlayerId: moved[0]?.id,
      });
    });

    it("takes back the row a mis-linked overlay minted when it is linked to the right one", async () => {
      const metaEventId = await seedLiveEvent("mor-relink");
      const listed = await repo.createPlayer(
        {
          eventId: metaEventId,
          rank: 1,
          rankIsTier: false,
          playerName: "MOR Listed",
          wins: null,
          losses: null,
          draws: null,
          legendCardId: null,
          championCardId: null,
          deck: null,
        },
        null,
      );
      const { playerOverlayId } = await acceptUpload("mor-relink-evt", metaEventId, "MOR Lsted");

      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(2);

      await linkMetaPlayerOverlay(repos, playerOverlayId, listed?.metaEventPlayerId ?? "");

      const after = await repo.rawStandingsForEvent(metaEventId);
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        id: listed?.metaEventPlayerId,
        playerName: "MOR Lsted",
      });
    });
  });
});
