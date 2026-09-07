import { WellKnown } from "@openrift/shared/well-known";
import { afterAll, describe, expect, it } from "vitest";

import type { Transact } from "../deps.js";
import { createTransact } from "../deps.js";
import { metaRepo } from "../repositories/meta.js";
import { createDbContext, seedTestUser, syncCardCardTypes } from "../test/integration-context.js";
import { submitMetaDeck } from "./meta-submission.js";

// Uses the prefix MSI- / msi- for everything it creates.

const ctx = createDbContext(crypto.randomUUID());

const createdEventIds: string[] = [];
const createdUserIds: string[] = [];
const createdCardIds: string[] = [];

let transact: Transact;
let submitterId: string;
let metaEventId: string;

if (ctx) {
  const { db } = ctx;
  transact = createTransact(db);

  const submitter = await seedTestUser(db);
  submitterId = submitter.id;
  createdUserIds.push(submitter.id);

  const [spell] = await db
    .insertInto("cards")
    .values({
      name: "MSI Spell",
      slug: "msi-spell",
      type: "spell",
      normName: "msispell",
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  createdCardIds.push(spell!.id);
  await syncCardCardTypes(db);

  const event = await metaRepo(db).createEvent({
    slug: "msi-summoner-skirmish",
    name: "MSI Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "constructed",
    playerCount: null,
    organizer: null,
    notes: null,
    tier: "competitive",
    country: null,
    location: null,
  });
  metaEventId = event.id;
  createdEventIds.push(event.id);

  afterAll(async () => {
    await db.deleteFrom("metaSubmissions").where("userId", "in", createdUserIds).execute();
    await db
      .deleteFrom("metaEventPlayerOverlays")
      .where("metaEventId", "in", createdEventIds)
      .execute();
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
    await db.deleteFrom("users").where("id", "in", createdUserIds).execute();
  });
}

describe.skipIf(!ctx)("submitMetaDeck (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;

  it("stages the overlay, its lines and the ledger row in one transaction", async () => {
    const result = await submitMetaDeck(transact, {
      userId: submitterId,
      metaEventId,
      proposedEvent: null,
      kind: "new_list",
      playerName: "MSI Inazumi",
      rank: 9,
      rankIsTier: false,
      wins: 11,
      losses: 1,
      draws: 1,
      listStatus: "full",
      cards: [
        { name: "MSI Spell", zone: WellKnown.deckZone.MAIN, quantity: 3 },
        { name: "MSI Unknown Card", zone: WellKnown.deckZone.BATTLEFIELD, quantity: 1 },
      ],
      note: null,
      now: new Date(),
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.unresolvedNames).toEqual(["MSI Unknown Card"]);

    const overlay = await db
      .selectFrom("metaEventPlayerOverlays")
      .selectAll()
      .where("id", "=", result.playerOverlayId)
      .executeTakeFirstOrThrow();
    expect(overlay.metaEventId).toBe(metaEventId);
    expect(overlay.playerName).toBe("MSI Inazumi");

    const cards = await db
      .selectFrom("metaEventPlayerOverlayCards")
      .selectAll()
      .where("overlayId", "=", result.playerOverlayId)
      .orderBy("lineNumber", "asc")
      .execute();
    expect(cards.map((card) => card.cardName)).toEqual(["MSI Spell", "MSI Unknown Card"]);

    const submission = await db
      .selectFrom("metaSubmissions")
      .selectAll()
      .where("id", "=", result.submissionId)
      .executeTakeFirstOrThrow();
    expect(submission.playerOverlayId).toBe(result.playerOverlayId);
  });
});
