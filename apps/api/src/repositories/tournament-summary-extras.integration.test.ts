import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../deps.js";
import { OGS_SET } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";

const OWNER_ID = crypto.randomUUID();
const ctx = createDbContext(OWNER_ID);

// Covers the batched summary-extras lookups behind the group events lens:
// the facepile preview, the card-fan cover legends, and the winner legend.
describe.skipIf(!ctx)("tournament summary extras (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repos = createRepos(db);

  const cardIds: string[] = [];
  const imageFileIds: string[] = [];
  const userIds: string[] = [];
  let counter = 0;

  beforeAll(async () => {
    await db
      .insertInto("users")
      .values({
        id: OWNER_ID,
        email: `extras-owner-${OWNER_ID}@test.com`,
        name: "Extras Owner",
        emailVerified: true,
        image: null,
      })
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("tournaments").where("hostUserId", "=", OWNER_ID).execute();
    if (cardIds.length > 0) {
      await db.deleteFrom("cards").where("id", "in", cardIds).execute();
    }
    if (imageFileIds.length > 0) {
      await db.deleteFrom("imageFiles").where("id", "in", imageFileIds).execute();
    }
    if (userIds.length > 0) {
      await db.deleteFrom("users").where("id", "in", userIds).execute();
    }
    await db.deleteFrom("users").where("id", "=", OWNER_ID).execute();
  });

  async function makeUser(name: string, image: string | null): Promise<string> {
    counter += 1;
    const id = crypto.randomUUID();
    await db
      .insertInto("users")
      .values({
        id,
        email: `extras-itest-${counter}@test.com`,
        name,
        emailVerified: true,
        image,
      })
      .execute();
    userIds.push(id);
    return id;
  }

  async function makeTournament(): Promise<string> {
    counter += 1;
    const tournament = await repos.podTournaments.create({
      hostUserId: OWNER_ID,
      name: `Extras Tournament ${counter}`,
    });
    return tournament.id;
  }

  async function addParticipant(
    tournamentId: string,
    displayName: string,
    userId?: string,
  ): Promise<string> {
    const participant = await repos.tournaments.resolveOrCreateParticipant({
      tournamentId,
      displayName,
      userId: userId ?? null,
    });
    return participant.id;
  }

  /** @returns The ids of a fresh legend card, one printing, and its front image. */
  async function makeLegend(): Promise<{ cardId: string; printingId: string }> {
    counter += 1;
    const card = await db
      .insertInto("cards")
      .values({
        slug: `extras-itest-${counter}`,
        name: `Extras Legend ${counter}`,
        type: "legend",
        might: null,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    cardIds.push(card.id);
    const printing = await db
      .insertInto("printings")
      .values({
        cardId: card.id,
        setId: OGS_SET.id,
        shortCode: `EXT-${counter}`,
        rarity: "epic",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Test Artist",
        publicCode: `OGS-9${String(counter).padStart(2, "0")}`,
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        comment: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const imageFile = await db
      .insertInto("imageFiles")
      .values({
        rehostedUrl: `https://images.example.com/extras-itest-${counter}.webp`,
        originalUrl: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    imageFileIds.push(imageFile.id);
    await db
      .insertInto("printingImages")
      .values({ printingId: printing.id, imageFileId: imageFile.id, face: "front", isActive: true })
      .execute();
    return { cardId: card.id, printingId: printing.id };
  }

  async function submitLegendDeck(
    tournamentId: string,
    participantId: string,
    legend: { cardId: string; printingId: string },
    options: { publish?: boolean; withdrawn?: boolean; submittedAt?: Date } = {},
  ): Promise<void> {
    counter += 1;
    const entry = await repos.deckCheck.createEntry({
      tournamentId,
      participantId,
      externalId: `extras-itest-entry-${counter}`,
      submittedAt: options.submittedAt ?? new Date("2026-07-01T12:00:00Z"),
      allowDeckPublishing: options.publish ?? true,
      contentHash: `hash-${counter}`,
      withdrawnAt: options.withdrawn ? new Date("2026-07-02T12:00:00Z") : null,
    });
    await repos.deckCheck.replaceEntryCards(entry.id, [
      {
        sortOrder: 0,
        rawName: "Legend",
        section: "legend",
        zone: "legend",
        quantity: 1,
        resolvedCardId: legend.cardId,
        resolvedPrintingId: legend.printingId,
        matchStatus: "matched",
      },
    ]);
  }

  it("previews the first participants in registration order, with avatar data", async () => {
    const tournamentId = await makeTournament();
    const withAvatar = await makeUser("Ava", "https://images.example.com/ava.png");
    const withoutAvatar = await makeUser("Noah", null);
    await addParticipant(tournamentId, "First", withAvatar);
    await addParticipant(tournamentId, "Second", withoutAvatar);
    for (let index = 3; index <= 7; index++) {
      await addParticipant(tournamentId, `Player ${index}`);
    }

    const rows = await repos.tournaments.participantPreviewAcross([tournamentId], 5);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.displayName)).toEqual([
      "First",
      "Second",
      "Player 3",
      "Player 4",
      "Player 5",
    ]);
    expect(rows[0]).toMatchObject({
      tournamentId,
      image: "https://images.example.com/ava.png",
    });
    expect(rows[0]!.email).toContain("@test.com");
    // An account-less participant has no avatar chain data.
    expect(rows[2]).toMatchObject({ image: null, email: null });

    expect(await repos.tournaments.participantPreviewAcross([], 5)).toEqual([]);
  });

  it("collects cover legends from consented entries only, deduped per card", async () => {
    const tournamentId = await makeTournament();
    const first = await makeLegend();
    const second = await makeLegend();
    const third = await makeLegend();
    const unconsented = await makeLegend();
    const withdrawn = await makeLegend();

    const p1 = await addParticipant(tournamentId, "P1");
    const p2 = await addParticipant(tournamentId, "P2");
    const p3 = await addParticipant(tournamentId, "P3");
    const p4 = await addParticipant(tournamentId, "P4");
    const p5 = await addParticipant(tournamentId, "P5");
    const p6 = await addParticipant(tournamentId, "P6");

    await submitLegendDeck(tournamentId, p1, first, {
      submittedAt: new Date("2026-07-01T10:00:00Z"),
    });
    await submitLegendDeck(tournamentId, p2, second, {
      submittedAt: new Date("2026-07-01T11:00:00Z"),
    });
    // A later duplicate of the first legend must not fill a second fan slot.
    await submitLegendDeck(tournamentId, p3, first, {
      submittedAt: new Date("2026-07-01T11:30:00Z"),
    });
    await submitLegendDeck(tournamentId, p4, third, {
      submittedAt: new Date("2026-07-01T12:00:00Z"),
    });
    await submitLegendDeck(tournamentId, p5, unconsented, {
      publish: false,
      submittedAt: new Date("2026-07-01T09:00:00Z"),
    });
    await submitLegendDeck(tournamentId, p6, withdrawn, {
      withdrawn: true,
      submittedAt: new Date("2026-07-01T09:30:00Z"),
    });

    const rows = await repos.deckCheck.coverLegendsAcross([tournamentId], 3);
    expect(rows.map((row) => row.printingId)).toEqual([
      first.printingId,
      second.printingId,
      third.printingId,
    ]);
    expect(rows.every((row) => row.tournamentId === tournamentId)).toBe(true);
    expect(rows.every((row) => row.imageId.length > 0)).toBe(true);

    const limited = await repos.deckCheck.coverLegendsAcross([tournamentId], 2);
    expect(limited.map((row) => row.printingId)).toEqual([first.printingId, second.printingId]);

    expect(await repos.deckCheck.coverLegendsAcross([], 3)).toEqual([]);
  });

  it("resolves winner legend images only for publishing-consented participants", async () => {
    const tournamentId = await makeTournament();
    const consentedLegend = await makeLegend();
    const privateLegend = await makeLegend();
    const consented = await addParticipant(tournamentId, "Consented");
    const withheld = await addParticipant(tournamentId, "Withheld");
    await submitLegendDeck(tournamentId, consented, consentedLegend);
    await submitLegendDeck(tournamentId, withheld, privateLegend, { publish: false });

    const images = await repos.deckCheck.legendImagesForParticipants([consented, withheld]);
    expect(images.has(consented)).toBe(true);
    expect(images.has(withheld)).toBe(false);

    expect(await repos.deckCheck.legendImagesForParticipants([])).toEqual(new Map());
  });
});
