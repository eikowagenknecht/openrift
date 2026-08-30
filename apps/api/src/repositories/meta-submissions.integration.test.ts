import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { metaSubmissionsRepo } from "./meta-submissions.js";

const ctx = createDbContext(crypto.randomUUID());

describe.skipIf(!ctx)("metaSubmissionsRepo event corrections (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaSubmissionsRepo(db);

  const suffix = crypto.randomUUID().slice(0, 8);
  const slug = `msi-${suffix}`;
  let userId: string;
  let eventId: string;
  let correctionId: string;
  let resolvedCorrectionId: string;
  let deckSubmissionId: string;

  beforeAll(async () => {
    const user = await seedTestUser(db);
    userId = user.id;
    const [event] = await db
      .insertInto("metaEvents")
      .values({
        slug,
        name: "Summoner Skirmish Berlin",
        eventDate: "2026-08-15",
        format: "freeform",
        playerCount: 64,
        organizer: "Rift Games Berlin",
        location: "Ionia Hall, Berlin",
        country: "DE",
      })
      .returning("id")
      .execute();
    eventId = event!.id;

    correctionId = await repo.insert({
      userId,
      provider: "usersubmission",
      externalId: `${slug}-correction`,
      candidateMetaPlayerId: null,
      metaEventId: eventId,
      eventName: "Summoner Skirmish Berlin",
      playerName: null,
      kind: "event_correction",
      fieldEdits: { playerCount: 48, country: "DE" },
      note: "The results page lists 48 players.",
    });

    resolvedCorrectionId = await repo.insert({
      userId,
      provider: "usersubmission",
      externalId: `${slug}-correction-done`,
      candidateMetaPlayerId: null,
      metaEventId: eventId,
      eventName: "Summoner Skirmish Berlin",
      playerName: null,
      kind: "event_correction",
      fieldEdits: { organizer: "Rift Games Berlin e.V." },
      note: "The organizer's legal name.",
    });
    await repo.resolve(resolvedCorrectionId, {
      status: "already_correct",
      resolvedAt: new Date(),
    });

    deckSubmissionId = await repo.insert({
      userId,
      provider: "usersubmission",
      externalId: `${slug}-deck`,
      candidateMetaPlayerId: null,
      metaEventId: eventId,
      eventName: "Summoner Skirmish Berlin",
      playerName: "Nova",
      kind: "completion",
      note: null,
    });
  });

  afterAll(async () => {
    await db
      .deleteFrom("metaSubmissions")
      .where("id", "in", [correctionId, resolvedCorrectionId, deckSubmissionId])
      .execute();
    await db.deleteFrom("metaEvents").where("id", "=", eventId).execute();
    await db.deleteFrom("users").where("id", "=", userId).execute();
  });

  it("stores the proposed values as a jsonb object, not as JSON text", async () => {
    const row = await repo.byId(correctionId);
    expect(row?.fieldEdits).toEqual({ playerCount: 48, country: "DE" });
  });

  it("lists only unresolved corrections, with the event they are about", async () => {
    const rows = await repo.listPendingEventCorrections(100);
    const mine = rows.filter((row) => row.submission.metaEventId === eventId);

    expect(mine).toHaveLength(1);
    expect(mine[0]!.submission.id).toBe(correctionId);
    expect(mine[0]!.submission.playerName).toBeNull();
    expect(mine[0]!.event).toMatchObject({
      slug,
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-15",
      playerCount: 64,
      organizer: "Rift Games Berlin",
      country: "DE",
    });
  });

  it("keeps a decklist submission out of the corrections queue", async () => {
    const rows = await repo.listPendingEventCorrections(100);
    expect(rows.map((row) => row.submission.id)).not.toContain(deckSubmissionId);
  });

  it("keeps a decklist submission's kind and leaves its edit set empty", async () => {
    const row = await repo.byId(deckSubmissionId);
    expect(row?.kind).toBe("completion");
    expect(row?.fieldEdits).toBeNull();
  });
});
