import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { CollectionsTable, CopiesTable, Database, FriendGroupRole } from "../db/index.js";

interface CollectionWithCount extends Selectable<CollectionsTable> {
  copyCount: number;
}

/** Collection row enriched with group context and viewer-role flags. */
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
  /** True if viewer is the personal owner OR a group owner/admin. */
  viewerCanAdmin: boolean;
}

/** Subset returned by single-row access lookups; viewerCanAdmin is computed inline. */
export interface CollectionAccess {
  collection: Selectable<CollectionsTable> & {
    groupSlug: string | null;
    groupName: string | null;
    /** Viewer's effective deck-building availability (see {@link AccessibleCollection}). */
    availableForDeckbuilding: boolean;
  };
  viewerRole: FriendGroupRole | null;
  viewerCanAdmin: boolean;
}

/**
 * Queries for user collections.
 *
 * @returns An object with collection query methods bound to the given `db`.
 */
export function collectionsRepo(db: Kysely<Database>) {
  return {
    /** @returns All collections for a user with copy counts, inbox first, then by sort order and name. */
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

    /**
     * Personal collections plus shared collections from every group the user belongs to.
     * Each row carries group context (slug/name) and a `viewerCanAdmin` flag that's true
     * for personal owners and group owner/admin members.
     *
     * @returns Accessible collections ordered: personal first (inbox first), then groups
     * (alphabetical by group name), then by collection sort order / name within each.
     */
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
        .selectAll("c")
        .select([
          sql<number>`(select count(*)::int from copies where copies.collection_id = c.id)`.as(
            "copyCount",
          ),
          "g.slug as groupSlug",
          "g.name as groupName",
          sql<boolean>`coalesce(pref.available, c.group_id is null)`.as("availableForDeckbuilding"),
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

    /** @returns A single collection by ID scoped to a user, or `undefined`. */
    getByIdForUser(id: string, userId: string): Promise<Selectable<CollectionsTable> | undefined> {
      return db
        .selectFrom("collections")
        .selectAll()
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Resolves a collection from the viewer's perspective. The viewer has access if they
     * personally own the collection or are a member of its owning group.
     * @returns The collection plus access flags, or `undefined` if the viewer can't see it.
     */
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
        .selectAll("c")
        .select([
          "g.slug as groupSlug",
          "g.name as groupName",
          "gm.role as viewerRole",
          sql<boolean>`coalesce(pref.available, c.group_id is null)`.as("availableForDeckbuilding"),
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

    /**
     * Subset of the given IDs that the viewer can write copies to (add/move/dispose).
     * Personal collections require ownership; shared collections require membership.
     * @returns IDs the viewer may write copies to; ordering is undefined.
     */
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

    /** @returns The newly created collection row. */
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

    /**
     * @returns The next `sort_order` value to assign to a new personal collection
     * so it lands at the bottom of the user's list instead of stacking onto
     * position 0 with everyone else.
     */
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
     * @returns Nothing.
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

    /** @returns The updated collection row, or `undefined` if not found. */
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
     * @returns The updated row, or `undefined` if the id no longer exists.
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

    /** @returns The target collection's `id` and `name`, or `undefined` if not found. */
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

    /** @returns Whether the collection exists for the given user. */
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

    /** @returns IDs of the given collections that belong to the user. */
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

    /** @returns `id` and `name` for the given collection IDs. */
    listIdAndNameByIds(
      ids: string[],
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name">[]> {
      return db.selectFrom("collections").select(["id", "name"]).where("id", "in", ids).execute();
    },

    /**
     * @returns `id`, `name`, and `groupId` for the given collection IDs.
     * `groupId` is null for personal collections; callers use it to populate a
     * copy's owning-group field (so the client no longer synthesizes it).
     */
    listIdNameGroupByIds(
      ids: string[],
    ): Promise<Pick<Selectable<CollectionsTable>, "id" | "name" | "groupId">[]> {
      return db
        .selectFrom("collections")
        .select(["id", "name", "groupId"])
        .where("id", "in", ids)
        .execute();
    },

    /** @returns Copies in the given collection (id and printingId only). */
    listCopiesInCollection(
      collectionId: string,
    ): Promise<Pick<Selectable<CopiesTable>, "id" | "printingId">[]> {
      return db
        .selectFrom("copies")
        .select(["id", "printingId"])
        .where("collectionId", "=", collectionId)
        .execute();
    },

    /** Moves all copies from one collection to another. */
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

    /** Deletes a collection by ID scoped to a user. */
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
     * Sets (or nulls) the share_token and is_public on a collection, scoped to the owning user.
     * @returns The updated collection row, or `undefined` if not owned by the user.
     */
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
     * Sets (or nulls) the share_token and is_public on a collection without user scoping.
     * Caller must verify admin access first via `getAccessForUser`.
     * @returns The updated collection row, or `undefined` if the id no longer exists.
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
     * Looks up a public collection by its share token. Anonymous — no user scoping.
     * Personal collections expose the owner's display name; shared collections expose
     * the group name in that slot (the share page treats it as an "owner" label).
     * @returns The collection row plus owner label, or `undefined`.
     */
    async findByShareToken(shareToken: string): Promise<
      | {
          collection: Selectable<CollectionsTable>;
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

    /**
     * Lists the shared collections owned by the given group, with copy counts.
     * @returns Collections belonging to the group, ordered by sort_order then name.
     */
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

    /**
     * Ensures the user has an inbox collection. Creates one if it doesn't exist,
     * handling race conditions via `ON CONFLICT DO NOTHING`.
     * @returns The inbox collection ID
     */
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

      // Insert was a no-op (inbox already exists) — fetch it
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
