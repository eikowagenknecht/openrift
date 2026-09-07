import type { ExpressionBuilder, Kysely, UpdateResult } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ProposedCard, ProposedPrinting } from "../lib/card-submission-diff.js";

export function candidateReviewRepo(db: Kysely<Database>) {
  return {
    /**
     * How far review has got on each candidate: whether the card itself is
     * checked, and how many of its printings are not. A user submission is only
     * settled once both are done, so checking one printing of a multi-printing
     * submission doesn't resolve it early.
     */
    async reviewStateForCandidates(
      candidateCardIds: string[],
    ): Promise<Map<string, { checked: boolean; uncheckedPrintings: number }>> {
      const states = new Map<string, { checked: boolean; uncheckedPrintings: number }>();
      if (candidateCardIds.length === 0) {
        return states;
      }
      const rows = await db
        .selectFrom("candidateCards as cc")
        .leftJoin("candidatePrintings as cp", (join) =>
          join.onRef("cp.candidateCardId", "=", "cc.id").on("cp.checkedAt", "is", null),
        )
        .select(({ fn }) => [
          "cc.id",
          "cc.checkedAt",
          fn.count<string>("cp.id").as("uncheckedPrintings"),
        ])
        .where("cc.id", "in", candidateCardIds)
        .groupBy(["cc.id", "cc.checkedAt"])
        .execute();
      for (const row of rows) {
        states.set(row.id, {
          checked: row.checkedAt !== null,
          uncheckedPrintings: Number(row.uncheckedPrintings),
        });
      }
      return states;
    },

    // Reads current values from candidate staging, not the ledger, so the review-time comparison stays live.
    async proposalForCandidate(
      candidateCardId: string,
    ): Promise<{ card: ProposedCard; printings: ProposedPrinting[] } | null> {
      const card = await db
        .selectFrom("candidateCards")
        .select(["name", "types", "might", "energy", "power", "mightBonus", "tags"])
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
      if (!card) {
        return null;
      }
      const printings = await db
        .selectFrom("candidatePrintings")
        .select([
          "shortCode",
          // Identity, not compared: a short code alone does not distinguish a
          // card's finishes and languages from one another.
          "finish",
          "markerSlugs",
          "language",
          "rarity",
          "artist",
          "artVariant",
          "size",
          "isSigned",
          "isOvernumbered",
          "flavorText",
          "printedRulesText",
          "printedEffectText",
          "printedName",
          "imageUrl",
        ])
        .where("candidateCardId", "=", candidateCardId)
        .execute();
      return { card, printings };
    },

    checkCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: new Date() })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    uncheckCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    /**
     * Marks all candidate cards with matching normalized names OR linked to the given card as checked.
     * The returned ids are every matching candidate, not only the rows this call flipped.
     */
    async checkAllCandidateCards(
      normNames: string[],
      cardId: string,
    ): Promise<{ updated: number; candidateCardIds: string[] }> {
      const now = new Date();
      const linkedByPrintingId = db
        .selectFrom("candidatePrintings")
        .innerJoin("printings", "printings.id", "candidatePrintings.printingId")
        .select("candidatePrintings.candidateCardId")
        .where("printings.cardId", "=", cardId);

      // Short-code linking matches the display query's logic.
      const printingShortCodes = db
        .selectFrom("printings")
        .select("shortCode")
        .where("cardId", "=", cardId);
      const linkedByShortCode = db
        .selectFrom("candidatePrintings as ps_match")
        .select("ps_match.candidateCardId")
        .where("ps_match.shortCode", "in", printingShortCodes);

      const matches = (eb: ExpressionBuilder<Database, "candidateCards">) =>
        eb.or([
          eb("candidateCards.normName", "in", normNames),
          eb("candidateCards.id", "in", linkedByPrintingId),
          eb("candidateCards.id", "in", linkedByShortCode),
        ]);

      const rows = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where(matches)
        .where("checkedAt", "is", null)
        .returning("id")
        .execute();

      const allMatching = await db
        .selectFrom("candidateCards")
        .select("id")
        .where(matches)
        .execute();

      return { updated: rows.length, candidateCardIds: allMatching.map((row) => row.id) };
    },

    checkCandidatePrinting(id: string): Promise<{ candidateCardId: string } | undefined> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where("id", "=", id)
        .returning("candidateCardId")
        .executeTakeFirst();
    },

    uncheckCandidatePrinting(id: string): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async checkAllCandidatePrintings(
      printingId?: string,
      extraIds?: string[],
    ): Promise<{ updated: number; candidateCardIds: string[] }> {
      if (!printingId && !extraIds?.length) {
        return { updated: 0, candidateCardIds: [] };
      }
      const rows = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where((eb) =>
          eb.or([
            ...(printingId ? [eb("printingId", "=", printingId)] : []),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checkedAt", "is", null)
        .returning("candidateCardId")
        .execute();
      return {
        updated: rows.length,
        candidateCardIds: [...new Set(rows.map((row) => row.candidateCardId))],
      };
    },

    async checkByProvider(
      provider: string,
      now: Date,
    ): Promise<{ cardsChecked: number; printingsChecked: number }> {
      const cardResult = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where("provider", "=", provider)
        .where("checkedAt", "is", null)
        .executeTakeFirstOrThrow();

      const printingResult = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: now })
        .where("checkedAt", "is", null)
        .where(
          "candidateCardId",
          "in",
          db.selectFrom("candidateCards").select("id").where("provider", "=", provider),
        )
        .executeTakeFirstOrThrow();

      return {
        cardsChecked: Number(cardResult.numUpdatedRows),
        printingsChecked: Number(printingResult.numUpdatedRows),
      };
    },
  };
}
