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

/** A ledger row with its jsonb column parsed. */
export type CardSubmissionRow = Selectable<CardSubmissionsTable>;

/**
 * The durable outcome record for in-app card submissions (ADR-036, migration
 * 234). Separate from `candidate_cards` because staging is disposable and a
 * contributor's history is not.
 *
 * @returns An object with card-submission query methods bound to the given `db`.
 */
export function cardSubmissionsRepo(db: Kysely<Database>) {
  return {
    /**
     * Record a new submission. Called inside the ingest transaction so a
     * candidate row never exists without its ledger row.
     * @returns The new submission's id.
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

    /**
     * One contributor's submissions, newest first, keyset-paginated. Always
     * scoped by `userId` here rather than at the call site.
     * @returns Up to `limit + 1` rows, so the caller can detect a next page.
     */
    listByUser(
      userId: string,
      options: { cursor?: string | null; limit: number },
    ): Promise<CardSubmissionRow[]> {
      return listOwnedByUser<CardSubmissionRow>(db, "cardSubmissions", userId, options);
    },

    /**
     * Resolve a submission from the candidate's natural key, which is all the
     * ignore path has to work with.
     * @returns The submission, or null when the key isn't a user submission.
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
     * Submissions still awaiting an outcome for the given staging rows. The
     * check verbs pass the candidates they just touched; most will be scraped
     * providers with no ledger row at all.
     * @returns The pending submissions among those candidates.
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
     * Every submission still awaiting an outcome under a provider. Backs the
     * bulk "check this whole provider" admin action, which settles submissions
     * without naming the candidates it touched.
     * @param provider The provider being bulk-checked.
     * @returns The provider's pending submissions.
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
     * The submission behind one staging row, whatever its status. Backs the
     * admin's reply dialog, which has to show any note already written.
     * @returns The submission, or null when the candidate isn't a submission.
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
     * The live card a submission's name resolves to, checked at review time
     * rather than trusting the slug stored at submission time (a new-card
     * submission had no card then and may have one now).
     *
     * Same two-step rule as `resolveCardIdByName` in candidate-links.ts —
     * `cards.norm_name` first, then `card_name_aliases` — done as two indexed
     * lookups instead of loading the whole catalog index for one submission.
     *
     * @param normName The normalized card name.
     * @returns The live card's id and slug, or null when nothing matches.
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
     *
     * @param cardId The live card the submission matched, or null.
     * @param shortCodes Printing short codes the submission carries.
     * @returns The comparison snapshot, plus the matched card's slug for the ledger's link target.
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

    /**
     * Count a user's submissions since a cutoff, for the ADR-036 daily cap.
     * Counts the ledger rather than `candidate_cards` so purging staging can
     * never hand a spammer a fresh allowance.
     * @returns The number of submissions made since `since`.
     */
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
