import type { DeckCheckMatchStatus } from "@openrift/shared/types/api/deck-check";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { DeckCheckEntryCardsTable } from "../../../db/tables/tournaments.js";

export type DeckCheckEntryCard = Selectable<DeckCheckEntryCardsTable>;

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

/**
 * How one decklist line resolved. Row-shaped, so it lives with the repository
 * that writes it; the resolving itself is
 * `services/deck-check-card-resolution.ts`.
 */
export interface CardResolution {
  resolvedCardId: string | null;
  resolvedPrintingId: string | null;
  matchStatus: DeckCheckMatchStatus;
}

export function deckCheckEntryCardsRepo(db: Kysely<Database>) {
  return {
    listCardsForEntry(entryId: string): Promise<DeckCheckEntryCard[]> {
      return db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entryId)
        .orderBy("sortOrder", "asc")
        .execute();
    },

    async replaceEntryCards(entryId: string, cards: NewDeckCheckEntryCard[]): Promise<void> {
      await db.deleteFrom("deckCheckEntryCards").where("entryId", "=", entryId).execute();
      if (cards.length > 0) {
        await db
          .insertInto("deckCheckEntryCards")
          .values(cards.map((card) => ({ ...card, entryId })))
          .execute();
      }
    },

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

    /**
     * Moves copies of a card line into another zone, renaming and re-resolving
     * the line in the same step. Moving fewer than all copies splits the line,
     * leaving the remainder where it was; copies landing in a zone that already
     * holds the same resolved card merge into that line. A re-zone to the line's
     * current zone is treated as a plain rename, never a split. Found ticks for
     * moved (or newly merged-in) copies reset to unfound.
     */
    moveCardCopies(
      entryId: string,
      cardId: string,
      params: {
        name: string;
        resolution: CardResolution;
        section: string;
        zone: string;
        copies?: number;
      },
    ): Promise<boolean> {
      // FOR UPDATE lock on the source line serializes concurrent splits of the same line.
      // Every read/write below must use trx.
      return db.transaction().execute(async (trx) => {
        const source = await trx
          .selectFrom("deckCheckEntryCards")
          .select(["quantity", "foundCopies", "zone"])
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .forUpdate()
          .executeTakeFirst();
        if (!source) {
          return false;
        }

        const { name, resolution, section, zone } = params;
        const resolutionColumns = {
          rawName: name,
          resolvedCardId: resolution.resolvedCardId,
          resolvedPrintingId: resolution.resolvedPrintingId,
          matchStatus: resolution.matchStatus,
        };

        // Re-zoning to the same zone is just a rename — never split into self.
        if (zone === source.zone) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({ ...resolutionColumns, section })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        const moveCount = Math.min(Math.max(params.copies ?? source.quantity, 1), source.quantity);
        const fullMove = moveCount >= source.quantity;
        // Dense, exact-length found arrays: the driver can't store the sparse,
        // non-1-based arrays raw subscript assignment would produce.
        const denseFound = (found: (boolean | null)[], length: number): boolean[] =>
          Array.from({ length }, (_copy, index) => Boolean(found[index]));
        // Bind the boolean[] as a typed array literal. Passing the raw JS array as
        // a Kysely value makes postgres.js bind it as a scalar boolean, so the
        // assignment fails with "column is of type boolean[] but expression is of
        // type boolean" (42804).
        const foundArray = (values: boolean[]) =>
          sql<boolean[]>`${`{${values.map((value) => (value ? "t" : "f")).join(",")}}`}::bool[]`;

        // A line already holding the same resolved card in the target zone absorbs
        // the move (matches the name+zone identity the content hash uses).
        const mergeTarget =
          resolution.matchStatus === "matched" && resolution.resolvedCardId
            ? await trx
                .selectFrom("deckCheckEntryCards")
                .select(["id", "quantity", "foundCopies"])
                .where("entryId", "=", entryId)
                .where("zone", "=", zone)
                .where("resolvedCardId", "=", resolution.resolvedCardId)
                .where("id", "!=", cardId)
                // Locked like the source line: the quantity is recomputed in
                // JS, so a concurrent merge into the same line must serialize
                // or one merge's copies are lost.
                .forUpdate()
                .executeTakeFirst()
            : undefined;

        if (mergeTarget) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({
              quantity: mergeTarget.quantity + moveCount,
              foundCopies: foundArray([
                ...denseFound(mergeTarget.foundCopies, mergeTarget.quantity),
                ...denseFound([], moveCount),
              ]),
            })
            .where("id", "=", mergeTarget.id)
            .execute();
          if (fullMove) {
            await trx
              .deleteFrom("deckCheckEntryCards")
              .where("id", "=", cardId)
              .where("entryId", "=", entryId)
              .execute();
            return true;
          }
          await trx
            .updateTable("deckCheckEntryCards")
            .set({
              ...resolutionColumns,
              quantity: source.quantity - moveCount,
              foundCopies: foundArray(denseFound(source.foundCopies, source.quantity - moveCount)),
            })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        if (fullMove) {
          await trx
            .updateTable("deckCheckEntryCards")
            .set({ ...resolutionColumns, section, zone })
            .where("id", "=", cardId)
            .where("entryId", "=", entryId)
            .execute();
          return true;
        }

        await trx
          .updateTable("deckCheckEntryCards")
          .set({
            ...resolutionColumns,
            quantity: source.quantity - moveCount,
            foundCopies: foundArray(denseFound(source.foundCopies, source.quantity - moveCount)),
          })
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .execute();
        const last = await trx
          .selectFrom("deckCheckEntryCards")
          .select("sortOrder")
          .where("entryId", "=", entryId)
          .orderBy("sortOrder", "desc")
          .limit(1)
          .executeTakeFirst();
        await trx
          .insertInto("deckCheckEntryCards")
          .values({
            entryId,
            sortOrder: (last?.sortOrder ?? -1) + 1,
            rawName: name,
            section,
            zone,
            quantity: moveCount,
            resolvedCardId: resolution.resolvedCardId,
            resolvedPrintingId: resolution.resolvedPrintingId,
            matchStatus: resolution.matchStatus,
          })
          .execute();
        return true;
      });
    },

    async updateCardZone(
      entryId: string,
      cardId: string,
      section: string,
      zone: string,
    ): Promise<boolean> {
      const result = await db
        .updateTable("deckCheckEntryCards")
        .set({ section, zone })
        .where("id", "=", cardId)
        .where("entryId", "=", entryId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async addEntryCard(entryId: string, card: NewDeckCheckEntryCard): Promise<void> {
      await db
        .insertInto("deckCheckEntryCards")
        .values({ ...card, entryId })
        .execute();
    },

    /**
     * Removes one physical copy of a card line; removing the last copy deletes
     * the line.
     *
     * FOR UPDATE lock on the line, for the same reason as {@link moveCardCopies}:
     * without it, a concurrent decrement can drive quantity to 0 and trip the `quantity > 0` CHECK.
     */
    deleteEntryCardCopy(entryId: string, cardId: string, copyIndex: number): Promise<boolean> {
      const position = copyIndex + 1;
      const run = async (trx: Kysely<Database>): Promise<boolean> => {
        const card = await trx
          .selectFrom("deckCheckEntryCards")
          .select(["quantity"])
          .where("id", "=", cardId)
          .where("entryId", "=", entryId)
          .forUpdate()
          .executeTakeFirst();
        if (!card || position > card.quantity) {
          return false;
        }
        if (card.quantity === 1) {
          const result = await trx
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
        `.execute(trx);
        return (result.numAffectedRows ?? 0n) > 0n;
      };
      return db.isTransaction ? run(db) : db.transaction().execute(run);
    },

    /**
     * Stores one physical copy's found tick. Always rewrites the whole array
     * as a dense, 1-based array of exactly `quantity` elements: sparse
     * subscript assignment (`found_copies[2] = true` on `{}`) would create an
     * array with a non-1 lower bound, which the postgres.js driver cannot
     * represent. The rewrite is computed from the row's current value inside
     * one UPDATE, so concurrent judges ticking different copies both land.
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
     * Marks every physical copy of every card line in an entry as found, when
     * a judge marks the list checked: concluding the check implies the whole
     * list was verified, so the found ticks are filled to match.
     */
    async markAllCopiesFound(entryId: string): Promise<void> {
      await sql`
        UPDATE deck_check_entry_cards
           SET found_copies = (
             SELECT array_agg(true ORDER BY gs.i)
             FROM generate_series(1, quantity) AS gs(i)
           )
         WHERE entry_id = ${entryId} AND quantity > 0
      `.execute(db);
    },

    /**
     * Clears every found tick across an entry's card lines, when a judge
     * re-opens a checked list: re-checking starts from a clean slate so a
     * stale auto-fill can't read as a fresh count.
     */
    async clearAllCopiesFound(entryId: string): Promise<void> {
      await db
        .updateTable("deckCheckEntryCards")
        .set({ foundCopies: [] })
        .where("entryId", "=", entryId)
        .execute();
    },

    listUnresolvedCardsForEvent(tournamentId: string): Promise<DeckCheckEntryCard[]> {
      return (
        db
          .selectFrom("deckCheckEntryCards as c")
          .innerJoin("deckCheckEntries as en", "en.id", "c.entryId")
          .selectAll("c")
          .where("en.tournamentId", "=", tournamentId)
          // An editable entry's list is invisible to officials, so the
          // event-wide re-resolve leaves its lines alone too.
          .where("en.state", "!=", "editable")
          .where("c.matchStatus", "!=", "matched")
          .execute()
      );
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
  };
}
