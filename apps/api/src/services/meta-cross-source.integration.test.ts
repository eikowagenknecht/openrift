import { afterAll, describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { createRepos } from "../deps.js";
import { metaRepo } from "../repositories/meta.js";
import { createDbContext } from "../test/integration-context.js";
import {
  linkMetaCrossSourcePlayers,
  metaCrossSourceReview,
  setMetaEventSourceContributes,
  unlinkMetaCrossSourcePlayer,
} from "./meta-cross-source.js";
import { promoteMetaEvent } from "./meta-promote.js";

// Uses the prefix MCS- / mcs- for everything it creates, and shop ids well
// clear of the source's own id space.

const ctx = createDbContext(crypto.randomUUID());

const SHOP_ID_BASE = 990_600;
let nextShopId = SHOP_ID_BASE;

const createdEventIds: string[] = [];
const createdShopIds: number[] = [];
const createdTids: string[] = [];

let repos: Repos;

if (ctx) {
  const { db } = ctx;
  repos = createRepos(db);

  afterAll(async () => {
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db
      .deleteFrom("playloltcgEventStandings")
      .where("activityShopId", "in", createdShopIds)
      .execute();
    await db.deleteFrom("playloltcgEvents").where("activityShopId", "in", createdShopIds).execute();
    await db.deleteFrom("topdeckEvents").where("tid", "in", createdTids).execute();
  });
}

describe.skipIf(!ctx)("cross-mirror player links", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);

  /** One event described by both mirrors: playloltcg read, topdeck cited only. */
  async function seedTwoMirrors(
    slug: string,
    topdeckPlayers: readonly { playerKey: string; playerName: string; rank: number }[],
  ): Promise<{ metaEventId: string; topdeckSourceId: string }> {
    nextShopId++;
    const activityShopId = nextShopId;
    createdShopIds.push(activityShopId);
    const tid = `mcs-${slug}`;
    createdTids.push(tid);

    await db
      .insertInto("playloltcgEvents")
      .values({
        activityShopId,
        name: "MCS Rift Open",
        startAt: "2026-08-20",
        playerCount: 2,
        contentHash: "mcs-hash",
        lastSeenAt: new Date("2026-08-21T00:00:00Z"),
      })
      .execute();
    await db
      .insertInto("playloltcgEventStandings")
      .values([
        { activityShopId, playerKey: "u1", playerName: "MCS Ashe", rank: 1 },
        { activityShopId, playerKey: "u2", playerName: "MCS Jinx", rank: 2 },
      ])
      .execute();

    await db
      .insertInto("topdeckEvents")
      .values({
        tid,
        name: "MCS Rift Open",
        format: "Constructed",
        startAt: new Date("2026-08-20T18:00:00Z"),
        playerCount: topdeckPlayers.length,
        contentHash: "mcs-hash",
        lastSeenAt: new Date("2026-08-21T00:00:00Z"),
      })
      .execute();
    await db
      .insertInto("topdeckEventStandings")
      .values(topdeckPlayers.map((player) => ({ tid, ...player })))
      .execute();

    const event = await repo.createEvent({
      slug,
      name: "MCS Rift Open",
      eventDate: "2026-08-20",
      format: "constructed",
      playerCount: null,
      organizer: null,
      notes: null,
      tier: "competitive",
      country: null,
      location: null,
    });
    createdEventIds.push(event.id);

    await repo.insertEventSource({
      metaEventId: event.id,
      provider: "playloltcg",
      externalId: String(activityShopId),
      label: "playloltcg",
      sourceUrl: null,
    });
    const topdeck = await repo.insertEventSource({
      metaEventId: event.id,
      provider: "topdeck",
      externalId: tid,
      label: "topdeck",
      sourceUrl: null,
    });
    await promoteMetaEvent(repos, event.id);
    return { metaEventId: event.id, topdeckSourceId: topdeck.id };
  }

  describe("metaCrossSourceReview", () => {
    it("lists the unread mirror's entries with the live rows they might be", async () => {
      const { metaEventId } = await seedTwoMirrors("mcs-review", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
        { playerKey: "z", playerName: "Gwen Voltari", rank: 9 },
      ]);

      const review = await metaCrossSourceReview(repos, metaEventId);

      expect(review.sources.find((row) => row.provider === "topdeck")?.contributes).toBe(false);
      expect(review.rows.filter((row) => row.state === "unreviewed")).toHaveLength(2);
      const ashe = review.rows.find((row) => row.sourceIdentity === "ta");
      expect(ashe?.state).toBe("unreviewed");
      expect(ashe?.suggestions[0]?.isExact).toBe(true);
      // The name shares no bigram with either live row and the finish is its
      // own, so nothing is offered.
      expect(review.rows.find((row) => row.sourceIdentity === "tz")?.suggestions).toEqual([]);
    });

    it("says nothing about a mirror that already contributes", async () => {
      const { metaEventId, topdeckSourceId } = await seedTwoMirrors("mcs-read", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
      ]);
      await repos.metaPlayerLinks.putMany([
        { metaEventId, provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: null },
      ]);
      await setMetaEventSourceContributes(repos, topdeckSourceId, true);

      const review = await metaCrossSourceReview(repos, metaEventId);

      expect(review.rows).toEqual([]);
      expect(review.sources.find((row) => row.provider === "topdeck")?.contributes).toBe(true);
    });

    it("leaves out a live row another entry of the same mirror already claims", async () => {
      const { metaEventId } = await seedTwoMirrors("mcs-claimed", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
        { playerKey: "b", playerName: "MCS Ashe", rank: 1 },
      ]);
      const players = await repo.adminPlayersForEvent(metaEventId);
      const ashe = players.find((player) => player.playerName === "MCS Ashe");
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: ashe?.id ?? "" },
      ]);

      const review = await metaCrossSourceReview(repos, metaEventId);

      const other = review.rows.find((row) => row.sourceIdentity === "tb");
      expect(other?.state).toBe("unreviewed");
      expect(
        other?.suggestions.some((suggestion) => suggestion.metaEventPlayerId === ashe?.id),
      ).toBe(false);
    });
  });

  describe("setMetaEventSourceContributes", () => {
    it("refuses to read a mirror while any of its entries is undecided", async () => {
      const { metaEventId, topdeckSourceId } = await seedTwoMirrors("mcs-gate", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
        { playerKey: "b", playerName: "MCS Jinx", rank: 2 },
      ]);
      const players = await repo.adminPlayersForEvent(metaEventId);
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        {
          provider: "topdeck",
          sourceIdentity: "ta",
          metaEventPlayerId: players.find((player) => player.rank === 1)?.id ?? "",
        },
      ]);

      await expect(setMetaEventSourceContributes(repos, topdeckSourceId, true)).rejects.toThrow(
        /not linked yet/u,
      );

      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        {
          provider: "topdeck",
          sourceIdentity: "tb",
          metaEventPlayerId: players.find((player) => player.rank === 2)?.id ?? "",
        },
      ]);
      await setMetaEventSourceContributes(repos, topdeckSourceId, true);

      const rows = await repo.rawStandingsForEvent(metaEventId);
      expect(rows).toHaveLength(2);
    });

    it("takes an entry back to undecided, which closes the gate again", async () => {
      const { metaEventId, topdeckSourceId } = await seedTwoMirrors("mcs-undo", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
      ]);
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: null },
      ]);
      await setMetaEventSourceContributes(repos, topdeckSourceId, true);
      await setMetaEventSourceContributes(repos, topdeckSourceId, false);

      await unlinkMetaCrossSourcePlayer(repos, metaEventId, "topdeck", "ta");

      await expect(setMetaEventSourceContributes(repos, topdeckSourceId, true)).rejects.toThrow(
        /not linked yet/u,
      );
    });

    it("keeps promotion from minting a duplicate by refusing an unlink under a read mirror", async () => {
      const { metaEventId, topdeckSourceId } = await seedTwoMirrors("mcs-undo-read", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
      ]);
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: null },
      ]);
      await setMetaEventSourceContributes(repos, topdeckSourceId, true);
      const before = await repo.rawStandingsForEvent(metaEventId);

      await expect(
        unlinkMetaCrossSourcePlayer(repos, metaEventId, "topdeck", "ta"),
      ).rejects.toThrow(/Stop reading it first/u);

      expect(await repo.rawStandingsForEvent(metaEventId)).toHaveLength(before.length);
    });
  });

  describe("linkMetaCrossSourcePlayers", () => {
    it("refuses a link onto a row while the entry's own promoted row still stands", async () => {
      const { metaEventId, topdeckSourceId } = await seedTwoMirrors("mcs-dupe", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
      ]);
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: null },
      ]);
      await setMetaEventSourceContributes(repos, topdeckSourceId, true);
      const players = await repo.adminPlayersForEvent(metaEventId);
      const readRow = players.find((player) => player.sourceIdentity === "pu1");

      await expect(
        linkMetaCrossSourcePlayers(repos, metaEventId, [
          { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: readRow?.id ?? "" },
        ]),
      ).rejects.toThrow(/its own archived standings row/u);
    });

    it("refuses a live row another entry of the same mirror already holds", async () => {
      const { metaEventId } = await seedTwoMirrors("mcs-claim", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
        { playerKey: "b", playerName: "MCS Jinx", rank: 2 },
      ]);
      const players = await repo.adminPlayersForEvent(metaEventId);
      const ashe = players.find((player) => player.rank === 1);
      await linkMetaCrossSourcePlayers(repos, metaEventId, [
        { provider: "topdeck", sourceIdentity: "ta", metaEventPlayerId: ashe?.id ?? "" },
      ]);

      await expect(
        linkMetaCrossSourcePlayers(repos, metaEventId, [
          { provider: "topdeck", sourceIdentity: "tb", metaEventPlayerId: ashe?.id ?? "" },
        ]),
      ).rejects.toThrow(/already linked to that standings row/u);
    });

    it("writes nothing when one decision of a batch names a row that is gone", async () => {
      const { metaEventId } = await seedTwoMirrors("mcs-atomic", [
        { playerKey: "a", playerName: "MCS Ashe", rank: 1 },
        { playerKey: "b", playerName: "MCS Jinx", rank: 2 },
      ]);
      const players = await repo.adminPlayersForEvent(metaEventId);

      await expect(
        linkMetaCrossSourcePlayers(repos, metaEventId, [
          {
            provider: "topdeck",
            sourceIdentity: "ta",
            metaEventPlayerId: players.find((player) => player.rank === 1)?.id ?? "",
          },
          {
            provider: "topdeck",
            sourceIdentity: "tb",
            metaEventPlayerId: crypto.randomUUID(),
          },
        ]),
      ).rejects.toThrow(/no longer exists/u);

      expect(await repos.metaPlayerLinks.forEvent(metaEventId)).toEqual([]);
    });
  });
});
