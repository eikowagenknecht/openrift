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
  viaGroups: { id: string; slug: string; name: string }[];
}

/**
 * A token on `users.shareToken` resolves to a filtered view of the owner's
 * `wish`/`trade` lists. Authorization is two-part: the owner's share token,
 * and each list's own token or a friend-group share the viewer belongs to.
 * `organize` lists are never surfaced.
 */
export function userSharesRepo(db: Kysely<Database>) {
  return {
    /** Pass `null` to revoke. */
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

    getShareToken(userId: string): Promise<{ shareToken: string | null } | undefined> {
      return db
        .selectFrom("users")
        .select("shareToken")
        .where("id", "=", userId)
        .executeTakeFirst();
    },

    /** Returns nothing if the token does not match a user with a non-null `shareToken`. */
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

    async listsForOwner(
      ownerUserId: string,
      viewerUserId: string | null,
    ): Promise<BundleListSummary[]> {
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
        .where((eb) => {
          const isPublic = eb("l.shareToken", "is not", null);
          if (viewerUserId === null) {
            return isPublic;
          }
          const viaGroup = eb.exists(
            eb
              .selectFrom("friendGroupListShares as s")
              .innerJoin("friendGroupMembers as m", "m.groupId", "s.groupId")
              .select("s.listId")
              .whereRef("s.listId", "=", "l.id")
              .where("m.userId", "=", viewerUserId),
          );
          return eb.or([isPublic, viaGroup]);
        })
        .orderBy("l.intent", "asc")
        .orderBy("l.name", "asc")
        .execute();

      const lists = rows.map((row) => {
        const { entryCount, ...list } = row;
        return { list, entryCount: entryCount ?? 0 };
      });

      if (viewerUserId === null || lists.length === 0) {
        return lists.map((entry) => ({ ...entry, viaGroups: [] }));
      }

      const listIds = lists.map((entry) => entry.list.id);
      const groupRows = await db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .innerJoin("friendGroupMembers as m", "m.groupId", "s.groupId")
        .select(["s.listId", "g.id as id", "g.slug", "g.name"])
        .where("s.listId", "in", listIds)
        .where("m.userId", "=", viewerUserId)
        .orderBy("g.name", "asc")
        .execute();

      const groupsByListId = Map.groupBy(groupRows, (row) => row.listId);

      return lists.map((entry) => ({
        ...entry,
        viaGroups: (groupsByListId.get(entry.list.id) ?? []).map(({ id, slug, name }) => ({
          id,
          slug,
          name,
        })),
      }));
    },

    /** Used by `/users/share/:token/lists/:listId` to gate per-list reads. */
    findListInBundle(
      shareToken: string,
      listId: string,
      viewerUserId: string | null,
    ): Promise<Selectable<ListsTable> | undefined> {
      return db
        .selectFrom("lists as l")
        .innerJoin("users as u", "u.id", "l.userId")
        .selectAll("l")
        .where("u.shareToken", "=", shareToken)
        .where("l.id", "=", listId)
        .where("l.intent", "in", ["wish", "trade"])
        .where((eb) => {
          const isPublic = eb("l.shareToken", "is not", null);
          if (viewerUserId === null) {
            return isPublic;
          }
          const viaGroup = eb.exists(
            eb
              .selectFrom("friendGroupListShares as s")
              .innerJoin("friendGroupMembers as m", "m.groupId", "s.groupId")
              .select("s.listId")
              .whereRef("s.listId", "=", "l.id")
              .where("m.userId", "=", viewerUserId),
          );
          return eb.or([isPublic, viaGroup]);
        })
        .executeTakeFirst();
    },
  };
}
