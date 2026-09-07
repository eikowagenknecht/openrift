import { TRADED_CARD_TRADE_STATUSES } from "@openrift/shared/card-trade-lifecycle";
import type {
  CardTradeActionCountsResponse,
  CardTradeInitiator,
  CardTradeLivePhase,
  CardTradeRole,
  CardTradeStatus,
} from "@openrift/shared/types/api/card-trade";
import type { ContactMethod } from "@openrift/shared/types/api/contact-method";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CardTradesTable, Database } from "../../../db/index.js";
import type { CardTradeDtoRow } from "../lib/card-trade-presenters.js";

export type CardTrade = Selectable<CardTradesTable>;

/**
 * A trade whose group and both of whose parties still exist.
 *
 * Each of these ids goes NULL only when the thing it named was deleted (an
 * account or a friend group), and both deletion triggers cancel every live
 * trade involved before snapshotting, so a trade missing any of the three is
 * always terminal. Every mutation therefore works on this shape;
 * `loadTradeForParty` in the service is where the narrowing is checked.
 */
export interface LiveCardTrade extends CardTrade {
  groupId: string;
  giverUserId: string;
  receiverUserId: string;
}

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

/**
 * The half of a swap a partial settle splits off. Everything but the quantity
 * and the settle timestamps is inherited from the row being split, so the two
 * halves stay one agreed swap.
 */
export interface NewCardTradeSplit {
  from: LiveCardTrade;
  quantity: number;
  /** Which side is settling, i.e. whose timestamp the new row is stamped with. */
  role: CardTradeRole;
  lastActorUserId: string;
}

export interface TradeListFilters {
  groupId?: string;
  status?: CardTradeStatus;
}

export interface CompletedTradeFeedRow {
  tradeId: string;
  printingId: string;
  cardId: string;
  quantity: number;
  completedAt: Date;
  /** NULL once that party deleted their account; `giverName` then holds the snapshot. */
  giverUserId: string | null;
  giverName: string | null;
  receiverUserId: string | null;
  receiverName: string | null;
}

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

type TradeStatusEmailEvent = "reserved" | "declined" | "cancelled";

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

export interface ReservedCopyPin {
  copyId: string;
  tradeId: string;
  status: CardTradeStatus;
}

export interface PendingGiverTrade {
  id: string;
  groupId: string;
  quantity: number;
  initiator: CardTradeInitiator;
}

/**
 * One aggregated bucket of the viewer's live trades on a printing. Carries no
 * identity: the row is already summed across every group and counterparty.
 */
export interface LiveTradeAnnotationRow {
  printingId: string;
  role: CardTradeRole;
  phase: CardTradeLivePhase;
  tradeCount: number;
  quantity: number;
}

/**
 * Base DTO query: trade + group slug + both parties' user columns. The
 * counterparty's revealed contact methods are loaded separately (per group) by
 * {@link loadCounterpartyContacts} and attached by
 * {@link withCounterpartyContacts}.
 *
 * Every join is outer, for the same reason each time: a deleted account or
 * friend group leaves its id NULL and its display name snapshotted on the
 * trade row, and the trade stays visible to whoever else took part in it. Both
 * the live and the snapshotted name come back for each, so `toCardTradeResponse`
 * can prefer the live one.
 */
function tradeDtoBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("cardTrades as t")
    .leftJoin("friendGroups as g", "g.id", "t.groupId")
    .leftJoin("users as giverUser", "giverUser.id", "t.giverUserId")
    .leftJoin("users as receiverUser", "receiverUser.id", "t.receiverUserId")
    .select([
      "t.id",
      "t.groupId",
      "g.slug as groupSlug",
      "g.name as groupLiveName",
      "t.groupName as groupSnapshotName",
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
      "t.giverName as giverSnapshotName",
      "receiverUser.name as receiverName",
      "receiverUser.image as receiverImage",
      "receiverUser.email as receiverEmail",
      "t.receiverName as receiverSnapshotName",
    ]);
}

type TradeJoinedRow = Awaited<ReturnType<ReturnType<typeof tradeDtoBaseQuery>["execute"]>>[number];

function contactsKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

function counterpartyIdOf(row: TradeJoinedRow, userId: string): string | null {
  return row.giverUserId === userId ? row.receiverUserId : row.giverUserId;
}

/**
 * Loads, for each trade's counterparty, the contact methods they reveal to
 * that group, in one query for all the rows. The viewer's own contacts are
 * never needed. Rows missing either half of the key are skipped: a deleted
 * counterparty has no contacts left to reveal, and contacts are revealed *per
 * group*, so a trade whose group is gone has no scope to look them up in.
 * Both cases are terminal trades, with no action left to coordinate.
 */
async function loadCounterpartyContacts(
  db: Kysely<Database>,
  rows: readonly TradeJoinedRow[],
  userId: string,
): Promise<Map<string, ContactMethod[]>> {
  const pairs: { groupId: string; counterpartyUserId: string }[] = [];
  for (const row of rows) {
    const counterpartyUserId = counterpartyIdOf(row, userId);
    if (counterpartyUserId !== null && row.groupId !== null) {
      pairs.push({ groupId: row.groupId, counterpartyUserId });
    }
  }
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
 * Attaches each row's own contacts out of the pooled lookup, so a DTO row
 * carries everything the presenter needs.
 */
async function withCounterpartyContacts(
  db: Kysely<Database>,
  rows: readonly TradeJoinedRow[],
  userId: string,
): Promise<CardTradeDtoRow[]> {
  const contactsLookup = await loadCounterpartyContacts(db, rows, userId);
  return rows.map((row) => {
    const counterpartyUserId = counterpartyIdOf(row, userId);
    const counterpartyContacts =
      counterpartyUserId === null || row.groupId === null
        ? []
        : (contactsLookup.get(contactsKey(row.groupId, counterpartyUserId)) ?? []);
    return { ...row, counterpartyContacts };
  });
}

/**
 * Trade execution data access. Pure queries/mutations — the orchestration
 * (validation, reservation transactions, copy-mutation sync) lives in the
 * card-trades *service*. `updated_at` is maintained explicitly here on real
 * transitions only (not on the private sync-applied writes), driving the
 * newest-first ordering of a member's trade list.
 */
export function cardTradesRepo(db: Kysely<Database>) {
  return {
    async create(values: NewCardTrade): Promise<LiveCardTrade> {
      const row = await db
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
      return {
        ...row,
        groupId: values.groupId,
        giverUserId: values.giverUserId,
        receiverUserId: values.receiverUserId,
      };
    },

    /**
     * The row filters (unsettled caller side, `quantity` strictly less than the total)
     * are the only concurrency control on a partial settle; a losing concurrent call matches zero rows.
     * Does not bump `updated_at`.
     */
    async reserveQuantityForSplit(
      id: string,
      quantity: number,
      role: CardTradeRole,
    ): Promise<number> {
      const settledColumn =
        role === "giver" ? ("giverSyncAppliedAt" as const) : ("receiverSyncAppliedAt" as const);
      const result = await db
        .updateTable("cardTrades")
        .set({ quantity: sql`quantity - ${quantity}` })
        .where("id", "=", id)
        .where("status", "in", ["reserved", "completed"])
        .where(settledColumn, "is", null)
        .where("quantity", ">", quantity)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * The caller's settle timestamp must be set on insert, or the new row collides
     * with the original on `uq_card_trades_live`.
     */
    async createSettledSplit(values: NewCardTradeSplit): Promise<LiveCardTrade> {
      const { from, role } = values;
      const settledNow = sql<Date>`now()`;
      const row = await db
        .insertInto("cardTrades")
        .values({
          groupId: from.groupId,
          giverUserId: from.giverUserId,
          receiverUserId: from.receiverUserId,
          initiator: from.initiator,
          printingId: from.printingId,
          cardId: from.cardId,
          quantity: values.quantity,
          // Sets status directly to "reserved": no request/reserved email is sent.
          status: "reserved",
          acceptedAt: from.acceptedAt,
          expiresAt: from.expiresAt,
          receiverWishEntryId: from.receiverWishEntryId,
          lastActorUserId: values.lastActorUserId,
          giverSyncAppliedAt: role === "giver" ? settledNow : from.giverSyncAppliedAt,
          receiverSyncAppliedAt: role === "receiver" ? settledNow : from.receiverSyncAppliedAt,
          // Both halves were announced by the original's emails.
          requestEmailSentAt: from.requestEmailSentAt,
          reservedEmailSentAt: from.reservedEmailSentAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        ...row,
        groupId: from.groupId,
        giverUserId: from.giverUserId,
        receiverUserId: from.receiverUserId,
      };
    },

    /**
     * A split half must keep its pins, or the giver has nothing to dispose when they settle it.
     */
    async reassignCopies(fromTradeId: string, toTradeId: string, copyIds: string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db
        .updateTable("cardTradeCopies")
        .set({ tradeId: toTradeId })
        .where("tradeId", "=", fromTradeId)
        .where("copyId", "in", copyIds)
        .execute();
    },

    getById(id: string): Promise<CardTrade | undefined> {
      return db.selectFrom("cardTrades").selectAll().where("id", "=", id).executeTakeFirst();
    },

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

    /**
     * Must stay ordered oldest first (`created_at`, then `id` to break same-microsecond ties)
     * for the caller's first-come-first-served allocation.
     */
    async listPendingForGiverPrinting(
      giverUserId: string,
      printingId: string,
    ): Promise<PendingGiverTrade[]> {
      const rows = await db
        .selectFrom("cardTrades")
        .select(["id", "groupId", "quantity", "initiator"])
        .where("giverUserId", "=", giverUserId)
        .where("printingId", "=", printingId)
        .where("status", "=", "pending")
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .execute();
      // groupId is nullable in the schema, but a `pending` row's group can't be deleted.
      return rows.filter((row): row is PendingGiverTrade => row.groupId !== null);
    },

    async listPendingPrintingIdsForGiverInGroup(
      groupId: string,
      giverUserId: string,
    ): Promise<string[]> {
      const rows = await db
        .selectFrom("cardTrades")
        .select("printingId")
        .distinct()
        .where("groupId", "=", groupId)
        .where("giverUserId", "=", giverUserId)
        .where("status", "=", "pending")
        .execute();
      return rows.map((row) => row.printingId);
    },

    async listDtoRowsForUser(
      userId: string,
      filters: TradeListFilters = {},
    ): Promise<CardTradeDtoRow[]> {
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
      return withCounterpartyContacts(db, rows, userId);
    },

    /**
     * Total cards ever traded in a group: the sum of `quantity` over its traded
     * rows. Feeds the group hero's "N cards traded" stat — a lifetime count,
     * unlike the bounded activity feed. Group-wide on purpose: the hero is about
     * the group, not about the viewer.
     *
     * A trade counts from the *first* settle, not from completion. Waiting for
     * both would permanently undercount every swap whose second side never
     * confirms.
     *
     * The status test is not redundant with the timestamps. A row keeps its sync
     * columns when `cancelForDepartingMember` bulk-cancels a leaving member's
     * live trades, so a predicate on the timestamps alone counted those forever;
     * `TRADED_CARD_TRADE_STATUSES` is what excludes them.
     */
    async countCompletedCardsInGroup(groupId: string): Promise<number> {
      const row = await db
        .selectFrom("cardTrades")
        .select((eb) => eb.cast<number>(eb.fn.sum(eb.ref("quantity")), "integer").as("total"))
        .where("groupId", "=", groupId)
        .where("status", "in", [...TRADED_CARD_TRADE_STATUSES])
        .where((eb) =>
          eb.or([
            eb("giverSyncAppliedAt", "is not", null),
            eb("receiverSyncAppliedAt", "is not", null),
          ]),
        )
        .executeTakeFirst();
      return row?.total ?? 0;
    },

    /**
     * The predicate must mirror `cardTradeState(trade) === "done"` in `@openrift/shared`:
     * completed, or reserved with the viewer's own half settled.
     */
    async countTradedCardsWithViewerInGroup(
      groupId: string,
      viewerUserId: string,
    ): Promise<Map<string, number>> {
      const sideTotals = (viewerSide: "giverUserId" | "receiverUserId") => {
        const otherSide = viewerSide === "giverUserId" ? "receiverUserId" : "giverUserId";
        const viewerSync =
          viewerSide === "giverUserId" ? "giverSyncAppliedAt" : "receiverSyncAppliedAt";
        return db
          .selectFrom("cardTrades")
          .select((eb) => [
            eb.ref(otherSide).as("userId"),
            eb.cast<number>(eb.fn.sum(eb.ref("quantity")), "integer").as("total"),
          ])
          .where("groupId", "=", groupId)
          .where(viewerSide, "=", viewerUserId)
          .where((eb) =>
            eb.or([
              eb("status", "=", "completed"),
              eb.and([eb("status", "=", "reserved"), eb(viewerSync, "is not", null)]),
            ]),
          )
          .groupBy(otherSide)
          .execute();
      };
      const [given, received] = await Promise.all([
        sideTotals("giverUserId"),
        sideTotals("receiverUserId"),
      ]);
      const totals = new Map<string, number>();
      for (const row of [...given, ...received]) {
        // row.userId is null when the counterparty's account was deleted.
        if (row.userId !== null) {
          totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.total);
        }
      }
      return totals;
    },

    async recentCompletedInGroup(groupId: string, limit: number): Promise<CompletedTradeFeedRow[]> {
      const rows = await db
        .selectFrom("cardTrades as t")
        .leftJoin("users as giver", "giver.id", "t.giverUserId")
        .leftJoin("users as receiver", "receiver.id", "t.receiverUserId")
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
          "t.giverName as giverSnapshotName",
          "t.receiverName as receiverSnapshotName",
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
        giverName: row.giverName ?? row.giverSnapshotName,
        receiverUserId: row.receiverUserId,
        receiverName: row.receiverName ?? row.receiverSnapshotName,
      }));
    },

    async getDtoRowByIdForUser(id: string, userId: string): Promise<CardTradeDtoRow | undefined> {
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
      const [withContacts] = await withCounterpartyContacts(db, [row], userId);
      return withContacts;
    },

    /**
     * Must mirror the two `action-needed` cases in `deriveActionNeeded` (`cancel` is
     * deliberately excluded), or `count` stops equaling the two split parts summed.
     */
    async actionNeededCountsForUser(
      userId: string,
    ): Promise<CardTradeActionCountsResponse["byGroup"]> {
      const awaitingResponse = sql<boolean>`(t.status = 'pending' and (
        (t.receiver_user_id = ${userId} and t.initiator = 'giver')
        or (t.giver_user_id = ${userId} and t.initiator = 'receiver')
      ))`;
      // `completed` must stay: legacy rows can be completed with a side still outstanding.
      const awaitingSettle = sql<boolean>`(t.status in ('reserved', 'completed') and (
        (t.giver_user_id = ${userId} and t.giver_sync_applied_at is null)
        or (t.receiver_user_id = ${userId} and t.receiver_sync_applied_at is null)
      ))`;
      const rows = await db
        .selectFrom("cardTrades as t")
        .innerJoin("friendGroups as g", "g.id", "t.groupId")
        .select(["g.id as groupId", "g.slug as groupSlug"])
        .select([
          sql<string>`count(*) filter (where ${awaitingResponse})`.as("respondCount"),
          sql<string>`count(*) filter (where ${awaitingSettle})`.as("settleCount"),
        ])
        .where((eb) =>
          eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
        )
        .where(sql<boolean>`(${awaitingResponse} or ${awaitingSettle})`)
        .groupBy(["g.id", "g.slug"])
        .execute();
      return rows.map((row) => {
        const respondCount = Number(row.respondCount);
        const settleCount = Number(row.settleCount);
        return {
          groupId: row.groupId,
          groupSlug: row.groupSlug,
          count: respondCount + settleCount,
          respondCount,
          settleCount,
        };
      });
    },

    /**
     * The role CASE assumes no row matches both sides (self-trades are rejected at creation).
     * `idx_card_trades_giver`/`_receiver` both lead with the user column, so the `OR` still uses an index per side.
     */
    async liveAnnotationsForUser(userId: string): Promise<LiveTradeAnnotationRow[]> {
      const result = await sql<LiveTradeAnnotationRow>`
        SELECT
          printing_id,
          role,
          phase,
          count(*)::int AS trade_count,
          sum(quantity)::int AS quantity
        FROM (
          SELECT
            t.printing_id,
            t.quantity,
            (CASE WHEN t.giver_user_id = ${userId} THEN 'giver' ELSE 'receiver' END) AS role,
            -- The WHERE below admits nothing but these three cases.
            (CASE
              WHEN t.status = 'pending' AND t.initiator = 'receiver' THEN 'asked'
              WHEN t.status = 'pending' AND t.initiator = 'giver' THEN 'offered'
              ELSE 'reserved'
            END) AS phase
          FROM card_trades t
          -- A side the viewer has already settled drops out: the giver's copies
          -- are gone and the receiver's are ordinary owned copies, so there is
          -- nothing left to annotate. That is why the phase ladder stops at
          -- reserved.
          WHERE (t.giver_user_id = ${userId} OR t.receiver_user_id = ${userId})
            AND (
              t.status = 'pending'
              OR (t.status = 'reserved' AND (
                (t.giver_user_id = ${userId} AND t.giver_sync_applied_at IS NULL)
                OR (t.receiver_user_id = ${userId} AND t.receiver_sync_applied_at IS NULL)
              ))
            )
        ) live
        GROUP BY printing_id, role, phase
      `.execute(db);
      return result.rows;
    },

    /**
     * Queued (un-notified) pending request rows, ordered so the flush can group
     * consecutive rows by (recipient, sender). Joins the group for the email's
     * deep link and returns `createdAt` so the service can apply each
     * recipient's debounce window. No window filter here — due-ness is decided
     * per recipient in {@link flushCoalescedTradeRequests}.
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
     * Stamps the given trades as emailed and returns the ids actually claimed:
     * only those still un-notified (NULL), so the flush never double-claims a
     * trade the instant path took concurrently. Used both to mark a coalesced
     * email sent and to suppress an opted-out recipient's queue.
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
     * Queued (un-notified) status transitions awaiting a coalesced email: the
     * still-`reserved` rows whose reserve email hasn't been sent, plus the
     * `declined`/`cancelled` rows whose close email hasn't been sent. System
     * transitions (`last_actor_user_id IS NULL` — auto-cancel, expiry) are
     * excluded: nobody to attribute, and expiry is intentionally silent. The
     * recipient is always the party who didn't act. Ordered so the flush can
     * group consecutive rows by (recipient, actor); due-ness is decided per
     * recipient in {@link flushTradeStatusEmails}.
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
     * Stamps the given trades' status-email marker and returns the ids
     * actually claimed: only those still un-notified (NULL), so a concurrent
     * flush tick never double-sends. The reserve and close events use separate
     * marker columns because one trade can fire both across its life
     * (reserved, then cancelled-from-reserved).
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
     * Cancels the departing member's live (pending/reserved) trades in this
     * group and releases their reserved copies. Runs inside the caller's
     * transaction (the leave or kick handler), so `db` here is the
     * transaction-bound repo.
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

    /**
     * Pins copies to a trade; `UNIQUE(copy_id)` rejects a copy already claimed
     * by another live trade. The reservable supply itself is resolved
     * rule-aware by `friendGroupMatches.giverPrintingSupply`, which mirrors
     * the match view — the pin methods here only read/write the
     * `card_trade_copies` rows.
     */
    async pinCopies(tradeId: string, copyIds: readonly string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db
        .insertInto("cardTradeCopies")
        .values(copyIds.map((copyId) => ({ tradeId, copyId })))
        .execute();
    },

    async listReservedCopyIds(tradeId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("cardTradeCopies")
        .select("copyId")
        .where("tradeId", "=", tradeId)
        .execute();
      return rows.map((row) => row.copyId);
    },

    async deleteCopiesForTrade(tradeId: string): Promise<void> {
      await db.deleteFrom("cardTradeCopies").where("tradeId", "=", tradeId).execute();
    },

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
     * A `completed` trade cannot be cancelled, so the caller needs the status to offer a valid remedy.
     */
    async listReservationsForCopies(copyIds: readonly string[]): Promise<ReservedCopyPin[]> {
      if (copyIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("cardTradeCopies as ctc")
        .innerJoin("cardTrades as t", "t.id", "ctc.tradeId")
        .select(["ctc.copyId", "ctc.tradeId", "t.status"])
        .where("ctc.copyId", "in", [...copyIds])
        .execute();
      return rows;
    },

    // Each transition below guards on the expected source status and returns the affected-row
    // count; a concurrent transition that already moved the row must match zero rows.

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
     * reserved → completed, but only once both sides have settled their own
     * half. Completion is derived, never asserted by a party, so this is the
     * only writer of `completed`.
     *
     * Both sync guards are part of the WHERE, so the first settler's call
     * matches zero rows and the second one promotes, in whichever order they
     * arrive. `byUserId` therefore records who settled second.
     */
    async markCompletedWhenBothSettled(id: string, byUserId: string): Promise<number> {
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
        .where("giverSyncAppliedAt", "is not", null)
        .where("receiverSyncAppliedAt", "is not", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

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
     * `completed` must stay in the status guard, matching `assertSettleable`: legacy rows
     * can reach `completed` with a side still outstanding.
     */
    async setGiverSyncApplied(id: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({ giverSyncAppliedAt: sql`now()` })
        .where("id", "=", id)
        .where("status", "in", ["reserved", "completed"])
        .where("giverSyncAppliedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Records the receiver resolved their side's sync. Same status window as
     * {@link setGiverSyncApplied}.
     */
    async setReceiverSyncApplied(id: string): Promise<number> {
      const result = await db
        .updateTable("cardTrades")
        .set({ receiverSyncAppliedAt: sql`now()` })
        .where("id", "=", id)
        .where("status", "in", ["reserved", "completed"])
        .where("receiverSyncAppliedAt", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },
  };
}
