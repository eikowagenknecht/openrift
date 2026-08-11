import type {
  CardTradeActionCountsResponse,
  CardTradeActionNeeded,
  CardTradeCounterparty,
  CardTradeInitiator,
  CardTradeLivePhase,
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

/**
 * The half of a swap a partial settle splits off (ADR-019, amendment
 * 2026-08-10). Everything but the quantity and the settle timestamps is
 * inherited from the row being split, so the two halves stay one agreed swap.
 */
export interface NewCardTradeSplit {
  from: CardTrade;
  quantity: number;
  /** Which side is settling, i.e. whose timestamp the new row is stamped with. */
  role: CardTradeRole;
  lastActorUserId: string;
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

/** One `card_trade_copies` pin plus the status of the trade holding it. */
export interface ReservedCopyPin {
  copyId: string;
  tradeId: string;
  status: CardTradeStatus;
}

/** A still-`pending` trade of one giver+printing, for the unfillable sweep. */
export interface PendingGiverTrade {
  id: string;
  groupId: string;
  quantity: number;
  initiator: CardTradeInitiator;
}

/**
 * One aggregated bucket of the viewer's live trades on a printing, as
 * {@link cardTradesRepo.liveAnnotationsForUser} reads it. Carries no identity:
 * the row is already summed across every group and counterparty.
 */
export interface LiveTradeAnnotationRow {
  printingId: string;
  role: CardTradeRole;
  phase: CardTradeLivePhase;
  tradeCount: number;
  quantity: number;
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
  // One action covers both the physical claim and its data change: the viewer
  // settles their own half ("handed over" / "got them"), and the second settle
  // promotes the trade. A side that has already settled has nothing left to do
  // and waits on the other party (ADR-019, amendment 2026-08-10).
  if (status === "reserved") {
    return viewerSyncAppliedAt === null ? "settle" : null;
  }
  // Only rows predating the amendment can be `completed` with a side still
  // outstanding; the migration revived the rest. They keep their settle action.
  if (status === "completed") {
    return viewerSyncAppliedAt === null ? "settle" : null;
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

    /**
     * Shrinks a settleable trade by `quantity`, reserving that much for a split
     * half. Guarded so it doubles as the split's concurrency control: the
     * caller's own side must still be unsettled, and enough quantity must be
     * left over for the remainder to keep `chk_card_trades_quantity`. Two
     * concurrent partial settles therefore serialize on this row, and the
     * loser matches zero rows rather than driving the quantity negative.
     *
     * Does NOT bump `updated_at`: the swap did not change, it split.
     * @returns Rows affected (0 when the caller's side is settled, the trade is
     * no longer settleable, or `quantity` does not leave a positive remainder).
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
     * Inserts the settled half of a split (ADR-019, amendment 2026-08-10).
     *
     * The caller's settle timestamp goes in on this first statement, which is
     * what keeps the row outside `uq_card_trades_live` — two reserved halves of
     * one swap would otherwise collide on it, and the original keeps the live
     * slot. The other side's timestamp is inherited: once they have settled,
     * both halves are theirs, and the new row is immediately completable.
     * @returns The created row.
     */
    createSettledSplit(values: NewCardTradeSplit): Promise<CardTrade> {
      const { from, role } = values;
      const settledNow = sql<Date>`now()`;
      return db
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
    },

    /**
     * Hands `copyIds` from one trade's reservations to another's. The split
     * moves pins rather than dropping them: a split half with no pins would
     * leave the giver nothing to dispose when they settle it.
     * @returns Nothing.
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

    /**
     * The giver's still-`pending` trades for one printing, across every group.
     * Feeds the unfillable sweep in the card-trades service, which re-reads
     * supply and cancels what can no longer be filled (ADR-019).
     *
     * Ordered oldest first (`created_at`, then `id` to break ties on rows
     * written in the same microsecond) so the sweep's first-come-first-served
     * allocation is stable and reproducible.
     * @returns The pending rows, oldest first.
     */
    listPendingForGiverPrinting(
      giverUserId: string,
      printingId: string,
    ): Promise<PendingGiverTrade[]> {
      return db
        .selectFrom("cardTrades")
        .select(["id", "groupId", "quantity", "initiator"])
        .where("giverUserId", "=", giverUserId)
        .where("printingId", "=", printingId)
        .where("status", "=", "pending")
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .execute();
    },

    /**
     * Distinct printings the giver still has `pending` trades for in one group.
     * A group-scoped supply change (unsharing a trade list) drives the
     * per-printing sweep from this list, so the work stays proportional to the
     * live trades rather than to the list's size.
     * @returns The printing ids, unordered.
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
    /**
     * Total cards ever traded in a group: the sum of `quantity` over its traded
     * rows. Feeds the group hero's "N cards traded" stat — a lifetime count,
     * unlike the bounded activity feed.
     *
     * A trade counts from the *first* settle, not from completion (ADR-019,
     * amendment 2026-08-10). Waiting for both would permanently undercount every
     * swap whose second side never confirms, and would read lower than the old
     * model, where one unilateral "mark as traded" counted at once. Testing the
     * two timestamps rather than the status covers both shapes in one predicate:
     * a completed row always has both set, a half-settled one has exactly one,
     * and a cancelled or expired row has neither.
     * @returns The summed quantity (0 for a group with nothing traded).
     */
    async countCompletedCardsInGroup(groupId: string): Promise<number> {
      const row = await db
        .selectFrom("cardTrades")
        .select((eb) => eb.cast<number>(eb.fn.sum(eb.ref("quantity")), "integer").as("total"))
        .where("groupId", "=", groupId)
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
     * Lifetime cards traded per member of a group: for each user, the sum of
     * `quantity` over the group's traded rows they took part in, as giver or
     * receiver. Feeds the members page's per-member traded counts. Members with
     * nothing traded are absent from the map.
     *
     * Counts from the first settle, on the same predicate and for the same
     * reason as {@link countCompletedCardsInGroup}.
     * @returns userId → summed quantity.
     */
    async countCompletedCardsByMemberInGroup(groupId: string): Promise<Map<string, number>> {
      const sideTotals = (side: "giverUserId" | "receiverUserId") =>
        db
          .selectFrom("cardTrades")
          .select((eb) => [
            eb.ref(side).as("userId"),
            eb.cast<number>(eb.fn.sum(eb.ref("quantity")), "integer").as("total"),
          ])
          .where("groupId", "=", groupId)
          .where((eb) =>
            eb.or([
              eb("giverSyncAppliedAt", "is not", null),
              eb("receiverSyncAppliedAt", "is not", null),
            ]),
          )
          .groupBy(side)
          .execute();
      const [given, received] = await Promise.all([
        sideTotals("giverUserId"),
        sideTotals("receiverUserId"),
      ]);
      const totals = new Map<string, number>();
      for (const row of [...given, ...received]) {
        totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.total);
      }
      return totals;
    },

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
     * @returns One entry per group with at least one such trade.
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
      // `completed` is here for rows predating the 2026-08-10 amendment, which
      // the migration revived only where a side was still outstanding.
      const awaitingSettle = sql<boolean>`(t.status in ('reserved', 'completed') and (
        (t.giver_user_id = ${userId} and t.giver_sync_applied_at is null)
        or (t.receiver_user_id = ${userId} and t.receiver_sync_applied_at is null)
      ))`;
      const rows = await db
        .selectFrom("cardTrades as t")
        .innerJoin("friendGroups as g", "g.id", "t.groupId")
        .select(["t.groupId as groupId", "g.slug as groupSlug"])
        .select([
          sql<string>`count(*) filter (where ${awaitingResponse})`.as("respondCount"),
          sql<string>`count(*) filter (where ${awaitingSettle})`.as("settleCount"),
        ])
        .where((eb) =>
          eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
        )
        .where(sql<boolean>`(${awaitingResponse} or ${awaitingSettle})`)
        .groupBy(["t.groupId", "g.slug"])
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
     * @returns One row per (printing, role, phase); unordered.
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
          -- reserved (ADR-019, amendment 2026-08-10).
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

    /**
     * Like {@link filterReservedCopyIds}, but carries the owning trade's status.
     * A pin on a `completed` trade means the giver has not resolved their sync
     * yet, and that trade can no longer be cancelled, so the dispose guard needs
     * the status to name a remedy that actually exists (ADR-019).
     * @returns One row per pinned copy in `copyIds`.
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
     * reserved → completed, but only once both sides have settled their own
     * half. Completion is derived, never asserted by a party (ADR-019,
     * amendment 2026-08-10), so this is the only writer of `completed`.
     *
     * Both sync guards are part of the WHERE, so the first settler's call
     * matches zero rows and the second one promotes, in whichever order they
     * arrive. `byUserId` therefore records who settled second.
     * @returns Rows affected (0 while either side is still outstanding).
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
     * Records the giver resolved their side's sync. Guards on settleable + unset
     * so a concurrent double-apply matches zero rows. Does NOT bump `updated_at`.
     *
     * A side settles while the trade is still `reserved`; `completed` stays in the
     * guard for rows that reached it with a side outstanding, which is what
     * `assertSettleable` admits too.
     * @returns Rows affected (0 if not settleable or already resolved).
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
     * Records the receiver resolved their side's sync. Guards on settleable + unset
     * so a concurrent double-apply matches zero rows. Does NOT bump `updated_at`.
     * Same status window as {@link setGiverSyncApplied}.
     * @returns Rows affected (0 if not settleable or already resolved).
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
