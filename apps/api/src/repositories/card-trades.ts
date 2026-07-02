import type {
  CardTradeActionCountsResponse,
  CardTradeActionNeeded,
  CardTradeCounterparty,
  CardTradeInitiator,
  CardTradeResponse,
  CardTradeRole,
  CardTradeStatus,
  ContactMethod,
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
  /** When the request was created — drives the recipient's debounce window. */
  createdAt: Date;
}

/** The kind of transition a queued status email covers. */
type TradeStatusEmailEvent = "reserved" | "declined" | "cancelled";

/** A queued trade status-change awaiting a coalesced email (ADR-030). */
export interface QueuedStatusEmailRow {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  cardId: string;
  quantity: number;
  /** Which transition fired — drives the per-line copy and the marker to claim. */
  event: TradeStatusEmailEvent;
  /** Who caused the transition — whose burst is coalesced (the email's subject). */
  actorUserId: string;
  /** The other party — who didn't act, and receives the email. */
  recipientUserId: string;
  /** When the transition happened — drives the recipient's debounce window. */
  eventAt: Date;
}

/** The per-trade marker column a queued status email stamps once sent/suppressed. */
export type TradeStatusEmailMarker = "reservedEmailSentAt" | "closedEmailSentAt";

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
 * Base DTO query: trade + group slug + both parties' user columns. The
 * counterparty's revealed contact methods are loaded separately (per group) by
 * {@link loadCounterpartyContacts} and merged in {@link mapTradeRow}.
 * @returns The Kysely select builder for trade DTO rows.
 */
function tradeDtoBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("cardTrades as t")
    .innerJoin("friendGroups as g", "g.id", "t.groupId")
    .innerJoin("users as giverUser", "giverUser.id", "t.giverUserId")
    .innerJoin("users as receiverUser", "receiverUser.id", "t.receiverUserId")
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
      "receiverUser.name as receiverName",
      "receiverUser.image as receiverImage",
      "receiverUser.email as receiverEmail",
    ]);
}

type TradeDtoRow = Awaited<ReturnType<ReturnType<typeof tradeDtoBaseQuery>["execute"]>>[number];

/**
 * Lookup key for a member's revealed contacts: `${groupId}:${userId}`.
 * @returns The composite key string.
 */
function contactsKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

/**
 * Loads, for each trade's counterparty, the contact methods they reveal to that
 * group — one query for all the rows. The viewer's own contacts are never
 * needed (the viewer knows how to reach themselves).
 * @returns A map of `${groupId}:${counterpartyUserId}` → revealed contacts.
 */
async function loadCounterpartyContacts(
  db: Kysely<Database>,
  rows: TradeDtoRow[],
  userId: string,
): Promise<Map<string, ContactMethod[]>> {
  const pairs = rows.map((row) => ({
    groupId: row.groupId,
    counterpartyUserId: row.giverUserId === userId ? row.receiverUserId : row.giverUserId,
  }));
  const lookup = new Map<string, ContactMethod[]>();
  if (pairs.length === 0) {
    return lookup;
  }

  const contactRows = await db
    .selectFrom("friendGroupMemberContacts as fgmc")
    .innerJoin("userContactMethods as ucm", "ucm.id", "fgmc.contactMethodId")
    .select([
      "fgmc.groupId as groupId",
      "fgmc.userId as userId",
      "ucm.id as id",
      "ucm.type as type",
      "ucm.value as value",
    ])
    .where((eb) =>
      eb.or(
        pairs.map((pair) =>
          eb.and([
            eb("fgmc.groupId", "=", pair.groupId),
            eb("fgmc.userId", "=", pair.counterpartyUserId),
          ]),
        ),
      ),
    )
    .orderBy("ucm.sortOrder", "asc")
    .orderBy("ucm.id", "asc")
    .execute();

  for (const row of contactRows) {
    const key = contactsKey(row.groupId, row.userId);
    const list = lookup.get(key) ?? [];
    list.push({ id: row.id, type: row.type, value: row.value });
    lookup.set(key, list);
  }
  return lookup;
}

/**
 * Orient a raw joined row to the viewer (role-relative counterparty + flags).
 * @returns The viewer-oriented trade DTO.
 */
function mapTradeRow(
  row: TradeDtoRow,
  userId: string,
  contactsLookup: Map<string, ContactMethod[]>,
): CardTradeResponse {
  const viewerIsGiver = row.giverUserId === userId;
  const role: CardTradeRole = viewerIsGiver ? "giver" : "receiver";

  const counterpartyUserId = viewerIsGiver ? row.receiverUserId : row.giverUserId;
  const contactMethods = contactsLookup.get(contactsKey(row.groupId, counterpartyUserId)) ?? [];
  const counterparty: CardTradeCounterparty = viewerIsGiver
    ? {
        userId: row.receiverUserId,
        name: row.receiverName,
        image: row.receiverImage,
        gravatarHash: gravatarHashForEmail(row.receiverEmail),
        contactMethods,
      }
    : {
        userId: row.giverUserId,
        name: row.giverName,
        image: row.giverImage,
        gravatarHash: gravatarHashForEmail(row.giverEmail),
        contactMethods,
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
      const contactsLookup = await loadCounterpartyContacts(db, rows, userId);
      return rows.map((row) => mapTradeRow(row, userId, contactsLookup));
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
      if (row === undefined) {
        return undefined;
      }
      const contactsLookup = await loadCounterpartyContacts(db, [row], userId);
      return mapTradeRow(row, userId, contactsLookup);
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
    // gets the email. Delivery follows the recipient's chosen cadence: `instant`
    // emails every request right away, while an `Nmin` cadence debounces a burst
    // into one email. `request_email_sent_at` is the per-trade marker (NULL =
    // queued; the cadence decision lives in the service, not in SQL).

    /**
     * Queued (un-notified) pending request rows, ordered so the flush can group
     * consecutive rows by (recipient, sender). Joins the group for the email's
     * deep link and returns `createdAt` so the service can apply each
     * recipient's debounce window. No window filter here — due-ness is decided
     * per recipient in {@link flushCoalescedTradeRequests}.
     * @returns The queued request rows awaiting an email.
     */
    async listPendingRequestEmails(): Promise<QueuedRequestEmailRow[]> {
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
          t.created_at,
          (CASE WHEN t.initiator = 'giver' THEN t.giver_user_id ELSE t.receiver_user_id END) AS sender_user_id,
          (CASE WHEN t.initiator = 'giver' THEN t.receiver_user_id ELSE t.giver_user_id END) AS recipient_user_id
        FROM card_trades t
        JOIN friend_groups g ON g.id = t.group_id
        WHERE t.status = 'pending'
          AND t.request_email_sent_at IS NULL
          AND t.expires_at > now()
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
     * Queued (un-notified) status transitions awaiting a coalesced email
     * (ADR-030): the still-`reserved` rows whose reserve email hasn't been sent,
     * plus the `declined`/`cancelled` rows whose close email hasn't been sent.
     * System transitions (`last_actor_user_id IS NULL` — auto-cancel, expiry) are
     * excluded: nobody to attribute, and expiry is intentionally silent. The
     * recipient is always the party who didn't act. Ordered so the flush can
     * group consecutive rows by (recipient, actor); due-ness is decided per
     * recipient in {@link flushTradeStatusEmails}.
     * @returns The queued status rows awaiting an email.
     */
    async listPendingStatusEmails(): Promise<QueuedStatusEmailRow[]> {
      const result = await sql<QueuedStatusEmailRow>`
        SELECT
          t.id,
          t.group_id,
          g.slug AS group_slug,
          g.name AS group_name,
          t.card_id,
          t.quantity,
          (CASE WHEN t.status = 'reserved' THEN 'reserved' ELSE t.status END) AS event,
          t.last_actor_user_id AS actor_user_id,
          (CASE WHEN t.last_actor_user_id = t.giver_user_id
                THEN t.receiver_user_id ELSE t.giver_user_id END) AS recipient_user_id,
          t.updated_at AS event_at
        FROM card_trades t
        JOIN friend_groups g ON g.id = t.group_id
        WHERE t.last_actor_user_id IS NOT NULL
          AND (
            (t.status = 'reserved' AND t.reserved_email_sent_at IS NULL)
            OR (t.status IN ('declined', 'cancelled') AND t.closed_email_sent_at IS NULL)
          )
        ORDER BY recipient_user_id, actor_user_id, t.updated_at
      `.execute(db);
      return result.rows;
    },

    /**
     * Stamps the given trades' status-email marker, but only those still
     * un-notified (NULL) — so a concurrent flush tick never double-sends. The
     * reserve and close events use separate marker columns because one trade can
     * fire both across its life (reserved, then cancelled-from-reserved).
     * @returns The ids actually claimed by this call.
     */
    async claimStatusEmails(
      marker: TradeStatusEmailMarker,
      tradeIds: readonly string[],
    ): Promise<string[]> {
      if (tradeIds.length === 0) {
        return [];
      }
      const result = await db
        .updateTable("cardTrades")
        .set({ [marker]: sql`now()` })
        .where("id", "in", [...tradeIds])
        .where(marker, "is", null)
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
    // The reservable supply itself is resolved rule-aware by
    // `friendGroupMatches.giverPrintingSupply` (ADR-034), which mirrors the match
    // view; the methods below only read/write the `card_trade_copies` pins.

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
     * Resizes a still-pending trade's quantity. Guards on `status = 'pending'` so
     * a lost race against accept/decline/cancel matches zero rows. Bumps
     * `updated_at` (a real change to the trade).
     * @returns Rows affected (0 if no longer pending).
     */
    async setPendingQuantity(id: string, byUserId: string, quantity: number): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({ quantity, lastActorUserId: byUserId, updatedAt: sql`now()` })
        .where("id", "=", id)
        .where("status", "=", "pending")
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
