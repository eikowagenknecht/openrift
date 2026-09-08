import type { DeckOddsConfig } from "@openrift/shared/contracts/decks";
import type { DeckFormatConfig, DeckLink } from "@openrift/shared/types/api/deck";
import type { DeckFormat } from "@openrift/shared/types/enums";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { DecksTable } from "../../../db/tables/decks.js";
import {
  findByShareToken,
  selectShareState,
  updateShareRow,
} from "../../../repositories/query-helpers.js";
import { lockFamilies } from "./decks-shared.js";

/**
 * The jsonb columns are required, not optional, so `"links" in updates`
 * distinguishes "clear it" from "leave it alone".
 */
export type DeckUpdateInput = Omit<
  Updateable<DecksTable>,
  "formatConfig" | "oddsConfig" | "links"
> & {
  formatConfig?: DeckFormatConfig | null;
  oddsConfig?: DeckOddsConfig | null;
  links?: DeckLink[];
};

export function decksCoreRepo(db: Kysely<Database>) {
  return {
    async listForUser(
      userId: string,
      options?: { includeArchived?: boolean },
    ): Promise<Selectable<DecksTable>[]> {
      let query = db
        .selectFrom("decks")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy((eb) => eb.fn("lower", ["name"]));
      if (!options?.includeArchived) {
        query = query.where("archivedAt", "is", null);
      }
      return await query.execute();
    },

    /**
     * Archived decks are included on purpose — an archived deck still
     * physically sits in its box.
     */
    listHomeCollectionDecks(
      userId: string,
    ): Promise<{ id: string; name: string; collectionId: string }[]> {
      return db
        .selectFrom("decks")
        .select(["id", "name", "collectionId"])
        .where("userId", "=", userId)
        .where("collectionId", "is not", null)
        .orderBy((eb) => eb.fn("lower", ["name"]))
        .$narrowType<{ collectionId: string }>()
        .execute();
    },

    async getByIdForUser(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      return await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    getIdAndFormat(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<DecksTable>, "id" | "format"> | undefined> {
      return db
        .selectFrom("decks")
        .select(["id", "format"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    exists(id: string, userId: string): Promise<Pick<Selectable<DecksTable>, "id"> | undefined> {
      return db
        .selectFrom("decks")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    async create(values: {
      userId: string;
      name: string;
      description: string | null;
      format: DeckFormat;
      formatConfig: DeckFormatConfig | null;
      isPublic: boolean;
      links?: DeckLink[];
    }): Promise<Selectable<DecksTable>> {
      const { links, ...rest } = values;
      return await db
        .insertInto("decks")
        .values({ ...rest, links: links ?? [] })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(
      id: string,
      userId: string,
      updates: DeckUpdateInput,
    ): Promise<Selectable<DecksTable> | undefined> {
      const { formatConfig, oddsConfig, links, ...rest } = updates;
      const dbUpdates: Updateable<DecksTable> = { ...rest };
      if ("formatConfig" in updates) {
        dbUpdates.formatConfig = formatConfig ?? null;
      }
      if ("oddsConfig" in updates) {
        dbUpdates.oddsConfig = oddsConfig ?? null;
      }
      if ("links" in updates) {
        dbUpdates.links = links ?? [];
      }
      return await db
        .updateTable("decks")
        .set(dbUpdates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Deletes a deck. When the deck belonged to a variant family the family is
     * repaired in the same transaction: a sole survivor reverts to a standalone
     * deck, and a deleted primary hands the flag to the most recently updated
     * survivor. Predecessor pointers detach via the FK.
     */
    deleteByIdForUser(id: string, userId: string): Promise<{ numDeletedRows: bigint }> {
      return db.transaction().execute(async (trx) => {
        // Peek the family without a lock, then lock the whole family in id
        // order (target included). Locking the target row first and the
        // family second would deadlock two concurrent deletes of siblings.
        const peek = await trx
          .selectFrom("decks")
          .select("familyId")
          .where("id", "=", id)
          .where("userId", "=", userId)
          .executeTakeFirst();
        if (!peek) {
          return { numDeletedRows: 0n };
        }
        await lockFamilies(trx, userId, peek.familyId ? [peek.familyId] : []);
        const target = await trx
          .selectFrom("decks")
          .select(["familyId", "isPrimary"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return { numDeletedRows: 0n };
        }
        if (target.familyId && target.familyId !== peek.familyId) {
          // The deck changed families between the peek and the lock.
          await lockFamilies(trx, userId, [target.familyId]);
        }
        // Read the recency order before the delete, not after: the FK detaching
        // the predecessor pointers is an UPDATE, and the updated_at trigger
        // stamps every touched survivor with the same transaction timestamp.
        // Ordering afterwards would therefore be a tie broken at random.
        const survivors = target.familyId
          ? await trx
              .selectFrom("decks")
              .select(["id", "isPrimary"])
              .where("familyId", "=", target.familyId)
              .where("userId", "=", userId)
              .where("id", "!=", id)
              .orderBy("updatedAt", "desc")
              .execute()
          : [];

        await trx.deleteFrom("decks").where("id", "=", id).where("userId", "=", userId).execute();

        const [firstSurvivor] = survivors;
        if (target.familyId && firstSurvivor) {
          if (survivors.length === 1) {
            // A family of one is no family.
            await trx
              .updateTable("decks")
              .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
              .where("id", "=", firstSurvivor.id)
              .execute();
          } else if (target.isPrimary && survivors.length > 1) {
            await trx
              .updateTable("decks")
              .set({ isPrimary: true })
              .where("id", "=", firstSurvivor.id)
              .execute();
          }
        }
        return { numDeletedRows: 1n };
      });
    },

    async cloneDeck(id: string, userId: string): Promise<Selectable<DecksTable> | undefined> {
      const source = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (!source) {
        return undefined;
      }

      return db.transaction().execute(async (trx) => {
        const newDeck = await trx
          .insertInto("decks")
          .values({
            userId,
            name: `${source.name} (Copy)`,
            description: source.description,
            links: source.links,
            format: source.format,
            // Carry format_config so a cloned Custom-Region deck stays locked
            // to the same region without forcing the user to re-pick. The read
            // hands back the parsed object and the write takes it as-is:
            // postgres.js serializes a jsonb parameter itself, so stringifying
            // here would store the JSON text as a jsonb string scalar.
            formatConfig: source.formatConfig,
            isPublic: false,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", id)
          .execute();

        if (sourceCards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(sourceCards.map((card) => ({ deckId: newDeck.id, ...card })))
            .execute();
        }

        return newDeck;
      });
    },

    async setPinned(
      id: string,
      userId: string,
      isPinned: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return await db
        .updateTable("decks")
        .set({ isPinned })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    async setArchived(
      id: string,
      userId: string,
      archived: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return await db
        .updateTable("decks")
        .set({ archivedAt: archived ? sql`now()` : null })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Returns `undefined` only when the deck is missing or not owned by
     * `userId`; an owned-but-unshared deck returns `{ shareToken: null, isPublic: false }`.
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<DecksTable>, "shareToken" | "isPublic"> | undefined> {
      return selectShareState(db, "decks", id, userId);
    },

    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<DecksTable> | undefined> {
      return updateShareRow(db, "decks", id, userId, shareToken, isPublic);
    },

    async findByShareToken(
      shareToken: string,
    ): Promise<
      { deck: Selectable<DecksTable>; ownerName: string | null; ownerEmail: string } | undefined
    > {
      const found = await findByShareToken(db, "decks", shareToken);
      if (!found) {
        return undefined;
      }
      return { deck: found.row, ownerName: found.ownerName, ownerEmail: found.ownerEmail };
    },

    async cloneFromShareToken(
      shareToken: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | undefined> {
      const source = await db
        .selectFrom("decks")
        .selectAll()
        .where("shareToken", "=", shareToken)
        .where("isPublic", "=", true)
        .executeTakeFirst();

      if (!source) {
        return undefined;
      }

      return db.transaction().execute(async (trx) => {
        const newDeck = await trx
          .insertInto("decks")
          .values({
            userId,
            name: `Copy of ${source.name}`,
            description: source.description,
            links: source.links,
            format: source.format,
            formatConfig: source.formatConfig,
            isPublic: false,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", source.id)
          .execute();

        if (sourceCards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(sourceCards.map((card) => ({ deckId: newDeck.id, ...card })))
            .execute();
        }

        return newDeck;
      });
    },
  };
}
