import type { CardTradeInitiator, CardTradeRole } from "@openrift/shared/types/api/card-trade";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { LiveCardTrade } from "./card-trades-shared.js";

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

/**
 * Creating a trade, and splitting one when a side settles part of it.
 */
export function cardTradeWritesRepo(db: Kysely<Database>) {
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
  };
}
