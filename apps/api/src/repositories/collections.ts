import type { FriendGroupRole } from "@openrift/shared";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { CollectionsTable, CopiesTable, Database } from "../db/index.js";

interface CollectionWithCount extends Selectable<CollectionsTable> {
  copyCount: number;
}

export interface AccessibleCollection extends CollectionWithCount {
  groupSlug: string | null;
  groupName: string | null;
  /**
   * The viewer's effective deck-building availability for this collection:
   * `COALESCE(pref.available, group_id IS NULL)`. Per-viewer, not a property
   * of the collection — personal collections default on, group collections
   * are opt-in per member.
   */
  availableForDeckbuilding: boolean;
  /**
   * Whether the viewer has pushed this collection behind the sidebar's "Show
   * more" toggle. Per-viewer like the deck-building flag, so hiding a shared
   * group binder only affects the member who hid it.
   */
  sidebarHidden: boolean;
  /** True if viewer is the personal owner OR a group owner/admin. */
  viewerCanAdmin: boolean;
}

export interface CollectionAccess {
  collection: Selectable<CollectionsTable> & {
    groupSlug: string | null;
    groupName: string | null;
    /** Viewer's effective deck-building availability (see {@link AccessibleCollection}). */
    availableForDeckbuilding: boolean;
    /** Viewer's sidebar visibility choice (see {@link AccessibleCollection}). */
    sidebarHidden: boolean;
  };
  viewerRole: FriendGroupRole | null;
  viewerCanAdmin: boolean;
}

export function collectionsRepo(db: Kysely<Database>) {
  return {
    listForUser(userId: string): Promise<CollectionWithCount[]> {
      return db
        .selectFrom("collections")
        .selectAll("collections")
        .select(
          sql<number>`(select count(*)::int from copies where copies.collection_id = collections.id)`.as(
            "copyCount",
          ),
        )
        .where("userId", "=", userId)
        .orderBy("isInbox", "desc")
        .orderBy("sortOrder")
        .orderBy("name")
        .execute();
    },

    listAccessibleForUser(userId: string): Promise<AccessibleCollection[]> {
      return db
        .selectFrom("collections as c")
        .leftJoin("friendGroups as g", "g.id", "c.groupId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "c.groupId").on("gm.userId", "=", userId),
        )
        .leftJoin("collectionDeckbuildingPrefs as pref", (join) =>
          join.onRef("pref.collectionId", "=", "c.id").on("pref.userId", "=", userId),
        )
        .leftJoin("collectionSidebarPrefs as sidebar", (join) =>
          join.onRef("sidebar.collectionId", "=", "c.id").on("sidebar.userId", "=", userId),
        )
        .selectAll("c")
        .select([
          sql<number>`(select count(*)::int from copies where copies.collection_id = c.id)`.as(
            "copyCount",
          ),
          "g.slug as groupSlug",
          "g.name as groupName",
          sql<boolean>`coalesce(pref.available, c.group_id is null)`.as("availableForDeckbuilding"),
          sql<boolean>`coalesce(sidebar.hidden, false)`.as("sidebarHidden"),
          sql<boolean>`(c.user_id IS NOT NULL) OR (gm.role IN ('owner','admin'))`.as(
            "viewerCanAdmin",
          ),
        ])
        .where((eb) => eb.or([eb("c.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .orderBy(sql`c.group_id IS NULL`, "desc")
        .orderBy("g.name")
        .orderBy("c.isInbox", "desc")
        .orderBy("c.sortOrder")
        .orderBy("c.name")
        .execute();
    },

    getByIdForUser(id: string, userId: string): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    async getAccessForUser(id: string, userId: string): Promise<CollectionAccess | undefined> {
      const row = await db
        .selectFrom("collections as c")
        .leftJoin("friendGroups as g", "g.id", "c.groupId")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "c.groupId").on("gm.userId", "=", userId),
        )
        .leftJoin("collectionDeckbuildingPrefs as pref", (join) =>
          join.onRef("pref.collectionId", "=", "c.id").on("pref.userId", "=", userId),
        )
        .leftJoin("collectionSidebarPrefs as sidebar", (join) =>
          join.onRef("sidebar.collectionId", "=", "c.id").on("sidebar.userId", "=", userId),
        )
        .selectAll("c")
        .select([
          "g.slug as groupSlug",
          "g.name as groupName",
          "gm.role as viewerRole",
          sql<boolean>`coalesce(pref.available, c.group_id is null)`.as("availableForDeckbuilding"),
          sql<boolean>`coalesce(sidebar.hidden, false)`.as("sidebarHidden"),
        ])
        .where("c.id", "=", id)
        .where((eb) => eb.or([eb("c.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const { groupSlug, groupName, viewerRole, ...collection } = row;
      const isPersonalOwner = collection.userId === userId;
      const viewerCanAdmin = isPersonalOwner || viewerRole === "owner" || viewerRole === "admin";

      return {
        collection: { ...collection, groupSlug, groupName },
        viewerRole: viewerRole as FriendGroupRole | null,
        viewerCanAdmin,
      };
    },

    async filterWritableByViewer(ids: readonly string[], userId: string): Promise<string[]> {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("collections as c")
        .leftJoin("friendGroupMembers as gm", (join) =>
          join.onRef("gm.groupId", "=", "c.groupId").on("gm.userId", "=", userId),
        )
        .select("c.id")
        .where("c.id", "in", ids as string[])
        .where((eb) => eb.or([eb("c.userId", "=", userId), eb("gm.userId", "=", userId)]))
        .execute();
      return rows.map((row) => row.id);
    },

    create(values: {
      userId: string | null;
      groupId: string | null;
      name: string;
      description: string | null;
      isInbox: boolean;
      sortOrder: number;
    }): Promise<Selectable<CollectionsTable>> {
      return db.insertInto("collections").values(values).returningAll().executeTakeFirstOrThrow();
    },

    async nextPersonalSortOrder(userId: string): Promise<number> {
      const row = await db
        .selectFrom("collections")
        .select(sql<number>`coalesce(max(sort_order) + 1, 0)`.as("next"))
        .where("userId", "=", userId)
        .where("groupId", "is", null)
        .executeTakeFirst();
      return row?.next ?? 0;
    },

    /**
     * Re-numbers `sort_order` for the user's personal collections to match
     * `orderedIds`, in a single statement. Group-owned collections are not
     * reorderable and are silently ignored if present in `orderedIds`. The
     * inbox is treated like any other personal collection — the repo doesn't
     * pin it; that's the UI's job.
     */
    async reorderPersonal(userId: string, orderedIds: readonly string[]): Promise<void> {
      if (orderedIds.length === 0) {
        return;
      }
      const ids = [...orderedIds];
      await sql`
        update collections
        set sort_order = ranked.new_order
        from (
          select id, ord::int - 1 as new_order
          from unnest(${ids}::uuid[]) with ordinality as t(id, ord)
        ) as ranked
        where collections.id = ranked.id
          and collections.user_id = ${userId}
          and collections.group_id is null
      `.execute(db);
    },

    update(
      id: string,
      userId: string,
      updates: Updateable<CollectionsTable>,
    ): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .updateTable("collections")
        .set(updates)
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Updates a collection by id without user scoping. Caller is responsible for
     * verifying admin access first via `getAccessForUser`.
     */
    updateById(
      id: string,
      updates: Updateable<CollectionsTable>,
    ): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .updateTable("collections")
        .set(updates)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    getIdAndName(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name"> | undefined> {
      return db
        .selectFrom("collections")
        .select(["id", "name"])
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    exists(
      id: string,
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id"> | undefined> {
      return db
        .selectFrom("collections")
        .select("id")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    listIdsByIdsForUser(
      ids: string[],
      userId: string,
    ): Promise<Pick<Selectable<CollectionsTable>, "id">[]> {
      return db
        .selectFrom("collections")
        .select("id")
        .where("id", "in", ids)
        .where("userId", "=", userId)
        .execute();
    },

    listIdAndNameByIds(
      ids: string[],
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name">[]> {
      return db.selectFrom("collections").select(["id", "name"]).where("id", "in", ids).execute();
    },

    listIdNameGroupByIds(
      ids: string[],
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name" | "groupId">[]> {
      return db
        .selectFrom("collections")
        .select(["id", "name", "groupId"])
        .where("id", "in", ids)
        .execute();
    },

    listCopiesInCollection(
      collectionId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id" | "printingId">[]> {
      return db
        .selectFrom("copies")
        .select(["id", "printingId"])
        .where("collectionId", "=", collectionId)
        .execute();
    },

    async moveCopiesBetweenCollections(
      fromCollectionId: string,
      toCollectionId: string,
    ): Promise<void> {
      await db
        .updateTable("copies")
        .set({ collectionId: toCollectionId })
        .where("collectionId", "=", fromCollectionId)
        .execute();
    },

    async deleteByIdForUser(id: string, userId: string): Promise<void> {
      await db
        .deleteFrom("collections")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Deletes a collection by id without user scoping. Caller must verify admin
     * access first via `getAccessForUser`.
     */
    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("collections").where("id", "=", id).execute();
    },

    /**
     * Deletes every personal collection of the user except the inbox. The
     * collections must already be empty — a DB trigger rejects deleting a
     * collection that still has copies.
     */
    async deleteAllPersonalExceptInbox(userId: string): Promise<number> {
      const result = await db
        .deleteFrom("collections")
        .where("userId", "=", userId)
        .where("isInbox", "=", false)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    setShareToken(
      id: string,
      userId: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .updateTable("collections")
        .set({ shareToken, isPublic, updatedAt: sql`now()` })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * No user scoping. Caller must verify admin access first via
     * `getAccessForUser`.
     */
    setShareTokenById(
      id: string,
      shareToken: string | null,
      isPublic: boolean,
    ): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .updateTable("collections")
        .set({ shareToken, isPublic, updatedAt: sql`now()` })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * Anonymous — no user scoping. Personal collections expose the owner's
     * display name; shared collections expose the group name in that slot (the
     * share page treats it as an "owner" label).
     */
    async findByShareToken(shareToken: string): Promise<
      | {
          collection: CollectionWithCount;
          ownerName: string | null;
          // Null for group-owned collections (a group has no email/gravatar).
          ownerEmail: string | null;
        }
      | undefined
    > {
      const row = await db
        .selectFrom("collections as c")
        .leftJoin("users as u", "u.id", "c.userId")
        .leftJoin("friendGroups as g", "g.id", "c.groupId")
        .selectAll("c")
        .select([
          sql<string | null>`coalesce(u.name, g.name)`.as("ownerName"),
          "u.email as ownerEmail",
          // Real copy count for the public response and the share-image cache
          // version (copies changing does not bump collections.updated_at, so
          // the og:image URL keys on updated_at + this count to stay fresh).
          sql<number>`(select count(*)::int from copies where copies.collection_id = c.id)`.as(
            "copyCount",
          ),
        ])
        .where("c.shareToken", "=", shareToken)
        .where("c.isPublic", "=", true)
        .executeTakeFirst();

      if (!row) {
        return undefined;
      }

      const { ownerName, ownerEmail, ...collection } = row;
      return { collection, ownerName, ownerEmail };
    },

    listForGroup(groupId: string): Promise<CollectionWithCount[]> {
      return db
        .selectFrom("collections")
        .selectAll("collections")
        .select(
          sql<number>`(select count(*)::int from copies where copies.collection_id = collections.id)`.as(
            "copyCount",
          ),
        )
        .where("groupId", "=", groupId)
        .orderBy("sortOrder")
        .orderBy("name")
        .execute();
    },

    async ensureInbox(userId: string): Promise<string> {
      const result = await db
        .insertInto("collections")
        .values({
          userId,
          groupId: null,
          name: "Inbox",
          isInbox: true,
          sortOrder: 0,
        })
        .onConflict((oc) => oc.doNothing())
        .returning("id")
        .executeTakeFirst();

      if (result) {
        return result.id;
      }

      const row = await db
        .selectFrom("collections")
        .select("id")
        .where("userId", "=", userId)
        .where("isInbox", "=", true)
        .executeTakeFirstOrThrow();

      return row.id;
    },
  };
}
