import type { Kysely, Selectable } from "kysely";

import { parseJsonbRequired } from "../db/helpers.js";
import type { Database, TierListRow, TierListsTable } from "../db/index.js";

/** A tier list row with its `tiers` jsonb parsed. */
export type TierList = Selectable<TierListsTable>;

/**
 * A shared tier list plus its owner's identity, for the public share view. The
 * email is carried so the route can derive a gravatar hash without a second
 * lookup; it never reaches a response.
 */
export interface SharedTierList {
  tierList: TierList;
  ownerName: string | null;
  ownerEmail: string;
}

/**
 * postgres.js under Bun hands jsonb back as a raw JSON string even though the
 * Kysely row type claims the parsed shape, so every read of a `tier_lists` row
 * goes through this. Applied at the single exit point of each query rather than
 * at call sites, so a new query cannot forget it.
 * @returns The row with `tiers` guaranteed parsed.
 */
function withParsedTiers<Row extends { tiers: TierListRow[] }>(row: Row): Row {
  return { ...row, tiers: parseJsonbRequired<TierListRow[]>(row.tiers) };
}

/**
 * Queries for creator-authored tier lists (migration 237).
 *
 * Every owner-scoped method takes `userId` and filters on it, so an id
 * belonging to someone else matches nothing rather than erroring — the routes
 * carry no separate ownership pre-check. `findByShareToken` is the one
 * unscoped read, and it additionally requires `is_public`.
 * @returns An object with tier-list query methods bound to the given `db`.
 */
export function tierListsRepo(db: Kysely<Database>) {
  return {
    /** @returns The user's tier lists, most recently edited first. */
    async listForUser(userId: string): Promise<TierList[]> {
      const rows = await db
        .selectFrom("tierLists")
        .selectAll()
        .where("userId", "=", userId)
        .orderBy("updatedAt", "desc")
        .execute();
      return rows.map((row) => withParsedTiers(row));
    },

    /** @returns The list, or `undefined` when it isn't the caller's. */
    async getByIdForUser(id: string, userId: string): Promise<TierList | undefined> {
      const row = await db
        .selectFrom("tierLists")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row ? withParsedTiers(row) : undefined;
    },

    /** @returns The newly created tier list. */
    async create(
      userId: string,
      values: {
        title: string;
        description: string | null;
        setId: string | null;
        tiers: TierListRow[];
      },
    ): Promise<TierList> {
      const row = await db
        .insertInto("tierLists")
        .values({
          userId,
          title: values.title,
          description: values.description,
          setId: values.setId,
          // Kysely types the column as the parsed shape; postgres.js serializes
          // the array for the jsonb parameter, so no manual stringify here.
          tiers: values.tiers,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return withParsedTiers(row);
    },

    /**
     * Applies a partial edit. `undefined` fields are left alone, so the builder
     * can save the board without restating the title. Not a no-op guard: the
     * caller only reaches this with at least one field set.
     * @returns The updated list, or `undefined` when it isn't the caller's.
     */
    async update(
      id: string,
      userId: string,
      values: {
        title?: string;
        description?: string | null;
        setId?: string | null;
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

    /** @returns True if a list was deleted. */
    async remove(id: string, userId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("tierLists")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * @returns `{ shareToken, isPublic }` for an owned list, else `undefined`.
     * An owned-but-unshared list reports `{ shareToken: null, isPublic: false }`
     * rather than being indistinguishable from a missing one.
     */
    getShareState(
      id: string,
      userId: string,
    ): Promise<Pick<TierList, "shareToken" | "isPublic"> | undefined> {
      return db
        .selectFrom("tierLists")
        .select(["shareToken", "isPublic"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Sets (or clears) the share token and public flag. Mirrors the deck and
     * list repos, including the unique-violation surface that
     * `withUniqueShareToken` retries on.
     * @returns The new share state, or `undefined` when the list isn't the caller's.
     */
    setShare(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Pick<TierList, "shareToken" | "isPublic"> | undefined> {
      return db
        .updateTable("tierLists")
        .set({ shareToken, isPublic })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returning(["shareToken", "isPublic"])
        .executeTakeFirst();
    },

    /**
     * Resolves a public share token. Requires `is_public` as well as the token,
     * so revoking sharing kills the link even if the token is still on the row.
     * @returns The list and its owner's name, or `undefined`.
     */
    async findByShareToken(shareToken: string): Promise<SharedTierList | undefined> {
      const row = await db
        .selectFrom("tierLists as t")
        .innerJoin("users as u", "u.id", "t.userId")
        .selectAll("t")
        .select(["u.name as ownerName", "u.email as ownerEmail"])
        .where("t.shareToken", "=", shareToken)
        .where("t.isPublic", "=", true)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }
      const { ownerName, ownerEmail, ...tierList } = row;
      return { tierList: withParsedTiers(tierList), ownerName, ownerEmail };
    },
  };
}
