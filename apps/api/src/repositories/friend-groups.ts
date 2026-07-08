import type { ContactMethod } from "@openrift/shared";
import { sql } from "kysely";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";

import type {
  Database,
  FriendGroupCollectionSharesTable,
  FriendGroupInviteDirection,
  FriendGroupInvitesTable,
  FriendGroupListSharesTable,
  FriendGroupMembersTable,
  FriendGroupRole,
  FriendGroupsTable,
} from "../db/index.js";

export type Group = Selectable<FriendGroupsTable>;
export type GroupMember = Selectable<FriendGroupMembersTable>;
export type GroupInvite = Selectable<FriendGroupInvitesTable>;
export type GroupShare = Selectable<FriendGroupListSharesTable>;
export type GroupCollectionShare = Selectable<FriendGroupCollectionSharesTable>;

export type NewGroupValues = Pick<
  Insertable<FriendGroupsTable>,
  "slug" | "name" | "description" | "code"
>;

export type GroupUpdate = Pick<
  Updateable<FriendGroupsTable>,
  "slug" | "previousSlug" | "name" | "description" | "updatedAt"
>;

/** Joined member row used by the roster UI — adds the user's public profile. */
export interface MemberWithUser extends GroupMember {
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

/** Summary row for the `/groups` index — role of the viewer + a member-count. */
export interface GroupSummary extends Group {
  viewerRole: FriendGroupRole;
  memberCount: number;
  pendingRequestCount: number;
}

/**
 * Friend groups, members, invites, and list-shares. The match query joins
 * across these via {@link friendGroupMatchesRepo} in `friend-group-matches.ts`.
 *
 * Authorization is the caller's job: routes pull the viewer's role via
 * `getMembership` and gate writes against {@link FriendGroupRole}. The repo
 * itself is naïve.
 *
 * @returns An object with friend-group query methods bound to the given `db`.
 */
export function friendGroupsRepo(db: Kysely<Database>) {
  return {
    // ── Groups ─────────────────────────────────────────────────────────────
    /** @returns The group row, or `undefined` if no group has that id. */
    getById(id: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns The group row, or `undefined` if no group has that slug. */
    getBySlug(slug: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    /**
     * Viewer-facing slug lookup: exact slug first, then the rename alias
     * (`previous_slug`), so bookmarks and in-flight trade emails survive a
     * rename. A current slug always beats another group's stale alias; on the
     * rare alias collision the most recently updated group wins. Keep the
     * exact `getBySlug` for uniqueness/conflict checks.
     * @returns The matched group row, or `undefined`.
     */
    async getBySlugOrPrevious(slug: string): Promise<Group | undefined> {
      const current = await db
        .selectFrom("friendGroups")
        .selectAll()
        .where("slug", "=", slug)
        .executeTakeFirst();
      if (current) {
        return current;
      }
      return db
        .selectFrom("friendGroups")
        .selectAll()
        .where("previousSlug", "=", slug)
        .orderBy("updatedAt", "desc")
        .executeTakeFirst();
    },

    /** @returns The group row matched by its join code, or `undefined`. */
    getByCode(code: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("code", "=", code).executeTakeFirst();
    },

    /**
     * Atomic create — inserts the group and the owner's membership in one
     * transaction so the partial-unique-owner invariant always holds.
     * @returns The created group row.
     */
    createWithOwner(values: NewGroupValues, ownerUserId: string): Promise<Group> {
      return db.transaction().execute(async (trx) => {
        const group = await trx
          .insertInto("friendGroups")
          .values(values)
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .insertInto("friendGroupMembers")
          .values({ groupId: group.id, userId: ownerUserId, role: "owner" })
          .execute();

        return group;
      });
    },

    /** @returns The updated row, or `undefined` if the group was not found. */
    update(id: string, patch: GroupUpdate): Promise<Group | undefined> {
      return db
        .updateTable("friendGroups")
        .set(patch)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    /** Owner-only. The trigger on members handles successor promotion. */
    async deleteById(id: string): Promise<void> {
      await db.deleteFrom("friendGroups").where("id", "=", id).execute();
    },

    /**
     * Sets the join code. `null` disables code-based joining (admins must
     * issue direct invites). Bumps `code_rotated_at` regardless of whether
     * we're rotating or disabling — the column tracks "when did the current
     * value start applying".
     * @returns The updated row, or `undefined` if the group was not found.
     */
    setCode(id: string, code: string | null): Promise<Group | undefined> {
      return db
        .updateTable("friendGroups")
        .set({ code, codeRotatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    // ── Membership ─────────────────────────────────────────────────────────
    /** @returns The membership row, or `undefined` if the user is not a member. */
    getMembership(groupId: string, userId: string): Promise<GroupMember | undefined> {
      return db
        .selectFrom("friendGroupMembers")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * @returns The roster joined with each user's profile. Sorted by role
     *   (owner → admin → member) and then by name (case-insensitive, NULL
     *   names last), with `joined_at` as a final tiebreaker, so the owner is
     *   always at the top.
     */
    listMembers(groupId: string): Promise<MemberWithUser[]> {
      return (
        db
          .selectFrom("friendGroupMembers as m")
          .innerJoin("users as u", "u.id", "m.userId")
          .selectAll("m")
          .select(["u.name as userName", "u.email as userEmail", "u.image as userImage"])
          .where("m.groupId", "=", groupId)
          // oxlint-disable promise/prefer-await-to-then -- Kysely's case().when().then() is not a Promise chain
          .orderBy(
            (eb) => eb.case("m.role").when("owner").then(0).when("admin").then(1).else(2).end(),
            "asc",
          )
          // oxlint-enable promise/prefer-await-to-then
          .orderBy(sql`lower(u.name)`, "asc")
          .orderBy("m.joinedAt", "asc")
          .execute()
      );
    },

    /**
     * Groups the viewer is in, with member counts and (for admins/owners) a
     * pending-request count per group. The request count is `0` for plain
     * members so the UI can render the same row shape regardless of role.
     * @returns Group summary rows for the index page.
     */
    async listGroupsForUser(userId: string): Promise<GroupSummary[]> {
      const rows = await db
        .selectFrom("friendGroupMembers as m")
        .innerJoin("friendGroups as g", "g.id", "m.groupId")
        .selectAll("g")
        .select((eb) => [
          eb.ref("m.role").as("viewerRole"),
          eb
            .selectFrom("friendGroupMembers as mc")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("mc.groupId", "=", "g.id")
            .as("memberCount"),
          eb
            .case()
            .when(eb.ref("m.role"), "in", ["owner", "admin"])
            .then(
              eb
                .selectFrom("friendGroupInvites as i")
                .select(eb.fn.countAll<number>().as("count"))
                .whereRef("i.groupId", "=", "g.id")
                .where("i.direction", "=", "request"),
            )
            .else(0)
            .end()
            .as("pendingRequestCount"),
        ])
        .where("m.userId", "=", userId)
        .orderBy("g.name", "asc")
        .execute();

      // Sub-selects come back typed as `number | null`; coerce to plain numbers
      // for the consumer.
      return rows.map((row) => ({
        ...row,
        memberCount: Number(row.memberCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
      }));
    },

    /** Idempotent member insert (DO NOTHING on existing row). */
    async addMember(groupId: string, userId: string, role: FriendGroupRole): Promise<void> {
      await db
        .insertInto("friendGroupMembers")
        .values({ groupId, userId, role })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .execute();
    },

    /** Drops the membership; the FK cascade removes shares for that group. */
    async removeMember(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupMembers")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Updates the role for a single member. Does not touch the owner — use
     * `transferOwnership` for owner changes (the partial unique index would
     * reject two owners anyway).
     * @returns The updated row, or `undefined` if no membership matched.
     */
    updateRole(
      groupId: string,
      userId: string,
      role: FriendGroupRole,
    ): Promise<GroupMember | undefined> {
      return db
        .updateTable("friendGroupMembers")
        .set({ role })
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .returningAll()
        .executeTakeFirst();
    },

    /**
     * The contact methods every member has revealed to this group, keyed by
     * userId and ordered by the owner's `sort_order`. Members with no revealed
     * methods are simply absent from the map.
     * @returns A map of userId → the revealed {@link ContactMethod}s.
     */
    async getRevealedContactsForMembers(groupId: string): Promise<Map<string, ContactMethod[]>> {
      const rows = await db
        .selectFrom("friendGroupMemberContacts as fgmc")
        .innerJoin("userContactMethods as ucm", "ucm.id", "fgmc.contactMethodId")
        .select(["fgmc.userId as userId", "ucm.id as id", "ucm.type as type", "ucm.value as value"])
        .where("fgmc.groupId", "=", groupId)
        .orderBy("ucm.sortOrder", "asc")
        .orderBy("ucm.id", "asc")
        .execute();

      const byUser = new Map<string, ContactMethod[]>();
      for (const row of rows) {
        const list = byUser.get(row.userId) ?? [];
        list.push({ id: row.id, type: row.type, value: row.value });
        byUser.set(row.userId, list);
      }
      return byUser;
    },

    /**
     * Replaces the set of contact methods a member reveals to a group. Only ids
     * the member actually owns are accepted (others are silently dropped), so a
     * caller can't reveal someone else's method.
     */
    async setRevealedContacts(
      groupId: string,
      userId: string,
      contactMethodIds: string[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("friendGroupMemberContacts")
          .where("groupId", "=", groupId)
          .where("userId", "=", userId)
          .execute();

        if (contactMethodIds.length === 0) {
          return;
        }

        // Keep only ids this user owns — guards against revealing another
        // member's method by id.
        const owned = await trx
          .selectFrom("userContactMethods")
          .select("id")
          .where("userId", "=", userId)
          .where("id", "in", contactMethodIds)
          .execute();
        if (owned.length === 0) {
          return;
        }

        await trx
          .insertInto("friendGroupMemberContacts")
          .values(owned.map((row) => ({ groupId, userId, contactMethodId: row.id })))
          .execute();
      });
    },

    /**
     * Atomic ownership transfer. Demotes the outgoing owner to `admin` and
     * promotes the target to `owner`, in one transaction. The partial unique
     * index (`uq_friend_group_one_owner`) would otherwise reject a naive
     * "promote then demote" because it'd briefly see two owners; we order
     * demote → promote and rely on the transaction.
     */
    async transferOwnership(groupId: string, fromUserId: string, toUserId: string): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("friendGroupMembers")
          .set({ role: "admin" })
          .where("groupId", "=", groupId)
          .where("userId", "=", fromUserId)
          .where("role", "=", "owner")
          .execute();

        await trx
          .updateTable("friendGroupMembers")
          .set({ role: "owner" })
          .where("groupId", "=", groupId)
          .where("userId", "=", toUserId)
          .execute();
      });
    },

    // ── Invites & requests ─────────────────────────────────────────────────
    /** @returns The pending invite/request for this (group, user), or `undefined`. */
    getInvite(groupId: string, userId: string): Promise<GroupInvite | undefined> {
      return db
        .selectFrom("friendGroupInvites")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Invites addressed to a user (direction='invite') — for the avatar-menu
     * badge and the pinned section at the top of /groups.
     * @returns Invite rows joined with the group's name/slug.
     */
    listInvitesForUser(
      userId: string,
    ): Promise<(GroupInvite & { groupName: string; groupSlug: string })[]> {
      return db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("friendGroups as g", "g.id", "i.groupId")
        .selectAll("i")
        .select(["g.name as groupName", "g.slug as groupSlug"])
        .where("i.userId", "=", userId)
        .where("i.direction", "=", "invite")
        .orderBy("i.createdAt", "asc")
        .execute();
    },

    /**
     * Join requests a user has sent (direction='request') that are still
     * awaiting approval — for the "Awaiting approval" section on /groups, so the
     * requester can find and cancel their own pending request.
     * @returns Request rows joined with the group's name/slug.
     */
    listOwnRequestsForUser(
      userId: string,
    ): Promise<(GroupInvite & { groupName: string; groupSlug: string })[]> {
      return db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("friendGroups as g", "g.id", "i.groupId")
        .selectAll("i")
        .select(["g.name as groupName", "g.slug as groupSlug"])
        .where("i.userId", "=", userId)
        .where("i.direction", "=", "request")
        .orderBy("i.createdAt", "asc")
        .execute();
    },

    /**
     * Join requests (direction='request') queued against a group — for the
     * admin-only requests list.
     * @returns Request rows joined with the requester's profile.
     */
    listRequestsForGroup(groupId: string): Promise<
      (GroupInvite & {
        userName: string | null;
        userEmail: string;
        userImage: string | null;
      })[]
    > {
      return db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("users as u", "u.id", "i.userId")
        .selectAll("i")
        .select(["u.name as userName", "u.email as userEmail", "u.image as userImage"])
        .where("i.groupId", "=", groupId)
        .where("i.direction", "=", "request")
        .orderBy("i.createdAt", "asc")
        .execute();
    },

    /** @returns The avatar-menu badge count: pending invites for this user. */
    async pendingInvitesCountForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("friendGroupInvites")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("userId", "=", userId)
        .where("direction", "=", "invite")
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /**
     * @returns Total pending join requests across every group the user owns or
     * administers (the requests awaiting their approval). Mirrors the per-group
     * `pendingRequestCount` surfaced by {@link listGroupsForUser}.
     */
    async pendingRequestsCountForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("friendGroupInvites as i")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("i.direction", "=", "request")
        .where("i.groupId", "in", (eb) =>
          eb
            .selectFrom("friendGroupMembers as m")
            .select("m.groupId")
            .where("m.userId", "=", userId)
            .where("m.role", "in", ["owner", "admin"]),
        )
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /**
     * Creates an invite/request row. UNIQUE(group_id, user_id) means there's
     * at most one row per (group, user); ON CONFLICT DO NOTHING swallows
     * duplicate clicks without erroring.
     */
    async createInvite(
      groupId: string,
      userId: string,
      direction: FriendGroupInviteDirection,
    ): Promise<void> {
      await db
        .insertInto("friendGroupInvites")
        .values({ groupId, userId, direction })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .execute();
    },

    /** Hard-deletes the invite/request row. */
    async deleteInvite(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupInvites")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },

    // ── List shares ────────────────────────────────────────────────────────
    /**
     * All list-shares in a group, joined with each list's owner + metadata.
     * Used by the match query and by the member-detail page.
     * @returns Share rows enriched with list and user info.
     */
    listSharesForGroup(groupId: string): Promise<
      (GroupShare & {
        listName: string;
        listIntent: string;
        listKind: string;
        entryCount: number;
        hasRule: boolean;
        userName: string | null;
      })[]
    > {
      return db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("users as u", "u.id", "s.userId")
        .selectAll("s")
        .select([
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          // Cheap materialized-row count. Exact for manual lists; rule-based
          // lists report 0 here and get an expanded count in the route (ADR-034).
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = l.id)`.as(
            "entryCount",
          ),
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
          "u.name as userName",
        ])
        .where("s.groupId", "=", groupId)
        .execute();
    },

    /**
     * The viewer's own shares in a single group. Drives the "which of my
     * lists are shared here?" checkbox panel on the group settings.
     * @returns List rows annotated with `sharedAt` when shared, otherwise null.
     */
    listShareableForUserInGroup(
      groupId: string,
      userId: string,
    ): Promise<
      {
        listId: string;
        listName: string;
        listIntent: string;
        listKind: string;
        entryCount: number;
        sharedAt: Date | null;
        defaultPricePref: string | null;
        defaultPriceAbsoluteCents: number | null;
        defaultTradeType: string | null;
        currency: string | null;
        hasRule: boolean;
      }[]
    > {
      return db
        .selectFrom("lists as l")
        .leftJoin("friendGroupListShares as s", (join) =>
          join.onRef("s.listId", "=", "l.id").on("s.groupId", "=", groupId),
        )
        .select([
          "l.id as listId",
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = l.id)`.as(
            "entryCount",
          ),
          "s.sharedAt as sharedAt",
          "l.defaultPricePref",
          "l.defaultPriceAbsoluteCents",
          "l.defaultTradeType",
          "l.currency",
          // ADR-034: summaries report the rule flag, never the expanded count.
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
        ])
        .where("l.userId", "=", userId)
        .orderBy("l.intent", "asc")
        .orderBy("l.name", "asc")
        .execute();
    },

    /**
     * The list of groups a given list is currently shared with — for the
     * passive "shared with N groups" badge on the list page.
     * @returns Lightweight rows: group id, slug, name.
     */
    listGroupsSharingList(
      listId: string,
    ): Promise<{ groupId: string; groupSlug: string; groupName: string }[]> {
      return db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug", "g.name as groupName"])
        .where("s.listId", "=", listId)
        .orderBy("g.name", "asc")
        .execute();
    },

    /**
     * Idempotent share insert. `user_id` is denormalised so the composite FK
     * to friend_group_members enforces "you can only share into a group
     * you're a member of".
     */
    async share(groupId: string, listId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupListShares")
        .values({ groupId, listId, userId })
        .onConflict((oc) => oc.columns(["groupId", "listId"]).doNothing())
        .execute();
    },

    /** Hard-deletes the share. */
    async unshare(groupId: string, listId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupListShares")
        .where("groupId", "=", groupId)
        .where("listId", "=", listId)
        .execute();
    },

    /**
     * Resolves a list shared with a group, scoped to a viewer who must be a
     * member of that group. Used to gate the "browse a shared list" view —
     * the API surface for non-owner reads of another member's list.
     * @returns The list, its owner's display name, and the viewer's role in
     *   the group; `undefined` if the list isn't shared here or the viewer
     *   isn't a member.
     */
    async getSharedList(
      groupId: string,
      listId: string,
      viewerUserId: string,
    ): Promise<
      | {
          list: {
            id: string;
            userId: string;
            name: string;
            intent: string;
            kind: string;
            defaultPricePref: string | null;
            defaultPriceAbsoluteCents: number | null;
            defaultTradeType: string | null;
            currency: string | null;
          };
          ownerName: string | null;
        }
      | undefined
    > {
      const viewerMembership = await db
        .selectFrom("friendGroupMembers")
        .select("role")
        .where("groupId", "=", groupId)
        .where("userId", "=", viewerUserId)
        .executeTakeFirst();
      if (!viewerMembership) {
        return undefined;
      }

      const row = await db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("users as u", "u.id", "l.userId")
        .select([
          "l.id as listId",
          "l.userId as listUserId",
          "l.name as listName",
          "l.intent as listIntent",
          "l.kind as listKind",
          "l.defaultPricePref",
          "l.defaultPriceAbsoluteCents",
          "l.defaultTradeType",
          "l.currency",
          "u.name as ownerName",
        ])
        .where("s.groupId", "=", groupId)
        .where("s.listId", "=", listId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }

      return {
        list: {
          id: row.listId,
          userId: row.listUserId,
          name: row.listName,
          intent: row.listIntent,
          kind: row.listKind,
          defaultPricePref: row.defaultPricePref,
          defaultPriceAbsoluteCents: row.defaultPriceAbsoluteCents,
          defaultTradeType: row.defaultTradeType,
          currency: row.currency,
        },
        ownerName: row.ownerName,
      };
    },

    // ── Collection shares ──────────────────────────────────────────────────
    /**
     * All personal-collection shares in a group, joined with each
     * collection's owner. Pooled (group-owned) collections never appear here:
     * they're enforced out by the composite FK to collections(id, user_id).
     * @returns Share rows enriched with collection and user info.
     */
    collectionSharesForGroup(groupId: string): Promise<
      (GroupCollectionShare & {
        collectionName: string;
        collectionSortOrder: number;
        userName: string | null;
        copyCount: number;
      })[]
    > {
      return db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("users as u", "u.id", "s.userId")
        .selectAll("s")
        .select([
          "c.name as collectionName",
          "c.sortOrder as collectionSortOrder",
          "u.name as userName",
          // Total copies in the collection (cast to int — count() is bigint).
          sql<number>`(select count(*)::int from copies cp where cp.collection_id = s.collection_id)`.as(
            "copyCount",
          ),
        ])
        .where("s.groupId", "=", groupId)
        .orderBy("u.name", "asc")
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();
    },

    /**
     * The viewer's own collection-shares in a single group. Drives the
     * checkbox panel on the collection-share dialog. Only personal
     * collections (user_id IS NOT NULL) are returned.
     * @returns Collection rows annotated with `sharedAt` when shared, else null.
     */
    collectionShareableForUserInGroup(
      groupId: string,
      userId: string,
    ): Promise<
      {
        collectionId: string;
        collectionName: string;
        sharedAt: Date | null;
      }[]
    > {
      return db
        .selectFrom("collections as c")
        .leftJoin("friendGroupCollectionShares as s", (join) =>
          join.onRef("s.collectionId", "=", "c.id").on("s.groupId", "=", groupId),
        )
        .select(["c.id as collectionId", "c.name as collectionName", "s.sharedAt as sharedAt"])
        .where("c.userId", "=", userId)
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();
    },

    /**
     * Groups a given collection is currently shared with — for a passive
     * "shared with N groups" badge on the collection page.
     * @returns Lightweight rows: group id, slug, name.
     */
    groupsSharingCollection(
      collectionId: string,
    ): Promise<{ groupId: string; groupSlug: string; groupName: string }[]> {
      return db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug", "g.name as groupName"])
        .where("s.collectionId", "=", collectionId)
        .orderBy("g.name", "asc")
        .execute();
    },

    /**
     * Idempotent share insert. The composite FK to
     * friend_group_members(user_id, group_id) enforces "you can only share
     * into a group you're a member of"; the composite FK to
     * collections(id, user_id) blocks pooled collections.
     */
    async shareCollection(groupId: string, collectionId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupCollectionShares")
        .values({ groupId, collectionId, userId })
        .onConflict((oc) => oc.columns(["groupId", "collectionId"]).doNothing())
        .execute();
    },

    /** Hard-deletes the share. */
    async unshareCollection(groupId: string, collectionId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupCollectionShares")
        .where("groupId", "=", groupId)
        .where("collectionId", "=", collectionId)
        .execute();
    },

    /**
     * Resolves a collection shared with a group, scoped to a viewer who must
     * be a member of that group. Gates the read-only "browse a shared
     * collection" view.
     * @returns The collection, its owner's display name, and the viewer's
     *   role in the group; `undefined` if not shared or not a member.
     */
    async getSharedCollection(
      groupId: string,
      collectionId: string,
      viewerUserId: string,
    ): Promise<
      | {
          collection: {
            id: string;
            userId: string;
            name: string;
            description: string | null;
            sortOrder: number;
          };
          ownerName: string | null;
          viewerRole: FriendGroupRole;
        }
      | undefined
    > {
      const viewerMembership = await db
        .selectFrom("friendGroupMembers")
        .select("role")
        .where("groupId", "=", groupId)
        .where("userId", "=", viewerUserId)
        .executeTakeFirst();
      if (!viewerMembership) {
        return undefined;
      }

      const row = await db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("users as u", "u.id", "s.userId")
        .select([
          "c.id as collectionId",
          "s.userId as ownerUserId",
          "c.name as collectionName",
          "c.description as collectionDescription",
          "c.sortOrder as collectionSortOrder",
          "u.name as ownerName",
        ])
        .where("s.groupId", "=", groupId)
        .where("s.collectionId", "=", collectionId)
        .executeTakeFirst();
      if (!row) {
        return undefined;
      }

      return {
        collection: {
          id: row.collectionId,
          userId: row.ownerUserId,
          name: row.collectionName,
          description: row.collectionDescription,
          sortOrder: row.collectionSortOrder,
        },
        ownerName: row.ownerName,
        viewerRole: viewerMembership.role as FriendGroupRole,
      };
    },

    /**
     * Authorization helper: does the viewer have read access to this
     * collection through any shared-with-group channel? True iff the
     * collection is shared to at least one group the viewer belongs to.
     *
     * @returns True when the viewer has read access via group membership.
     */
    async viewerCanReadCollection(viewerUserId: string, collectionId: string): Promise<boolean> {
      const row = await db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("friendGroupMembers as m", (join) =>
          join.onRef("m.groupId", "=", "s.groupId").on("m.userId", "=", viewerUserId),
        )
        .select(sql<number>`1`.as("one"))
        .where("s.collectionId", "=", collectionId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Collections an owner has shared with any group the viewer belongs to.
     * Used to surface a "Collections" section on the owner's bundle page
     * when the bundle viewer is authenticated and a fellow group member.
     * @returns Per-collection rows annotated with the via-groups list.
     */
    async collectionsBundleForViewer(
      ownerUserId: string,
      viewerUserId: string,
    ): Promise<
      {
        collectionId: string;
        collectionName: string;
        collectionDescription: string | null;
        viaGroups: { id: string; slug: string; name: string }[];
      }[]
    > {
      const rows = await db
        .selectFrom("friendGroupCollectionShares as s")
        .innerJoin("collections as c", "c.id", "s.collectionId")
        .innerJoin("friendGroups as g", "g.id", "s.groupId")
        .innerJoin("friendGroupMembers as m", (join) =>
          join.onRef("m.groupId", "=", "s.groupId").on("m.userId", "=", viewerUserId),
        )
        .select([
          "c.id as collectionId",
          "c.name as collectionName",
          "c.description as collectionDescription",
          "g.id as groupId",
          "g.slug as groupSlug",
          "g.name as groupName",
        ])
        .where("s.userId", "=", ownerUserId)
        .orderBy("c.sortOrder", "asc")
        .orderBy("c.name", "asc")
        .execute();

      const byCollection = new Map<
        string,
        {
          collectionId: string;
          collectionName: string;
          collectionDescription: string | null;
          viaGroups: { id: string; slug: string; name: string }[];
        }
      >();
      for (const row of rows) {
        let entry = byCollection.get(row.collectionId);
        if (!entry) {
          entry = {
            collectionId: row.collectionId,
            collectionName: row.collectionName,
            collectionDescription: row.collectionDescription,
            viaGroups: [],
          };
          byCollection.set(row.collectionId, entry);
        }
        entry.viaGroups.push({ id: row.groupId, slug: row.groupSlug, name: row.groupName });
      }
      return [...byCollection.values()];
    },
  };
}
