import type { Kysely, Selectable } from "kysely";

import type { Database, TierListRow, TierListsTable } from "../db/index.js";
import { findByShareToken, selectShareState, updateShareState } from "./query-helpers.js";

/** A tier list row with its `tiers` jsonb parsed. */
export type TierList = Selectable<TierListsTable>;

/**
 * The email is carried so the route can derive a gravatar hash without a
 * second lookup; it never reaches a response.
 */
export interface SharedTierList {
  tierList: TierList;
  ownerName: string | null;
  ownerEmail: string;
}

/**
 * Rows written before entries carried a printing, kept only so a board saved
 * then still reads back today.
 */
export interface LegacyTierListRow {
  label: string;
  cardIds?: string[];
}

/** A legacy `cardIds` row becomes entries pinned to no printing. */
export function normalizeTiers(tiers: (TierListRow | LegacyTierListRow)[]): TierListRow[] {
  return tiers.map((tier) => {
    if ("cards" in tier && Array.isArray(tier.cards)) {
      return {
        label: tier.label,
        cards: tier.cards.map((card) => ({
          cardId: card.cardId,
          printingId: card.printingId ?? null,
        })),
        // Contract: an absent flag and a false one mean the same thing.
        ...(tier.unranked === true ? { unranked: true } : {}),
      };
    }
    const legacy = (tier as LegacyTierListRow).cardIds ?? [];
    return {
      label: tier.label,
      cards: legacy.map((cardId) => ({ cardId, printingId: null })),
    };
  });
}

/** Called at each query's single exit point; a new query that skips it returns unnormalized legacy tiers. */
function withParsedTiers<Row extends { tiers: TierListRow[] }>(row: Row): Row {
  return { ...row, tiers: normalizeTiers(row.tiers as (TierListRow | LegacyTierListRow)[]) };
}

/**
 * Owner-scoped methods filter on `userId`; a mismatched id returns nothing, not an error.
 * `findByShareToken` is the one unscoped read, gated by `is_public`.
 */
export function tierListsRepo(db: Kysely<Database>) {
  return {
    async listForUser(userId: string): Promise<TierList[]> {
      const rows = await db
        .selectFrom("tierLists")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("updatedAt", "desc")
        .execute();
      return rows.map((row) => withParsedTiers(row));
    },

    async getByIdForUser(id: string, userId: string): Promise<TierList | undefined> {
      const row = await db
        .selectFrom("tierLists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row ? withParsedTiers(row) : undefined;
    },

    async create(
      userId: string,
      values: {
        title: string;
        description: string | null;
        tiers: TierListRow[];
      },
    ): Promise<TierList> {
      const row = await db
        .insertInto("tierLists")
        .values({
          userId,
          title: values.title,
          description: values.description,
          // postgres.js serializes the array for the jsonb parameter; no manual stringify.
          tiers: values.tiers,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return withParsedTiers(row);
    },

    /**
     * `undefined` fields are left alone. Not a no-op guard: the caller only
     * reaches this with at least one field set.
     */
    async update(
      id: string,
      userId: string,
      values: {
        title?: string;
        description?: string | null;
        tiers?: TierListRow[];
      },
    ): Promise<TierList | undefined> {
      const row = await db
        .updateTable("tierLists")
        .set(values)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
      return row ? withParsedTiers(row) : undefined;
    },

    async remove(id: string, userId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("tierLists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /** An owned-but-unshared list reports `{ shareToken: null, isPublic: false }`, not undefined. */
    getShareState(
      id: string,
      userId: string,
    ): Promise<Pick<TierList, "shareToken" | "isPublic"> | undefined> {
      return selectShareState(db, "tierLists", id, userId);
    },

    /**
     * Sets (or clears) the share token and public flag, including the
     * unique-violation surface that `withUniqueShareToken` retries on.
     */
    setShare(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Pick<TierList, "shareToken" | "isPublic"> | undefined> {
      return updateShareState(db, "tierLists", id, userId, shareToken, isPublic);
    },

    /**
     * Resolves a public share token. Requires `is_public` as well as the token,
     * so revoking sharing kills the link even if the token is still on the row.
     */
    async findByShareToken(shareToken: string): Promise<SharedTierList | undefined> {
      const found = await findByShareToken(db, "tierLists", shareToken);
      if (!found) {
        return undefined;
      }
      return {
        tierList: withParsedTiers(found.row),
        ownerName: found.ownerName,
        ownerEmail: found.ownerEmail,
      };
    },
  };
}
