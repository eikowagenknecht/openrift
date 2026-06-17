import type {
  CardTradeActionCountsResponse,
  CardTradeActionNeeded,
  CardTradeCounterparty,
  CardTradeInitiator,
  CardTradeResponse,
  CardTradeRole,
  CardTradeStatus,
} from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CardTradesTable, Database } from "../db/index.js";
import { gravatarHashForEmail } from "../lib/gravatar.js";

/** Raw trade row, for the service layer's authorization / state checks. */
export type CardTrade = Selectable<CardTradesTable>;

/** Fields set at creation; status defaults to `pending` in the DB. */
export interface NewCardTrade {
  groupId: string;
  giverUserId: string;
  receiverUserId: string;
  initiator: CardTradeInitiator;
  printingId: string;
  cardId: string;
  quantity: number;
  receiverWishEntryId: string | null;
  lastActorUserId: string;
  expiresAt: Date;
}

export interface TradeListFilters {
  groupId?: string;
  status?: CardTradeStatus;
}

/** A completed trade in a group, for the activity feed (viewer-agnostic). */
export interface CompletedTradeFeedRow {
  tradeId: string;
  printingId: string;
  cardId: string;
  quantity: number;
  completedAt: Date;
  giverUserId: string;
  giverName: string | null;
  receiverUserId: string;
  receiverName: string | null;
}

/** A queued trade-request awaiting a coalesced email (ADR-030). */
export interface QueuedRequestEmailRow {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  cardId: string;
  printingId: string;
  quantity: number;
  initiator: CardTradeInitiator;
  /** The initiator — whose burst of requests is being coalesced. */
  senderUserId: string;
  /** The non-initiator — who receives the email. */
  recipientUserId: string;
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * The viewer's primary contextual action, status- and role-derived.
 * @returns The action the viewer can take, or `null`.
 */
function deriveActionNeeded(
  status: CardTradeStatus,
  role: CardTradeRole,
  initiator: CardTradeInitiator,
  viewerSyncAppliedAt: Date | null,
): CardTradeActionNeeded | null {
  if (status === "pending") {
    // The non-initiator must accept/decline; the initiator can only cancel.
    return role === initiator ? "cancel" : "accept-or-decline";
  }
  if (status === "reserved") {
    return "complete";
  }
  if (status === "completed") {
    return viewerSyncAppliedAt === null ? "apply-sync" : null;
  }
  return null;
}

/**
 * Base DTO query: trade + group slug + both parties' user/nickname columns.
 * @returns The Kysely select builder for trade DTO rows.
 */
function tradeDtoBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("cardTrades as t")
    .innerJoin("friendGroups as g", "g.id", "t.groupId")
    .innerJoin("users as giverUser", "giverUser.id", "t.giverUserId")
    .innerJoin("users as receiverUser", "receiverUser.id", "t.receiverUserId")
    .leftJoin("friendGroupMembers as giverMember", (join) =>
      join
        .onRef("giverMember.groupId", "=", "t.groupId")
        .onRef("giverMember.userId", "=", "t.giverUserId"),
    )
    .leftJoin("friendGroupMembers as receiverMember", (join) =>
      join
        .onRef("receiverMember.groupId", "=", "t.groupId")
        .onRef("receiverMember.userId", "=", "t.receiverUserId"),
    )
    .select([
      "t.id",
      "t.groupId",
      "g.slug as groupSlug",
      "t.giverUserId",
      "t.receiverUserId",
      "t.initiator",
      "t.printingId",
      "t.cardId",
      "t.quantity",
      "t.status",
      "t.lastActorUserId",
      "t.giverSyncAppliedAt",
      "t.receiverSyncAppliedAt",
      "t.createdAt",
      "t.updatedAt",
      "t.acceptedAt",
      "t.completedAt",
      "t.closedAt",
      "t.expiresAt",
      "giverUser.name as giverName",
      "giverUser.image as giverImage",
      "giverUser.email as giverEmail",
      "giverMember.nickname as giverNickname",
      "receiverUser.name as receiverName",
      "receiverUser.image as receiverImage",
      "receiverUser.email as receiverEmail",
      "receiverMember.nickname as receiverNickname",
    ]);
}

type TradeDtoRow = Awaited<ReturnType<ReturnType<typeof tradeDtoBaseQuery>["execute"]>>[number];

/**
 * Orient a raw joined row to the viewer (role-relative counterparty + flags).
 * @returns The viewer-oriented trade DTO.
 */
function mapTradeRow(row: TradeDtoRow, userId: string): CardTradeResponse {
  const viewerIsGiver = row.giverUserId === userId;
  const role: CardTradeRole = viewerIsGiver ? "giver" : "receiver";

  const counterparty: CardTradeCounterparty = viewerIsGiver
    ? {
        userId: row.receiverUserId,
        name: row.receiverName,
        image: row.receiverImage,
        gravatarHash: gravatarHashForEmail(row.receiverEmail),
        nickname: row.receiverNickname,
      }
    : {
        userId: row.giverUserId,
        name: row.giverName,
        image: row.giverImage,
        gravatarHash: gravatarHashForEmail(row.giverEmail),
        nickname: row.giverNickname,
      };

  const viewerSyncAppliedAt = viewerIsGiver ? row.giverSyncAppliedAt : row.receiverSyncAppliedAt;
  const counterpartySyncAppliedAt = viewerIsGiver
    ? row.receiverSyncAppliedAt
    : row.giverSyncAppliedAt;

  return {
    id: row.id,
    groupId: row.groupId,
    groupSlug: row.groupSlug,
    role,
    initiator: row.initiator,
    counterparty,
    printingId: row.printingId,
    cardId: row.cardId,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    acceptedAt: isoOrNull(row.acceptedAt),
    completedAt: isoOrNull(row.completedAt),
    closedAt: isoOrNull(row.closedAt),
    expiresAt: isoOrNull(row.expiresAt),
    viewerSyncAppliedAt: isoOrNull(viewerSyncAppliedAt),
    counterpartySyncAppliedAt: isoOrNull(counterpartySyncAppliedAt),
    actionNeeded: deriveActionNeeded(row.status, role, row.initiator, viewerSyncAppliedAt),
  };
}

/**
 * Trade execution data access (ADR-019). Pure queries/mutations — the orchestration
 * (validation, reservation transactions, copy-mutation sync) lives in the
 * card-trades *service*. `updated_at` is maintained explicitly here on real
 * transitions only (not on the private sync-applied writes), driving the
 * newest-first ordering of a member's trade list.
 * @returns An object with card-trade query methods bound to the given `db`.
 */
export function cardTradesRepo(db: Kysely<Database>) {
  return {
    /**
     * Inserts a `pending` trade.
     * @returns The created row.
     */
    create(values: NewCardTrade): Promise<CardTrade> {
      return db
        .insertInto("cardTrades")
        .values({
          groupId: values.groupId,
          giverUserId: values.giverUserId,
          receiverUserId: values.receiverUserId,
          initiator: values.initiator,
          printingId: values.printingId,
          cardId: values.cardId,
          quantity: values.quantity,
          receiverWishEntryId: values.receiverWishEntryId,
          lastActorUserId: values.lastActorUserId,
          expiresAt: values.expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The raw trade row, or `undefined` if not found. */
    getById(id: string): Promise<CardTrade | undefined> {
      return db.selectFrom("cardTrades").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /**
     * Finds the existing live (pending/reserved) trade for this exact
     * direction, if any — used to reject a duplicate before the DB does.
     * @returns The live trade, or `undefined`.
     */
    findLiveTrade(
      groupId: string,
      giverUserId: string,
      receiverUserId: string,
      printingId: string,
    ): Promise<CardTrade | undefined> {
      return db
        .selectFrom("cardTrades")
        .selectAll()
        .where("groupId", "=", groupId)
        .where("giverUserId", "=", giverUserId)
        .where("receiverUserId", "=", receiverUserId)
        .where("printingId", "=", printingId)
        .where("status", "in", ["pending", "reserved"])
        .executeTakeFirst();
    },

    /** @returns The viewer's trades (optionally filtered), newest change first, as DTOs. */
    async listForUser(
      userId: string,
      filters: TradeListFilters = {},
    ): Promise<CardTradeResponse[]> {
      let query = tradeDtoBaseQuery(db).where((eb) =>
        eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
      );
      if (filters.groupId !== undefined) {
        query = query.where("t.groupId", "=", filters.groupId);
      }
      if (filters.status !== undefined) {
        query = query.where("t.status", "=", filters.status);
      }
      const rows = await query.orderBy("t.updatedAt", "desc").execute();
      return rows.map((row) => mapTradeRow(row, userId));
    },

    /**
     * Completed trades in a group, newest-completed first, for the activity
     * feed. Viewer-agnostic (the feed is group-wide) — carries both parties'
     * plain names and the card identity; the client resolves name/image.
     * @returns Completed-trade feed rows.
     */
    async recentCompletedInGroup(groupId: string, limit: number): Promise<CompletedTradeFeedRow[]> {
      const rows = await db
        .selectFrom("cardTrades as t")
        .innerJoin("users as giver", "giver.id", "t.giverUserId")
        .innerJoin("users as receiver", "receiver.id", "t.receiverUserId")
        .select([
          "t.id as tradeId",
          "t.printingId",
          "t.cardId",
          "t.quantity",
          "t.completedAt",
          "t.giverUserId",
          "t.receiverUserId",
          "giver.name as giverName",
          "receiver.name as receiverName",
        ])
        .where("t.groupId", "=", groupId)
        .where("t.status", "=", "completed")
        .where("t.completedAt", "is not", null)
        .orderBy("t.completedAt", "desc")
        .limit(limit)
        .execute();
      return rows.map((row) => ({
        tradeId: row.tradeId,
        printingId: row.printingId,
        cardId: row.cardId,
        quantity: row.quantity,
        // Non-null by the `completedAt is not null` filter above.
        completedAt: row.completedAt as Date,
        giverUserId: row.giverUserId,
        giverName: row.giverName,
        receiverUserId: row.receiverUserId,
        receiverName: row.receiverName,
      }));
    },

    /** @returns The single trade as a viewer-oriented DTO, or `undefined`. */
    async getDtoByIdForUser(id: string, userId: string): Promise<CardTradeResponse | undefined> {
      const rows = await tradeDtoBaseQuery(db)
        .where("t.id", "=", id)
        .where((eb) =>
          eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
        )
        .execute();
      const row = rows[0];
      return row === undefined ? undefined : mapTradeRow(row, userId);
    },

    /**
     * Per-group counts of trades needing the viewer's action: a pending request
     * awaiting their response, or a completed trade whose own-side sync they
     * haven't applied. Mirrors the two `action-needed` cases in
     * `deriveActionNeeded` (`cancel` / `complete` are deliberately excluded).
     * @returns One entry per group with at least one such trade.
     */
    async actionNeededCountsForUser(
      userId: string,
    ): Promise<CardTradeActionCountsResponse["byGroup"]> {
      const rows = await db
        .selectFrom("cardTrades as t")
        .innerJoin("friendGroups as g", "g.id", "t.groupId")
        .select(["t.groupId as groupId", "g.slug as groupSlug"])
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where((eb) =>
          eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
        )
        .where(
          sql<boolean>`(
            (t.status = 'pending' and (
              (t.receiver_user_id = ${userId} and t.initiator = 'giver')
              or (t.giver_user_id = ${userId} and t.initiator = 'receiver')
            ))
            or (t.status = 'completed' and (
              (t.giver_user_id = ${userId} and t.giver_sync_applied_at is null)
              or (t.receiver_user_id = ${userId} and t.receiver_sync_applied_at is null)
            ))
          )`,
        )
        .groupBy(["t.groupId", "g.slug"])
        .execute();
      return rows.map((row) => ({
        groupId: row.groupId,
        groupSlug: row.groupSlug,
        count: Number(row.count),
      }));
    },

    // ── Request-email coalescing (ADR-030) ───────────────────────────────────
    // The "sender" is the initiator; the "recipient" is the non-initiator who
    // gets the email. A burst of requests from one sender to one recipient is
    // throttled to a leading instant email plus one coalesced follow-up per
    // window. `request_email_sent_at` is the per-trade marker (NULL = queued).

    /**
     * Leading-edge claim: stamps this trade as emailed iff no email has gone to
     * the same sender→recipient pair within `windowSeconds`. Guarded so two
     * concurrent requests can't both win the instant slot.
     * @returns `true` if the caller may send the instant email; `false` if the
     *   trade is now queued for the coalesced flush (someone already led).
     */
    async claimInstantRequestEmail(
      tradeId: string,
      senderUserId: string,
      recipientUserId: string,
      windowSeconds: number,
    ): Promise<boolean> {
      const result = await db
        .updateTable("cardTrades")
        .set({ requestEmailSentAt: sql`now()` })
        .where("id", "=", tradeId)
        .where("requestEmailSentAt", "is", null)
        .where(
          sql<boolean>`NOT EXISTS (
            SELECT 1 FROM card_trades x
            WHERE x.request_email_sent_at IS NOT NULL
              AND x.request_email_sent_at > now() - (${windowSeconds} * interval '1 second')
              AND (CASE WHEN x.initiator = 'giver' THEN x.giver_user_id ELSE x.receiver_user_id END) = ${senderUserId}
              AND (CASE WHEN x.initiator = 'giver' THEN x.receiver_user_id ELSE x.giver_user_id END) = ${recipientUserId}
          )`,
        )
        .returning("id")
        .execute();
      return result.length > 0;
    },

    /**
     * Queued (un-notified) pending requests whose sender→recipient burst has
     * settled — no email to that pair within `windowSeconds`. Ordered so the
     * flush can group consecutive rows by (recipient, sender). Joins the group
     * for the email's deep link.
     * @returns The queued request rows due for a coalesced email.
     */
    async listDueCoalescedRequests(windowSeconds: number): Promise<QueuedRequestEmailRow[]> {
      const result = await sql<QueuedRequestEmailRow>`
        SELECT
          t.id,
          t.group_id,
          g.slug AS group_slug,
          g.name AS group_name,
          t.card_id,
          t.printing_id,
          t.quantity,
          t.initiator,
          (CASE WHEN t.initiator = 'giver' THEN t.giver_user_id ELSE t.receiver_user_id END) AS sender_user_id,
          (CASE WHEN t.initiator = 'giver' THEN t.receiver_user_id ELSE t.giver_user_id END) AS recipient_user_id
        FROM card_trades t
        JOIN friend_groups g ON g.id = t.group_id
        WHERE t.status = 'pending'
          AND t.request_email_sent_at IS NULL
          AND t.expires_at > now()
          AND NOT EXISTS (
            SELECT 1 FROM card_trades x
            WHERE x.request_email_sent_at IS NOT NULL
              AND x.request_email_sent_at > now() - (${windowSeconds} * interval '1 second')
              AND (CASE WHEN x.initiator = 'giver' THEN x.giver_user_id ELSE x.receiver_user_id END)
                    = (CASE WHEN t.initiator = 'giver' THEN t.giver_user_id ELSE t.receiver_user_id END)
              AND (CASE WHEN x.initiator = 'giver' THEN x.receiver_user_id ELSE x.giver_user_id END)
                    = (CASE WHEN t.initiator = 'giver' THEN t.receiver_user_id ELSE t.giver_user_id END)
          )
        ORDER BY recipient_user_id, sender_user_id, t.created_at
      `.execute(db);
      return result.rows;
    },

    /**
     * Stamps the given trades as emailed, but only those still un-notified
     * (NULL) — so the flush never double-claims a trade the instant path took
     * concurrently. Used both to mark a coalesced email sent and to suppress an
     * opted-out recipient's queue.
     * @returns The ids actually claimed by this call.
     */
    async claimRequestEmails(tradeIds: readonly string[]): Promise<string[]> {
      if (tradeIds.length === 0) {
        return [];
      }
      const result = await db
        .updateTable("cardTrades")
        .set({ requestEmailSentAt: sql`now()` })
        .where("id", "in", [...tradeIds])
        .where("requestEmailSentAt", "is", null)
        .returning("id")
        .execute();
      return result.map((row) => row.id);
    },

    /**
     * Cron: move `pending` rows past their TTL to `expired` (system actor).
     * @returns `{ expired }` — the number of rows expired.
     */
    async expirePending(): Promise<{ expired: number }> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "expired",
          closedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: null,
          updatedAt: sql`now()`,
        })
        .where("status", "=", "pending")
        .where("expiresAt", "<", sql<Date>`now()`)
        .executeTakeFirst();
      return { expired: Number(result.numUpdatedRows) };
    },

    /**
     * Cancels the departing member's live (pending/reserved) trades in this group
     * and releases their reserved copies. Runs inside the caller's transaction
     * (the `/leave` or kick handler), so `db` here is the transaction-bound repo.
     */
    async cancelForDepartingMember(groupId: string, userId: string): Promise<void> {
      const trades = await db
        .selectFrom("cardTrades")
        .select("id")
        .where("groupId", "=", groupId)
        .where((eb) => eb.or([eb("giverUserId", "=", userId), eb("receiverUserId", "=", userId)]))
        .where("status", "in", ["pending", "reserved"])
        .execute();
      if (trades.length === 0) {
        return;
      }
      const ids = trades.map((trade) => trade.id);
      await db.deleteFrom("cardTradeCopies").where("tradeId", "in", ids).execute();
      await db
        .updateTable("cardTrades")
        .set({
          status: "cancelled",
          closedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: userId,
          updatedAt: sql`now()`,
        })
        .where("id", "in", ids)
        .execute();
    },

    // ── Reservation (card_trade_copies) ──────────────────────────────────────

    /**
     * Selects up to `limit` of the giver's copies of `printingId` that are on a
     * trade-intent list shared with this group and not already reserved.
     * @returns The unreserved copy ids (may be fewer than `limit`).
     */
    async selectUnreservedGroupSharedCopies(
      groupId: string,
      giverUserId: string,
      printingId: string,
      limit: number,
    ): Promise<string[]> {
      if (limit <= 0) {
        return [];
      }
      const rows = await db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("listEntries as le", "le.listId", "l.id")
        .innerJoin("copies as cp", "cp.id", "le.copyId")
        .select("cp.id as copyId")
        .distinct()
        .where("s.groupId", "=", groupId)
        .where("s.userId", "=", giverUserId)
        .where("l.intent", "=", "trade")
        .where("le.kind", "=", "copy")
        .where("cp.printingId", "=", printingId)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("cardTradeCopies as ctc")
                .select(sql`1`.as("one"))
                .whereRef("ctc.copyId", "=", "cp.id"),
            ),
          ),
        )
        .limit(limit)
        .execute();
      return rows.map((row) => row.copyId);
    },

    /** Pins copies to a trade. `UNIQUE(copy_id)` rejects a copy already claimed by another live trade. */
    async pinCopies(tradeId: string, copyIds: readonly string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db
        .insertInto("cardTradeCopies")
        .values(copyIds.map((copyId) => ({ tradeId, copyId })))
        .execute();
    },

    /** @returns The copy ids currently reserved by the given trade. */
    async listReservedCopyIds(tradeId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("cardTradeCopies")
        .select("copyId")
        .where("tradeId", "=", tradeId)
        .execute();
      return rows.map((row) => row.copyId);
    },

    /** Releases all copies reserved by the given trade. */
    async deleteCopiesForTrade(tradeId: string): Promise<void> {
      await db.deleteFrom("cardTradeCopies").where("tradeId", "=", tradeId).execute();
    },

    /** @returns The subset of `copyIds` currently reserved by any live trade (dispose guard). */
    async filterReservedCopyIds(copyIds: readonly string[]): Promise<string[]> {
      if (copyIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("cardTradeCopies")
        .select("copyId")
        .where("copyId", "in", [...copyIds])
        .execute();
      return rows.map((row) => row.copyId);
    },

    /**
     * @returns `true` if the giver still has at least one group-shared copy of the
     * printing — reservation-agnostic, used to tell a vanished basis (auto-cancel)
     * apart from a stack merely exhausted by competing reservations (stays pending).
     */
    async hasGroupSharedCopy(
      groupId: string,
      giverUserId: string,
      printingId: string,
    ): Promise<boolean> {
      const row = await db
        .selectFrom("friendGroupListShares as s")
        .innerJoin("lists as l", "l.id", "s.listId")
        .innerJoin("listEntries as le", "le.listId", "l.id")
        .innerJoin("copies as cp", "cp.id", "le.copyId")
        .select("cp.id as copyId")
        .where("s.groupId", "=", groupId)
        .where("s.userId", "=", giverUserId)
        .where("l.intent", "=", "trade")
        .where("le.kind", "=", "copy")
        .where("cp.printingId", "=", printingId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    // ── State transitions ────────────────────────────────────────────────────
    // Each guards on the expected source status in the WHERE clause and returns
    // the affected-row count, so a concurrent transition that already moved the
    // row matches zero rows. The service throws 409 on a 0 count, making each
    // transition exactly-once under READ COMMITTED without an explicit row lock.
    // Real transitions bump `updated_at`; the seen / sync-applied writes do not
    // (so the unread rule never spuriously re-flags the counterparty).

    /**
     * pending → reserved.
     * @returns Rows affected (0 if no longer pending).
     */
    async markReserved(id: string, byUserId: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "reserved",
          acceptedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: byUserId,
          updatedAt: sql`now()`,
        })
        .where("id", "=", id)
        .where("status", "=", "pending")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * pending → declined.
     * @returns Rows affected (0 if no longer pending).
     */
    async markDeclined(id: string, byUserId: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "declined",
          closedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: byUserId,
          updatedAt: sql`now()`,
        })
        .where("id", "=", id)
        .where("status", "=", "pending")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * pending|reserved → cancelled.
     * @returns Rows affected (0 if already terminal).
     */
    async markCancelled(id: string, byUserId: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "cancelled",
          closedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: byUserId,
          updatedAt: sql`now()`,
        })
        .where("id", "=", id)
        .where("status", "in", ["pending", "reserved"])
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * pending → cancelled by the system (basis vanished), `last_actor = NULL`.
     * @returns Rows affected (0 if no longer pending).
     */
    async markAutoCancelled(id: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "cancelled",
          closedAt: sql`now()`,
          expiresAt: null,
          lastActorUserId: null,
          updatedAt: sql`now()`,
        })
        .where("id", "=", id)
        .where("status", "=", "pending")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * reserved → completed.
     * @returns Rows affected (0 if no longer reserved).
     */
    async markCompleted(id: string, byUserId: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({
          status: "completed",
          completedAt: sql`now()`,
          lastActorUserId: byUserId,
          updatedAt: sql`now()`,
        })
        .where("id", "=", id)
        .where("status", "=", "reserved")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Records the giver resolved their side's sync. Guards on completed + unset so
     * a concurrent double-apply matches zero rows. Does NOT bump `updated_at`.
     * @returns Rows affected (0 if not completed or already resolved).
     */
    async setGiverSyncApplied(id: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({ giverSyncAppliedAt: sql`now()` })
        .where("id", "=", id)
        .where("status", "=", "completed")
        .where("giverSyncAppliedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Records the receiver resolved their side's sync. Guards on completed + unset
     * so a concurrent double-apply matches zero rows. Does NOT bump `updated_at`.
     * @returns Rows affected (0 if not completed or already resolved).
     */
    async setReceiverSyncApplied(id: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({ receiverSyncAppliedAt: sql`now()` })
        .where("id", "=", id)
        .where("status", "=", "completed")
        .where("receiverSyncAppliedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },
  };
}
