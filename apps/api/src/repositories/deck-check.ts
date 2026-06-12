import { normalizeNameForMatching } from "@openrift/shared";
import type {
  DeckCheckChangeSummary,
  DeckCheckEntryStatus,
  DeckCheckMatchStatus,
} from "@openrift/shared";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckCheckEntriesTable,
  DeckCheckEntryCardsTable,
  DeckCheckEventsTable,
  DeckCheckKeysTable,
} from "../db/index.js";

export type DeckCheckEvent = Selectable<DeckCheckEventsTable>;
export type DeckCheckEntry = Selectable<DeckCheckEntriesTable>;
export type DeckCheckEntryCard = Selectable<DeckCheckEntryCardsTable>;
export type DeckCheckKey = Selectable<DeckCheckKeysTable>;

export interface DeckCheckEventWithCounts extends DeckCheckEvent {
  entryCount: number;
  checkedCount: number;
}

export interface DeckCheckEntrySummary extends DeckCheckEntry {
  checkedByName: string | null;
  copyCount: number;
  verifiedCopyCount: number;
  unmatchedLineCount: number;
}

export interface NewDeckCheckEvent {
  groupId: string;
  name: string;
  eventDate: string | null;
  format: string | null;
  allowedSets: string[] | null;
}

export interface DeckCheckEventPatch {
  name?: string;
  eventDate?: string | null;
  format?: string | null;
  allowedSets?: string[] | null;
  status?: "active" | "archived";
}

export interface NewDeckCheckEntry {
  eventId: string;
  externalId: string;
  playerName: string;
  playerEmail: string | null;
  riotId: string | null;
  submittedAt: Date | null;
  publishOptOut: boolean;
  contentHash: string;
  withdrawnAt: Date | null;
}

export interface NewDeckCheckEntryCard {
  sortOrder: number;
  rawName: string;
  section: string;
  zone: string;
  quantity: number;
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

export interface CardResolutionInput {
  name: string;
}

export interface CardResolution {
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

/**
 * The lookup key `resolveCards` results are keyed by.
 * @returns The normalized card name.
 */
export function cardResolutionKey(name: string): string {
  return normalizeNameForMatching(name);
}

/**
 * postgres.js can hand jsonb back as a string under Bun; parse defensively.
 * @returns The parsed value, or null when absent.
 */
function parseJsonb<T>(value: T | string | null): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

/**
 * Normalizes the jsonb columns of an event row.
 * @returns The row with `allowedSets` guaranteed parsed.
 */
function parseEventRow<T extends { allowedSets: unknown }>(
  row: T,
): T & { allowedSets: string[] | null } {
  return { ...row, allowedSets: parseJsonb<string[]>(row.allowedSets as string[] | string | null) };
}

/**
 * Normalizes the jsonb columns of an entry row.
 * @returns The row with `changeSummary` guaranteed parsed.
 */
function parseEntryRow<T extends { changeSummary: unknown }>(
  row: T,
): T & { changeSummary: DeckCheckChangeSummary | null } {
  return {
    ...row,
    changeSummary: parseJsonb<DeckCheckChangeSummary>(
      row.changeSummary as DeckCheckChangeSummary | string | null,
    ),
  };
}

/**
 * Data access for the deck-check subsystem (ADR-025): group-owned events,
 * entrant entries with their card lines, push keys, and catalog resolution.
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
// oxlint-disable-next-line max-lines-per-function -- repository factory, one method per query
export function deckCheckRepo(db: Kysely<Database>) {
  return {
    // ── Events ──────────────────────────────────────────────────────────────

    async getEvent(groupId: string, eventId: string): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .selectFrom("deckCheckEvents")
        .selectAll()
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    async listEventsForGroup(groupId: string): Promise<DeckCheckEventWithCounts[]> {
      const rows = await db
        .selectFrom("deckCheckEvents as e")
        .selectAll("e")
        .select((eb) => [
          eb
            .selectFrom("deckCheckEntries as en")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("en.eventId", "=", "e.id")
            .where("en.withdrawnAt", "is", null)
            .as("entryCount"),
          eb
            .selectFrom("deckCheckEntries as en")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("en.eventId", "=", "e.id")
            .where("en.withdrawnAt", "is", null)
            .where("en.checkStatus", "=", "checked")
            .as("checkedCount"),
        ])
        .where("e.groupId", "=", groupId)
        .orderBy("e.createdAt", "desc")
        .execute();
      return rows.map((row) =>
        parseEventRow({
          ...row,
          entryCount: Number(row.entryCount ?? 0),
          checkedCount: Number(row.checkedCount ?? 0),
        }),
      );
    },

    async createEvent(input: NewDeckCheckEvent): Promise<DeckCheckEvent> {
      const row = await db
        .insertInto("deckCheckEvents")
        .values({
          groupId: input.groupId,
          name: input.name,
          eventDate: input.eventDate,
          format: input.format,
          allowedSets: input.allowedSets ? JSON.stringify(input.allowedSets) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return parseEventRow(row);
    },

    async updateEvent(
      groupId: string,
      eventId: string,
      patch: DeckCheckEventPatch,
    ): Promise<DeckCheckEvent | undefined> {
      const row = await db
        .updateTable("deckCheckEvents")
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.eventDate === undefined ? {} : { eventDate: patch.eventDate }),
          ...(patch.format === undefined ? {} : { format: patch.format }),
          ...(patch.allowedSets === undefined
            ? {}
            : { allowedSets: patch.allowedSets ? JSON.stringify(patch.allowedSets) : null }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
        })
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEventRow(row) : undefined;
    },

    async deleteEvent(groupId: string, eventId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("deckCheckEvents")
        .where("id", "=", eventId)
        .where("groupId", "=", groupId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    // ── Entries ─────────────────────────────────────────────────────────────

    async listEntriesForEvent(eventId: string): Promise<DeckCheckEntrySummary[]> {
      const rows = await db
        .selectFrom("deckCheckEntries as en")
        .leftJoin("users as u", "u.id", "en.checkedBy")
        .selectAll("en")
        .select((eb) => [
          eb.ref("u.name").as("checkedByName"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select((inner) =>
              inner.fn.coalesce(inner.fn.sum<number>("c.quantity"), sql<number>`0`).as("count"),
            )
            .whereRef("c.entryId", "=", "en.id")
            .as("copyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(
              sql<number>`coalesce(sum((SELECT count(*) FROM unnest(c.found_copies) AS f(v) WHERE f.v)), 0)`.as(
                "count",
              ),
            )
            .whereRef("c.entryId", "=", "en.id")
            .as("verifiedCopyCount"),
          eb
            .selectFrom("deckCheckEntryCards as c")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("c.entryId", "=", "en.id")
            .where("c.matchStatus", "!=", "matched")
            .as("unmatchedLineCount"),
        ])
        .where("en.eventId", "=", eventId)
        .orderBy("en.playerName", "asc")
        .execute();
      return rows.map((row) =>
        parseEntryRow({
          ...row,
          checkedByName: row.checkedByName ?? null,
          copyCount: Number(row.copyCount ?? 0),
          verifiedCopyCount: Number(row.verifiedCopyCount ?? 0),
          unmatchedLineCount: Number(row.unmatchedLineCount ?? 0),
        }),
      );
    },

    async getEntry(eventId: string, entryId: string): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("id", "=", entryId)
        .where("eventId", "=", eventId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    async getEntryByExternalId(
      eventId: string,
      externalId: string,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .selectFrom("deckCheckEntries")
        .selectAll()
        .where("eventId", "=", eventId)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    /**
     * Looks up the display name of whoever checked an entry.
     * @returns The user's display name, or null when unknown.
     */
    async getUserName(userId: string): Promise<string | null> {
      const row = await db
        .selectFrom("users")
        .select("name")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.name ?? null;
    },

    async createEntry(input: NewDeckCheckEntry): Promise<DeckCheckEntry> {
      const row = await db
        .insertInto("deckCheckEntries")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
      return parseEntryRow(row);
    },

    async updateEntry(
      entryId: string,
      patch: Partial<{
        playerName: string;
        playerEmail: string | null;
        riotId: string | null;
        submittedAt: Date | null;
        publishOptOut: boolean;
        contentHash: string;
        checkStatus: DeckCheckEntryStatus;
        checkedBy: string | null;
        checkedAt: Date | null;
        notes: string | null;
        changeSummary: string | null;
        withdrawnAt: Date | null;
      }>,
    ): Promise<DeckCheckEntry | undefined> {
      const row = await db
        .updateTable("deckCheckEntries")
        .set(patch)
        .where("id", "=", entryId)
        .returningAll()
        .executeTakeFirst();
      return row ? parseEntryRow(row) : undefined;
    },

    // ── Entry cards ─────────────────────────────────────────────────────────

    listCardsForEntry(entryId: string): Promise<DeckCheckEntryCard[]> {
      return db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entryId)
        .orderBy("sortOrder", "asc")
        .execute();
    },

    /**
     * Replaces an entry's card lines wholesale (re-import semantics).
     * @returns Nothing; old rows are deleted and the new lines inserted.
     */
    async replaceEntryCards(entryId: string, cards: NewDeckCheckEntryCard[]): Promise<void> {
      await db.deleteFrom("deckCheckEntryCards").where("entryId", "=", entryId).execute();
      if (cards.length > 0) {
        await db
          .insertInto("deckCheckEntryCards")
          .values(cards.map((card) => ({ ...card, entryId })))
          .execute();
      }
    },

    /**
     * Rewrites one card line's raw name plus its resolution (the on-site
     * typo fix); zone, quantity, and found ticks stay.
     * @returns False when the row no longer exists.
     */
    async updateCardName(
      entryId: string,
      cardId: string,
      rawName: string,
      resolution: CardResolution,
    ): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckEntryCards")
        .set({
          rawName,
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        })
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    /** Appends one card line after the entry's current highest sort order. */
    async addEntryCard(entryId: string, card: NewDeckCheckEntryCard): Promise<void> {
      await db
        .insertInto("deckCheckEntryCards")
        .values({ ...card, entryId })
        .execute();
    },

    /**
     * Removes one physical copy of a card line: the quantity drops by one and
     * the clicked copy's found tick is spliced out (other ticks keep their
     * cells). Removing the last copy deletes the line.
     * @returns False when the row or copy no longer exists.
     */
    async deleteEntryCardCopy(
      entryId: string,
      cardId: string,
      copyIndex: number,
    ): Promise<boolean> {
      const position = copyIndex + 1;
      const card = await db
        .selectFrom("deckCheckEntryCards")
        .select(["quantity"])
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      if (!card || position > card.quantity) {
        return false;
      }
      if (card.quantity === 1) {
        const result = await db
          .deleteFrom("deckCheckEntryCards")
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .executeTakeFirst();
        return result.numDeletedRows > 0n;
      }
      const result = await sql`
        UPDATE deck_check_entry_cards
           SET quantity = quantity - 1,
               found_copies = (
                 SELECT COALESCE(
                   array_agg(COALESCE(found_copies[gs.i], false) ORDER BY gs.i),
                   '{}'
                 )
                 FROM generate_series(1, quantity) AS gs(i)
                 WHERE gs.i <> ${position}
               )
         WHERE id = ${cardId} AND entry_id = ${entryId} AND ${position} <= quantity
      `.execute(db);
      return (result.numAffectedRows ?? 0n) > 0n;
    },

    /**
     * Stores one physical copy's found tick. Always rewrites the whole array
     * as a dense, 1-based array of exactly `quantity` elements: sparse
     * subscript assignment (`found_copies[2] = true` on `{}`) would create an
     * array with a non-1 lower bound, which the postgres.js driver cannot
     * represent. The rewrite is computed from the row's current value inside
     * one UPDATE, so concurrent judges ticking different copies both land.
     * @returns False when the row no longer exists (replaced by a re-import)
     *   or the copy index is outside the line's quantity.
     */
    async setCardCopyFound(
      entryId: string,
      cardId: string,
      copyIndex: number,
      found: boolean,
    ): Promise<boolean> {
      const position = copyIndex + 1;
      const result = await sql`
        UPDATE deck_check_entry_cards
           SET found_copies = (
             SELECT array_agg(
               CASE
                 WHEN gs.i = ${position} THEN ${found}
                 ELSE COALESCE(found_copies[gs.i], false)
               END
               ORDER BY gs.i
             )
             FROM generate_series(1, quantity) AS gs(i)
           )
         WHERE id = ${cardId} AND entry_id = ${entryId} AND ${position} <= quantity
      `.execute(db);
      return (result.numAffectedRows ?? 0n) > 0n;
    },

    /**
     * Card lines of an event still unmatched or ambiguous, for the re-resolve action.
     * @returns The unresolved card rows across all of the event's entries.
     */
    listUnresolvedCardsForEvent(eventId: string): Promise<DeckCheckEntryCard[]> {
      return db
        .selectFrom("deckCheckEntryCards as c")
        .innerJoin("deckCheckEntries as en", "en.id", "c.entryId")
        .selectAll("c")
        .where("en.eventId", "=", eventId)
        .where("c.matchStatus", "!=", "matched")
        .execute();
    },

    async updateCardResolution(cardId: string, resolution: CardResolution): Promise<void> {
      await db
        .updateTable("deckCheckEntryCards")
        .set({
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        })
        .where("id", "=", cardId)
        .execute();
    },

    // ── Card resolution ─────────────────────────────────────────────────────

    /**
     * Resolves raw card names against the catalog by normalized name (cards
     * plus name aliases). Exactly one candidate is `matched`, several are
     * `ambiguous`, none is `unmatched`. For a match, the canonical printing is
     * picked purely to source a thumbnail.
     *
     * @param inputs Distinct or repeated raw names; resolved in one batch.
     * @returns Resolutions keyed by {@link cardResolutionKey}.
     */
    async resolveCards(inputs: CardResolutionInput[]): Promise<Map<string, CardResolution>> {
      const results = new Map<string, CardResolution>();
      const normNames = [...new Set(inputs.map((input) => cardResolutionKey(input.name)))];
      if (normNames.length === 0) {
        return results;
      }

      const [cardRows, aliasRows] = await Promise.all([
        db
          .selectFrom("cards")
          .select(["id", "normName"])
          .where("normName", "in", normNames)
          .execute(),
        db
          .selectFrom("cardNameAliases")
          .select(["cardId", "normName"])
          .where("normName", "in", normNames)
          .execute(),
      ]);

      const candidatesByNorm = new Map<string, Set<string>>();
      for (const row of cardRows) {
        const set = candidatesByNorm.get(row.normName) ?? new Set();
        set.add(row.id);
        candidatesByNorm.set(row.normName, set);
      }
      for (const row of aliasRows) {
        const set = candidatesByNorm.get(row.normName) ?? new Set();
        set.add(row.cardId);
        candidatesByNorm.set(row.normName, set);
      }

      const allCandidateIds = [
        ...new Set([...candidatesByNorm.values()].flatMap((ids) => [...ids])),
      ];
      const thumbnailByCard = new Map<string, string>();
      if (allCandidateIds.length > 0) {
        const printingRows = await db
          .selectFrom("printingsOrdered")
          .select(["id", "cardId"])
          .where("cardId", "in", allCandidateIds)
          .orderBy("canonicalRank", "asc")
          .execute();
        for (const row of printingRows) {
          if (!thumbnailByCard.has(row.cardId)) {
            thumbnailByCard.set(row.cardId, row.id);
          }
        }
      }

      for (const normName of normNames) {
        const candidates = [...(candidatesByNorm.get(normName) ?? [])];
        const cardId = candidates.length === 1 ? candidates[0] : undefined;
        results.set(
          normName,
          cardId
            ? {
                resolvedCardId: cardId,
                resolvedPrintingId: thumbnailByCard.get(cardId) ?? null,
                matchStatus: "matched",
              }
            : {
                resolvedCardId: null,
                resolvedPrintingId: null,
                matchStatus: candidates.length === 0 ? "unmatched" : "ambiguous",
              },
        );
      }

      return results;
    },

    /**
     * Denormalized card details for building a DeckState from resolved lines.
     * @returns Card details keyed by card id.
     */
    async getCardDetails(cardIds: string[]): Promise<
      Map<
        string,
        {
          id: string;
          name: string;
          type: string;
          superTypes: string[];
          domains: string[];
          tags: string[];
          keywords: string[];
        }
      >
    > {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("cards as c")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "c.id")
        .select([
          "c.id",
          "c.name",
          "c.type",
          "mca.superTypes",
          "mca.domains",
          "c.tags",
          "c.keywords",
        ])
        .where("c.id", "in", cardIds)
        .execute();
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            type: row.type,
            superTypes: row.superTypes ?? [],
            domains: row.domains ?? [],
            tags: row.tags ?? [],
            keywords: row.keywords ?? [],
          },
        ]),
      );
    },

    /**
     * Set slugs of the printings each card appears in, for the allowedSets check.
     * @returns Set slugs keyed by card id.
     */
    async getCardSetSlugs(cardIds: string[]): Promise<Map<string, string[]>> {
      if (cardIds.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "s.slug"])
        .where("p.cardId", "in", cardIds)
        .groupBy(["p.cardId", "s.slug"])
        .execute();
      const bySets = new Map<string, string[]>();
      for (const row of rows) {
        const list = bySets.get(row.cardId) ?? [];
        list.push(row.slug);
        bySets.set(row.cardId, list);
      }
      return bySets;
    },

    // ── Push keys ───────────────────────────────────────────────────────────

    async listKeysForGroup(
      groupId: string,
    ): Promise<(DeckCheckKey & { createdByName: string | null })[]> {
      const rows = await db
        .selectFrom("deckCheckKeys as k")
        .leftJoin("users as u", "u.id", "k.createdBy")
        .selectAll("k")
        .select((eb) => eb.ref("u.name").as("createdByName"))
        .where("k.groupId", "=", groupId)
        .orderBy("k.createdAt", "desc")
        .execute();
      return rows.map((row) => ({ ...row, createdByName: row.createdByName ?? null }));
    },

    createKey(input: {
      groupId: string;
      tokenHash: string;
      tokenPrefix: string;
      label: string | null;
      createdBy: string;
    }): Promise<DeckCheckKey> {
      return db.insertInto("deckCheckKeys").values(input).returningAll().executeTakeFirstOrThrow();
    },

    updateKeyLabel(
      groupId: string,
      keyId: string,
      label: string,
    ): Promise<DeckCheckKey | undefined> {
      return db
        .updateTable("deckCheckKeys")
        .set({ label })
        .where("id", "=", keyId)
        .where("groupId", "=", groupId)
        .returningAll()
        .executeTakeFirst();
    },

    async revokeKey(groupId: string, keyId: string): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckKeys")
        .set({ revokedAt: new Date() })
        .where("id", "=", keyId)
        .where("groupId", "=", groupId)
        .where("revokedAt", "is", null)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    /**
     * Resolves a presented token's hash to its group; revoked keys do not match.
     * @returns The key id and group id, or undefined when no active key matches.
     */
    findActiveKeyByHash(tokenHash: string): Promise<{ id: string; groupId: string } | undefined> {
      return db
        .selectFrom("deckCheckKeys")
        .select(["id", "groupId"])
        .where("tokenHash", "=", tokenHash)
        .where("revokedAt", "is", null)
        .executeTakeFirst();
    },

    async touchKeyUsage(keyId: string): Promise<void> {
      await db
        .updateTable("deckCheckKeys")
        .set({ lastUsedAt: new Date() })
        .where("id", "=", keyId)
        .execute();
    },
  };
}
