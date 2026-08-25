import { TRADED_CARD_TRADE_STATUSES } from "@openrift/shared";
import type {
  CardTradeActionCountsResponse,
  CardTradeInitiator,
  CardTradeLivePhase,
  CardTradeRole,
  CardTradeStatus,
  ContactMethod,
} from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { CardTradesTable, Database } from "../db/index.js";
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
      // The group and both party ids were just written from `values`, so the
      // row is live.
      return {
        ...row,
        groupId: values.groupId,
        giverUserId: values.giverUserId,
        receiverUserId: values.receiverUserId,
      };
    },

    /**
     * Shrinks a settleable trade by `quantity`, reserving that much for a split
     * half. Guarded so it doubles as the split's concurrency control: the
     * caller's own side must still be unsettled, and enough quantity must be
     * left over for the remainder to keep `chk_card_trades_quantity`. Two
     * concurrent partial settles therefore serialize on this row, and the
     * loser matches zero rows rather than driving the quantity negative.
     *
     * Does NOT bump `updated_at`: the swap did not change, it split.
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
     * Inserts the settled half of a split.
     *
     * The caller's settle timestamp goes in on this first statement, which is
     * what keeps the row outside `uq_card_trades_live` — two reserved halves of
     * one swap would otherwise collide on it, and the original keeps the live
     * slot. The other side's timestamp is inherited: once they have settled,
     * both halves are theirs, and the new row is immediately completable.
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
          // Inherits the accept rather than performing one, so it sends no
          // request or reserved email and keeps the original's accepted_at.
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
      // The group and both party ids are inherited from `from`, which is live.
      return {
        ...row,
        groupId: from.groupId,
        giverUserId: from.giverUserId,
        receiverUserId: from.receiverUserId,
      };
    },

    /**
     * Hands `copyIds` from one trade's reservations to another's. The split
     * moves pins rather than dropping them: a split half with no pins would
     * leave the giver nothing to dispose when they settle it.
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

    /**
     * The existing live (pending/reserved) trade for this exact direction, if
     * any — used to reject a duplicate before the DB does.
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

    /**
     * The giver's still-`pending` trades for one printing, across every group.
     * Feeds the unfillable sweep in the card-trades service, which re-reads
     * supply and cancels what can no longer be filled.
     *
     * Ordered oldest first (`created_at`, then `id` to break ties on rows
     * written in the same microsecond) so the sweep's first-come-first-served
     * allocation is stable and reproducible.
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
      // `pending` rules NULL out — deleting a group cancels its live trades —
      // and the filter is what says so to the type system.
      return rows.filter((row): row is PendingGiverTrade => row.groupId !== null);
    },

    /**
     * Distinct printings the giver still has `pending` trades for in one group.
     * A group-scoped supply change (unsharing a trade list) drives the
     * per-printing sweep from this list, so the work stays proportional to the
     * live trades rather than to the list's size.
     */
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
     * Cards the viewer has traded with each other member of a group: for every
     * counterparty, the summed `quantity` of the rows between the two of them
     * whose swap is done. Feeds the members page's per-member "N traded" badge.
     * Members the viewer has traded nothing with are absent from the map.
     *
     * Viewer-scoped, not group-wide. The badge sits next to a person on a page
     * the viewer is reading, so it is read as "what the two of us have traded";
     * a group-wide total put "3 traded" beside a member the viewer had only ever
     * opened three cancelled requests with.
     *
     * The predicate is the SQL twin of `cardTradeState(trade) === "done"` in
     * `@openrift/shared`: completed, or reserved with the *viewer's own* half
     * settled. Testing the viewer's side rather than either side is what keeps
     * the badge from claiming a swap the viewer still owes a settle on, which
     * their trade sheet would be listing as their move at the same moment.
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
        // A counterparty who deleted their account is no longer a member and has
        // no row in the member list this map keys.
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
     * Per-group counts of trades needing the viewer's action, split by which
     * action it is: a request awaiting their answer, or a swap whose own half
     * they haven't confirmed. Mirrors the two `action-needed` cases in
     * `deriveActionNeeded` (`cancel` is deliberately excluded), so `count` is
     * exactly the two split parts summed.
     *
     * The swap half is counted from the moment a trade is accepted, with no
     * grace period. Two people who swap in person and never touch the app would
     * otherwise be reminded by nothing at all, which leaves the giver's copies
     * pinned out of every match view indefinitely. The two halves stay separate
     * badges so this never reads as urgent: a request blocks someone else,
     * while confirming your own half is yours to do whenever the swap happens.
     */
    async actionNeededCountsForUser(
      userId: string,
    ): Promise<CardTradeActionCountsResponse["byGroup"]> {
      // Both predicates drive the row filter and their own count, so the split
      // can never drift from the total the WHERE admits.
      const awaitingResponse = sql<boolean>`(t.status = 'pending' and (
        (t.receiver_user_id = ${userId} and t.initiator = 'giver')
        or (t.giver_user_id = ${userId} and t.initiator = 'receiver')
      ))`;
      // `completed` covers legacy rows that finished before partial settles
      // existed, revived only where a side was still outstanding.
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
     * The viewer's live trades across every group, summed per (printing, role,
     * phase) so a card browser can annotate a cell without loading trades. Live
     * means pending, reserved, or completed-but-not-yet-synced *on the viewer's
     * own side*; terminal rows and an already-synced side are simply absent.
     *
     * One scan with a role CASE rather than a UNION of a giver query and a
     * receiver query. The phase ladder is identical for both sides apart from
     * which `*_sync_applied_at` column counts, so a union would restate the
     * whole ladder twice and give the vocabulary two homes. Both
     * `idx_card_trades_giver` and `idx_card_trades_receiver` lead with the user
     * column, so the `OR` still reaches each side through its own index.
     *
     * Self-trades are rejected at creation, so no row matches both sides and
     * the role CASE is never ambiguous.
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
     * Like {@link filterReservedCopyIds}, but carries the owning trade's status.
     * A pin on a `completed` trade means the giver has not resolved their sync
     * yet, and that trade can no longer be cancelled, so the dispose guard needs
     * the status to name a remedy that actually exists.
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

    // Each transition below guards on the expected source status in the WHERE
    // clause and returns
    // the affected-row count, so a concurrent transition that already moved the
    // row matches zero rows. The service throws 409 on a 0 count, making each
    // transition exactly-once under READ COMMITTED without an explicit row lock.
    // Real transitions bump `updated_at`; the seen / sync-applied writes do not
    // (so the unread rule never spuriously re-flags the counterparty).

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
     * Records the giver resolved their side's sync. A side settles while the
     * trade is still `reserved`; `completed` stays in the guard for legacy
     * rows that reached it with a side outstanding, which is what
     * `assertSettleable` admits too.
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
