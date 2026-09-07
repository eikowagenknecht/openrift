import { WellKnown } from "@openrift/shared/well-known";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { imageId, requireFrontImage } from "../../../repositories/query-helpers.js";

export function deckCheckLegendImagesRepo(db: Kysely<Database>) {
  return {
    async coverLegendsAcross(
      tournamentIds: string[],
      limit: number,
    ): Promise<{ tournamentId: string; printingId: string; imageId: string }[]> {
      if (tournamentIds.length === 0) {
        return [];
      }
      // One row per (tournament, legend card): the earliest-submitted entry's
      // printing, so one popular legend can't fill the fan several times.
      const bestPerCard = requireFrontImage(
        db
          .selectFrom("deckCheckEntries as en")
          .innerJoin("deckCheckEntryCards as c", "c.entryId", "en.id"),
        "c.resolvedPrintingId",
      )
        .select([
          "en.tournamentId",
          "c.resolvedPrintingId as printingId",
          imageId("imgf").as("imageId"),
          "en.submittedAt",
          "en.createdAt",
          "c.sortOrder",
          sql<number>`(row_number() over (
            partition by en.tournament_id, c.resolved_card_id
            order by en.submitted_at nulls last, en.created_at, c.sort_order
          ))::int`.as("printingRank"),
        ])
        .where("en.tournamentId", "in", tournamentIds)
        .where("en.allowDeckPublishing", "=", true)
        .where("en.withdrawnAt", "is", null)
        .where("c.zone", "=", WellKnown.deckZone.LEGEND)
        .where("c.resolvedPrintingId", "is not", null)
        .where(sql`${imageId("imgf")}`, "is not", null);
      // Fan slots are ranked over the deduped rows only, so a repeat legend
      // never burns a slot that a distinct one should get.
      const rankedPerTournament = db
        .selectFrom(bestPerCard.as("best"))
        .select([
          "best.tournamentId",
          "best.printingId",
          "best.imageId",
          sql<number>`(row_number() over (
            partition by best.tournament_id
            order by best.submitted_at nulls last, best.created_at, best.sort_order
          ))::int`.as("coverRank"),
        ])
        .where("best.printingRank", "=", 1);
      const rows = await db
        .selectFrom(rankedPerTournament.as("ranked"))
        .select(["ranked.tournamentId", "ranked.printingId", "ranked.imageId"])
        .where("ranked.coverRank", "<=", limit)
        .orderBy("ranked.tournamentId")
        .orderBy("ranked.coverRank")
        .execute();
      // The IS NOT NULL filters guarantee printingId/imageId here.
      return rows as { tournamentId: string; printingId: string; imageId: string }[];
    },

    async legendImagesForParticipants(participantIds: string[]): Promise<Map<string, string>> {
      if (participantIds.length === 0) {
        return new Map();
      }
      const rows = await requireFrontImage(
        db
          .selectFrom("deckCheckEntries as en")
          .innerJoin("deckCheckEntryCards as c", "c.entryId", "en.id"),
        "c.resolvedPrintingId",
      )
        .select([
          "en.participantId",
          imageId("imgf").as("imageId"),
          sql<number>`(row_number() over (
            partition by en.participant_id
            order by en.submitted_at nulls last, en.created_at, c.sort_order
          ))::int`.as("rank"),
        ])
        .where("en.participantId", "in", participantIds)
        .where("en.allowDeckPublishing", "=", true)
        .where("en.withdrawnAt", "is", null)
        .where("c.zone", "=", WellKnown.deckZone.LEGEND)
        .where(sql`${imageId("imgf")}`, "is not", null)
        .execute();
      const images = new Map<string, string>();
      for (const row of rows) {
        if (row.rank === 1 && row.participantId && row.imageId) {
          images.set(row.participantId, row.imageId);
        }
      }
      return images;
    },
  };
}
