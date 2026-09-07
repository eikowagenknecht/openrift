import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardSubmissionKind,
  CardSubmissionReason,
  CardSubmissionStatus,
  CardSubmissionsTable,
  Database,
} from "../db/index.js";
import type { LivePrintingSnapshot, LiveSnapshot } from "../lib/card-submission-diff.js";
import { buildPrintingLinkKey } from "../lib/printing-link-key.js";
import { joinFrontImage, listOwnedByUser } from "./query-helpers.js";

export type CardSubmissionRow = Selectable<CardSubmissionsTable>;

/**
 * The durable outcome record for in-app card submissions. Separate from
 * `candidate_cards` because staging is disposable and a contributor's history
 * is not.
 */
export function cardSubmissionsRepo(db: Kysely<Database>) {
  return {
    /**
     * Called inside the ingest transaction so a candidate row never exists
     * without its ledger row.
     */
    async insert(values: {
      userId: string;
      provider: string;
      externalId: string;
      candidateCardId: string;
      kind: CardSubmissionKind;
      cardName: string;
      cardSlug: string | null;
      note: string | null;
      proposedDiff: string[];
    }): Promise<string> {
      const row = await db
        .insertInto("cardSubmissions")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    // Returns up to `limit + 1` rows so the caller can detect a next page.
    listByUser(
      userId: string,
      options: { cursor?: string | null; limit: number },
    ): Promise<CardSubmissionRow[]> {
      return listOwnedByUser<CardSubmissionRow>(db, "cardSubmissions", userId, options);
    },

    /**
     * Resolve a submission from the candidate's natural key, which is all the
     * ignore path has to work with.
     */
    async findByExternalId(
      provider: string,
      externalId: string,
    ): Promise<CardSubmissionRow | null> {
      const row = await db
        .selectFrom("cardSubmissions")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * The check verbs pass the candidates they just touched; most will be
     * scraped providers with no ledger row at all.
     */
    async pendingByCandidateCardIds(candidateCardIds: string[]): Promise<CardSubmissionRow[]> {
      if (candidateCardIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("cardSubmissions")
        .selectAll()
        .where("candidateCardId", "in", candidateCardIds)
        .where("status", "=", "pending")
        .execute();
      return rows;
    },

    /**
     * Backs the bulk "check this whole provider" admin action, which settles
     * submissions without naming the candidates it touched.
     */
    async pendingByProvider(provider: string): Promise<CardSubmissionRow[]> {
      const rows = await db
        .selectFrom("cardSubmissions")
        .selectAll()
        .where("provider", "=", provider)
        .where("status", "=", "pending")
        .execute();
      return rows;
    },

    /**
     * Any status, not just pending: the admin's reply dialog has to show a
     * note already written on a settled submission.
     */
    async findByCandidateCardId(candidateCardId: string): Promise<CardSubmissionRow | null> {
      const row = await db
        .selectFrom("cardSubmissions")
        .selectAll()
        .where("candidateCardId", "=", candidateCardId)
        .executeTakeFirst();
      return row ?? null;
    },

    /**
     * Stamp an outcome. `resolvedAt` is required by a CHECK for any non-pending
     * status, so it is not optional here either.
     */
    async resolve(
      id: string,
      values: {
        status: Exclude<CardSubmissionStatus, "pending">;
        resolvedAt: Date;
        resolvedByUserId?: string | null;
        acceptedCardId?: string | null;
      },
    ): Promise<void> {
      await db
        .updateTable("cardSubmissions")
        .set({
          status: values.status,
          resolvedAt: values.resolvedAt,
          resolvedByUserId: values.resolvedByUserId ?? null,
          acceptedCardId: values.acceptedCardId ?? null,
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Return a submission to the queue. Unignoring is the only path here, so a
     * misclick on reject is recoverable and the contributor's page follows.
     * Clears the accepted card but keeps any note the admin wrote.
     */
    async reopen(id: string): Promise<void> {
      await db
        .updateTable("cardSubmissions")
        .set({ status: "pending", resolvedAt: null, acceptedCardId: null })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Write the contributor-visible reason and note. Deliberately independent
     * of {@link resolve} so the admin can write it before or after the outcome
     * lands, and edit or clear it afterwards.
     */
    async setResolutionMessage(
      id: string,
      values: {
        reason: CardSubmissionReason | null;
        note: string | null;
        resolvedByUserId: string;
      },
    ): Promise<void> {
      await db
        .updateTable("cardSubmissions")
        .set({
          resolutionReason: values.reason,
          resolutionNote: values.note,
          resolvedByUserId: values.resolvedByUserId,
        })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Checked live at review time, not the slug stored at submission (a new-card submission may now have a card).
     * Same two-step lookup as `resolveCardIdByName` in candidate-links.ts: `cards.normName` first, then `card_name_aliases`.
     */
    async liveCardByNormName(normName: string): Promise<{ id: string; slug: string } | null> {
      const direct = await db
        .selectFrom("cards")
        .select(["id", "slug"])
        .where("normName", "=", normName)
        .executeTakeFirst();
      if (direct) {
        return direct;
      }
      const aliased = await db
        .selectFrom("cardNameAliases as a")
        .innerJoin("cards as c", "c.id", "a.cardId")
        .select(["c.id", "c.slug"])
        .where("a.normName", "=", normName)
        .executeTakeFirst();
      return aliased ?? null;
    },

    /**
     * The live catalog values a submission is compared against, for both the
     * submit-time `proposed_diff` and the review-time recomputation.
     *
     * `cardId` is null for a submission that matched no card, in which case
     * only the printing lookup runs (by short code across the whole catalog),
     * so a new-card submission whose printings already exist elsewhere still
     * compares against them.
     */
    async liveSnapshot(
      cardId: string | null,
      shortCodes: string[],
    ): Promise<{ snapshot: LiveSnapshot; cardSlug: string | null }> {
      const cardRow = cardId
        ? ((await db
            .selectFrom("cards")
            .select(["slug", "name", "type", "might", "energy", "power", "mightBonus", "tags"])
            .where("id", "=", cardId)
            .executeTakeFirst()) ?? null)
        : null;
      const card = cardRow
        ? {
            name: cardRow.name,
            type: cardRow.type,
            might: cardRow.might,
            energy: cardRow.energy,
            power: cardRow.power,
            mightBonus: cardRow.mightBonus,
            tags: cardRow.tags,
          }
        : null;

      const printings = new Map<string, LivePrintingSnapshot>();
      if (shortCodes.length > 0) {
        const upperCodes = shortCodes.map((code) => code.toUpperCase());
        const rows = await joinFrontImage(db.selectFrom("printings as p"))
          .select([
            "p.shortCode",
            "p.finish",
            "p.markerSlugs",
            "p.rarity",
            "p.artist",
            "p.artVariant",
            "p.size",
            "p.isSigned",
            "p.isOvernumbered",
            "p.flavorText",
            "p.printedRulesText",
            "p.printedEffectText",
            "p.printedName",
            "p.language",
            "imgf.rehostedUrl",
          ])
          // Compared case-insensitively on both sides: source casing drifts
          // ("VEN-sp3" vs "VEN-SP3") and the link key already uppercases.
          .where(sql<boolean>`upper(p.short_code) = ANY(${upperCodes})`)
          .execute();
        for (const row of rows) {
          // Keyed by the full printing identity, not the short code: eight rows
          // can share one short code across finishes and languages, and keying
          // by it alone silently kept only the last.
          const key = buildPrintingLinkKey({
            shortCode: row.shortCode,
            finish: row.finish,
            markerSlugs: row.markerSlugs,
            language: row.language,
          });
          printings.set(key, {
            rarity: row.rarity,
            artist: row.artist,
            artVariant: row.artVariant,
            size: row.size,
            isSigned: row.isSigned,
            isOvernumbered: row.isOvernumbered,
            flavorText: row.flavorText,
            printedRulesText: row.printedRulesText,
            printedEffectText: row.printedEffectText,
            printedName: row.printedName,
            language: row.language,
            // "Has artwork the site can actually show", which is the thing an
            // image suggestion is offering to fix.
            hasImage: row.rehostedUrl !== null,
          });
        }
      }

      return { snapshot: { card, printings }, cardSlug: cardRow?.slug ?? null };
    },

    // Counts the submissions ledger, not `candidate_cards`: purging staging must not reset a user's daily cap.
    async countRecentByUser(userId: string, since: Date): Promise<number> {
      const row = await db
        .selectFrom("cardSubmissions")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", userId)
        .where("createdAt", ">=", since)
        .executeTakeFirst();
      return row ? Number(row.count) : 0;
    },
  };
}
