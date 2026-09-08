import { TRADED_CARD_TRADE_STATUSES } from "@openrift/shared/card-trade-lifecycle";
import type {
  CardTradeActionCountsResponse,
  CardTradeInitiator,
  CardTradeLivePhase,
  CardTradeRole,
  CardTradeStatus,
} from "@openrift/shared/types/api/card-trade";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { CardTrade, CardTradeDtoRow } from "./card-trades-shared.js";
import { tradeDtoBaseQuery, withCounterpartyContacts } from "./card-trades-shared.js";

function actionNeededPredicates(userId: string) {
  const awaitingResponse = sql<boolean>`(t.status = 'pending' and (
    (t.receiver_user_id = ${userId} and t.initiator = 'giver')
    or (t.giver_user_id = ${userId} and t.initiator = 'receiver')
  ))`;
  // `completed` must stay: legacy rows can be completed with a side still outstanding.
  const awaitingSettle = sql<boolean>`(t.status in ('reserved', 'completed') and (
    (t.giver_user_id = ${userId} and t.giver_sync_applied_at is null)
    or (t.receiver_user_id = ${userId} and t.receiver_sync_applied_at is null)
  ))`;
  return { awaitingResponse, awaitingSettle };
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
 * Trade lookups, a member's trade list, and the aggregate counts derived from
 * the same rows.
 */
export function cardTradeReadsRepo(db: Kysely<Database>) {
  return {
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
      const { awaitingResponse, awaitingSettle } = actionNeededPredicates(userId);
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

    async actionNeededPeopleForUser(userId: string): Promise<number> {
      const { awaitingResponse, awaitingSettle } = actionNeededPredicates(userId);
      const row = await db
        .selectFrom("cardTrades as t")
        .select(
          sql<string>`count(distinct case when t.giver_user_id = ${userId} then t.receiver_user_id else t.giver_user_id end)`.as(
            "people",
          ),
        )
        .where((eb) =>
          eb.or([eb("t.giverUserId", "=", userId), eb("t.receiverUserId", "=", userId)]),
        )
        .where(sql<boolean>`(${awaitingResponse} or ${awaitingSettle})`)
        .executeTakeFirstOrThrow();
      return Number(row.people);
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
  };
}
