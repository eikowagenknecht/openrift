import type { ContactMethod, FriendGroupInviteDirection, FriendGroupRole } from "@openrift/shared";
import { TRADED_CARD_TRADE_STATUSES } from "@openrift/shared";
import { TRADE_VOLUME_WINDOW_DAYS } from "@openrift/shared/contracts/friend-groups";
import { sql } from "kysely";
import type { ExpressionBuilder, Insertable, Kysely, Selectable, Updateable } from "kysely";

import type {
  Database,
  FriendGroupCollectionSharesTable,
  FriendGroupInvitesTable,
  FriendGroupListSharesTable,
  FriendGroupMembersTable,
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

export interface MemberWithUser extends GroupMember {
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

export interface SharedGroupRow {
  id: string;
  slug: string;
  name: string;
}

export interface MemberPreviewRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

export interface GroupSummary extends Group {
  viewerRole: FriendGroupRole;
  memberCount: number;
  pendingRequestCount: number;
  sharedListCount: number;
  memberPreviews: MemberPreviewRow[];
  /** Cards traded in the group over the last {@link TRADE_VOLUME_WINDOW_DAYS}. */
  recentTradedCardCount: number;
  /** Cards traded in the group ever. */
  tradedCardCount: number;
}

/** How many member profiles the index tiles show before the "+N" overflow. */
const MEMBER_PREVIEW_LIMIT = 5;

/**
 * When a swap actually happened: its first settle, per ADR-019. `least` ignores
 * nulls in Postgres, so a half-settled row dates from the half that landed, and
 * a row with neither settle is null and falls out of any window.
 */
const SETTLED_AT = sql<Date | null>`least(t.giver_sync_applied_at, t.receiver_sync_applied_at)`;

/**
 * Cards traded in a group, as a correlated sub-select against `g.id`. Shares
 * the traded-row rule with `countCompletedCardsInGroup` (the group hero's
 * lifetime stat), so the index card and the group page cannot disagree about
 * what counts: a swap counts from the first settle, and the status test is what
 * drops the rows `cancelForDepartingMember` bulk-cancels with their sync
 * columns intact.
 */
function tradedCardsInGroup(eb: ExpressionBuilder<Database & { g: FriendGroupsTable }, "g">) {
  return eb
    .selectFrom("cardTrades as t")
    .select((inner) => inner.cast<number>(inner.fn.sum(inner.ref("t.quantity")), "integer").as("n"))
    .whereRef("t.groupId", "=", "g.id")
    .where("t.status", "in", [...TRADED_CARD_TRADE_STATUSES])
    .where(SETTLED_AT, "is not", null);
}

async function memberPreviewsByGroup(
  db: Kysely<Database>,
  groupIds: string[],
): Promise<Map<string, MemberPreviewRow[]>> {
  if (groupIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom((eb) =>
      eb
        .selectFrom("friendGroupMembers as pm")
        .innerJoin("users as pu", "pu.id", "pm.userId")
        .select([
          "pm.groupId",
          "pm.userId",
          "pu.name as userName",
          "pu.email as userEmail",
          "pu.image as userImage",
          // Raw fragment, so column names are the SQL-level snake_case ones.
          sql<number>`(row_number() over (
            partition by pm.group_id
            order by
              case pm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
              lower(pu.name),
              pm.joined_at
          ))::int`.as("rosterRank"),
        ])
        .where("pm.groupId", "in", groupIds)
        .as("ranked"),
    )
    .selectAll()
    .where("rosterRank", "<=", MEMBER_PREVIEW_LIMIT)
    .orderBy("rosterRank", "asc")
    .execute();

  return new Map(
    [...Map.groupBy(rows, (row) => row.groupId)].map(([groupId, members]) => [
      groupId,
      members.map(({ userId, userName, userEmail, userImage }) => ({
        userId,
        userName,
        userEmail,
        userImage,
      })),
    ]),
  );
}

/**
 * Authorization is the caller's job: routes pull the viewer's role via
 * `getMembership` and gate writes against {@link FriendGroupRole}. The repo
 * itself is naïve.
 */
export function friendGroupsRepo(db: Kysely<Database>) {
  return {
    getById(id: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    /**
     * Viewer-facing slug lookup: exact slug first, then the rename alias
     * (`previous_slug`), so bookmarks and in-flight trade emails survive a
     * rename. A current slug always beats another group's stale alias; on the
     * rare alias collision the most recently updated group wins. Keep the
     * exact `getBySlug` for uniqueness/conflict checks.
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

    getByCode(code: string): Promise<Group | undefined> {
      return db.selectFrom("friendGroups").selectAll().where("code", "=", code).executeTakeFirst();
    },

    /**
     * Inserts the group and the owner's membership in one transaction so the
     * partial-unique-owner invariant always holds.
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
     * `null` disables code-based joining (admins must issue direct invites).
     * Bumps `code_rotated_at` whether rotating or disabling — the column
     * tracks "when did the current value start applying".
     */
    setCode(id: string, code: string | null): Promise<Group | undefined> {
      return db
        .updateTable("friendGroups")
        .set({ code, codeRotatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    getMembership(groupId: string, userId: string): Promise<GroupMember | undefined> {
      return db
        .selectFrom("friendGroupMembers")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

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
     * The pending-request count is `0` for plain members so the UI can render
     * the same row shape regardless of role.
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
            .selectFrom("friendGroupListShares as s")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("s.groupId", "=", "g.id")
            .as("sharedListCount"),
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
          tradedCardsInGroup(eb)
            .where(
              SETTLED_AT,
              ">=",
              sql<Date>`now() - make_interval(days => ${TRADE_VOLUME_WINDOW_DAYS})`,
            )
            .as("recentTradedCardCount"),
          tradedCardsInGroup(eb).as("tradedCardCount"),
        ])
        .where("m.userId", "=", userId)
        .orderBy("g.name", "asc")
        .execute();

      const previews = await memberPreviewsByGroup(
        db,
        rows.map((row) => row.id),
      );

      // Sub-selects come back typed as `number | null`; the two sums are also
      // null for a group whose rows all fall outside the filter.
      return rows.map((row) => ({
        ...row,
        memberCount: Number(row.memberCount ?? 0),
        pendingRequestCount: Number(row.pendingRequestCount ?? 0),
        sharedListCount: Number(row.sharedListCount ?? 0),
        memberPreviews: previews.get(row.id) ?? [],
        recentTradedCardCount: Number(row.recentTradedCardCount ?? 0),
        tradedCardCount: Number(row.tradedCardCount ?? 0),
      }));
    },

    /**
     * The groups both users belong to. An empty result is also the trade
     * sheet's authorization answer: two people with no group in common can
     * see nothing of each other.
     */
    sharedGroups(userIdA: string, userIdB: string): Promise<SharedGroupRow[]> {
      return db
        .selectFrom("friendGroupMembers as a")
        .innerJoin("friendGroupMembers as b", (join) =>
          join.onRef("b.groupId", "=", "a.groupId").on("b.userId", "=", userIdB),
        )
        .innerJoin("friendGroups as g", "g.id", "a.groupId")
        .select(["g.id as id", "g.slug as slug", "g.name as name"])
        .where("a.userId", "=", userIdA)
        .orderBy(sql`lower(g.name)`, "asc")
        .orderBy("g.id", "asc")
        .execute();
    },

    async addMember(groupId: string, userId: string, role: FriendGroupRole): Promise<void> {
      await db
        .insertInto("friendGroupMembers")
        .values({ groupId, userId, role })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .execute();
    },

    /** The FK cascade removes the member's shares for that group. */
    async removeMember(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupMembers")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Not for owner changes — use `transferOwnership` (the partial unique
     * index would reject two owners anyway).
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
     * Only ids the member actually owns are accepted (others are silently
     * dropped), so a caller can't reveal someone else's method.
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
     *
     * The promote must match a row: a `toUserId` who is not a member updates
     * nothing, and the demote alone would leave the group ownerless. The route
     * checks membership first, so reaching the throw means the target left the
     * group in between — the transaction rolls back and the owner keeps the
     * group.
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
          .returning("userId")
          .executeTakeFirstOrThrow(
            () =>
              new Error(
                `Cannot transfer ownership of group ${groupId}: user ${toUserId} is not a member`,
              ),
          );
      });
    },

    getInvite(groupId: string, userId: string): Promise<GroupInvite | undefined> {
      return db
        .selectFrom("friendGroupInvites")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /**
     * Only the member count is exposed (no profile previews): a group doesn't
     * reveal its roster to someone it hasn't accepted yet.
     */
    async listOwnRequestsForUser(
      userId: string,
    ): Promise<(GroupInvite & { groupName: string; groupSlug: string; memberCount: number })[]> {
      const rows = await db
        .selectFrom("friendGroupInvites as i")
        .innerJoin("friendGroups as g", "g.id", "i.groupId")
        .selectAll("i")
        .select(["g.name as groupName", "g.slug as groupSlug"])
        .select((eb) =>
          eb
            .selectFrom("friendGroupMembers as mc")
            .select(eb.fn.countAll<number>().as("count"))
            .whereRef("mc.groupId", "=", "g.id")
            .as("memberCount"),
        )
        .where("i.userId", "=", userId)
        .where("i.direction", "=", "request")
        .orderBy("i.createdAt", "asc")
        .execute();

      return rows.map((row) => ({
        ...row,
        memberCount: Number(row.memberCount ?? 0),
      }));
    },

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
     * UNIQUE(group_id, user_id) means at most one row per (group, user);
     * ON CONFLICT DO NOTHING swallows duplicate clicks without erroring.
     *
     * The return value distinguishes the two: a repeated click leaves the row
     * untouched and must not re-notify the group's admins.
     * @returns Whether a new invite row was written.
     */
    async createInvite(
      groupId: string,
      userId: string,
      direction: FriendGroupInviteDirection,
    ): Promise<boolean> {
      const result = await db
        .insertInto("friendGroupInvites")
        .values({ groupId, userId, direction })
        .onConflict((oc) => oc.columns(["groupId", "userId"]).doNothing())
        .executeTakeFirst();
      return (result.numInsertedOrUpdatedRows ?? 0n) > 0n;
    },

    async deleteInvite(groupId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupInvites")
        .where("groupId", "=", groupId)
        .where("userId", "=", userId)
        .execute();
    },

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
          // lists report 0 here and get an expanded count in the route.
          sql<number>`(select count(*)::int from list_entries where list_entries.list_id = l.id)`.as(
            "entryCount",
          ),
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
          "u.name as userName",
        ])
        .where("s.groupId", "=", groupId)
        .execute();
    },

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
          // Summaries report the rule flag, never the expanded count.
          sql<boolean>`(jsonb_array_length(l.rules) > 0)`.as("hasRule"),
        ])
        .where("l.userId", "=", userId)
        .orderBy("l.intent", "asc")
        .orderBy("l.name", "asc")
        .execute();
    },

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
     * `user_id` is denormalised so the composite FK to friend_group_members
     * enforces "you can only share into a group you're a member of".
     */
    async share(groupId: string, listId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupListShares")
        .values({ groupId, listId, userId })
        .onConflict((oc) => oc.columns(["groupId", "listId"]).doNothing())
        .execute();
    },

    async unshare(groupId: string, listId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupListShares")
        .where("groupId", "=", groupId)
        .where("listId", "=", listId)
        .execute();
    },

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

    /**
     * Pooled (group-owned) collections never appear here: they're enforced
     * out by the composite FK to collections(id, user_id).
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
     * The composite FK to friend_group_members(user_id, group_id) enforces
     * "you can only share into a group you're a member of"; the composite FK
     * to collections(id, user_id) blocks pooled collections.
     */
    async shareCollection(groupId: string, collectionId: string, userId: string): Promise<void> {
      await db
        .insertInto("friendGroupCollectionShares")
        .values({ groupId, collectionId, userId })
        .onConflict((oc) => oc.columns(["groupId", "collectionId"]).doNothing())
        .execute();
    },

    async unshareCollection(groupId: string, collectionId: string): Promise<void> {
      await db
        .deleteFrom("friendGroupCollectionShares")
        .where("groupId", "=", groupId)
        .where("collectionId", "=", collectionId)
        .execute();
    },

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
