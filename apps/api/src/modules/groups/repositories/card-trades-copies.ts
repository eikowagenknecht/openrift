import type { CardTradeStatus } from "@openrift/shared/types/api/card-trade";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface ReservedCopyPin {
  copyId: string;
  tradeId: string;
  status: CardTradeStatus;
}

/**
 * The `card_trade_copies` pins that reserve a giver's copies for a trade.
 */
export function cardTradeCopiesRepo(db: Kysely<Database>) {
  return {
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
  };
}
