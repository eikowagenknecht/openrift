import type { Kysely, Selectable } from "kysely";

import type { Database, ListsTable } from "../db/index.js";

export interface BundleOwner {
  userId: string;
  displayName: string | null;
  email: string;
  image: string | null;
}

export interface BundleListSummary {
  list: Selectable<ListsTable>;
  entryCount: number;
}

/**
 * Per-user public share bundle: a single opaque token on `users.share_token`
 * that resolves to the owner's `wish` + `trade` lists. See ADR-018.
 *
 * Authorization is implicit: a non-null token means the user has opted into
 * public sharing. The repo never returns rows for users with `share_token IS
 * NULL`, and never surfaces `organize` lists regardless of share state.
 *
 * @returns An object with user-share query methods bound to the given `db`.
 */
export function userSharesRepo(db: Kysely<Database>) {
  return {
    /**
     * Sets (or nulls) the user's share token. Pass a freshly generated token
     * to enable, `null` to revoke. Rotation is a normal write.
     *
     * @returns The new token (or null), or undefined if the user does not
     *   exist.
     */
    async setShareToken(
      userId: string,
      shareToken: string | null,
    ): Promise<{ shareToken: string | null } | undefined> {
      const updated = await db
        .updateTable("users")
        .set({ shareToken })
        .where("id", "=", userId)
        .returning(["shareToken"])
        .executeTakeFirst();
      return updated;
    },

    /** @returns The current share token state for the user, or undefined. */
    getShareToken(userId: string): Promise<{ shareToken: string | null } | undefined> {
      return db
        .selectFrom("users")
        .select("shareToken")
        .where("id", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Resolves a bundle share token to its owner. Returns nothing if the
     * token does not match a user with a non-null `share_token`.
     *
     * @returns Owner profile fields needed by the public bundle page, or
     *   undefined.
     */
    findOwnerByShareToken(shareToken: string): Promise<BundleOwner | undefined> {
      return db
        .selectFrom("users")
        .select((eb) => [
          eb.ref("id").as("userId"),
          eb.ref("name").as("displayName"),
          "email",
          "image",
        ])
        .where("shareToken", "=", shareToken)
        .executeTakeFirst();
    },

    /**
     * Lists in the bundle for the given owner: every `wish` and `trade` list
     * the owner owns, with an entry-count for the index view's badges.
     *
     * @returns Bundle list summaries sorted by intent, then name.
     */
    async listsForOwner(ownerUserId: string): Promise<BundleListSummary[]> {
      const rows = await db
        .selectFrom("lists as l")
        .selectAll("l")
        .select((eb) =>
          eb
            .selectFrom("listEntries")
            .select(eb.cast<number>(eb.fn.countAll(), "integer").as("c"))
            .whereRef("listEntries.listId", "=", "l.id")
            .as("entryCount"),
        )
        .where("l.userId", "=", ownerUserId)
        .where("l.intent", "in", ["wish", "trade"])
        .orderBy("l.intent", "asc")
        .orderBy("l.name", "asc")
        .execute();

      return rows.map((row) => {
        const { entryCount, ...list } = row;
        return { list, entryCount: entryCount ?? 0 };
      });
    },

    /**
     * Resolves a single list in the bundle, scoped to the token's owner and
     * the bundle's intent filter. Used by `/users/share/:token/lists/:listId`
     * to gate per-list reads without requiring the list's own `share_token`.
     *
     * @returns The list row, or undefined if the list does not belong to the
     *   token's owner or has `intent='organize'`.
     */
    findListInBundle(
      shareToken: string,
      listId: string,
    ): Promise<Selectable<ListsTable> | undefined> {
      return db
        .selectFrom("lists as l")
        .innerJoin("users as u", "u.id", "l.userId")
        .selectAll("l")
        .where("u.shareToken", "=", shareToken)
        .where("l.id", "=", listId)
        .where("l.intent", "in", ["wish", "trade"])
        .executeTakeFirst();
    },
  };
}
