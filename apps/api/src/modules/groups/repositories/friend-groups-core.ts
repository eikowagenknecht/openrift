import { TRADED_CARD_TRADE_STATUSES } from "@openrift/shared/card-trade-lifecycle";
import { TRADE_VOLUME_WINDOW_DAYS } from "@openrift/shared/contracts/friend-groups";
import type { FriendGroupRole } from "@openrift/shared/types/api/friend-group";
import { sql } from "kysely";
import type { ExpressionBuilder, Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { FriendGroupsTable } from "../../../db/tables/friend-groups.js";
import type {
  Group,
  GroupUpdate,
  MemberPreviewRow,
  NewGroupValues,
  SharedGroupRow,
} from "./friend-groups-shared.js";

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
 * Postgres `least()` ignores nulls, so a half-settled row dates from the half
 * that landed, and a row with neither settle is null.
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

export function friendGroupRecordsRepo(db: Kysely<Database>) {
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
  };
}
