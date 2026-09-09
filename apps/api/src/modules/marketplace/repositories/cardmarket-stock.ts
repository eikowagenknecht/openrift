import type { Marketplace } from "@openrift/shared/types/pricing";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface CardmarketProductPrintingRow {
  externalId: number;
  finish: string;
  productName: string;
  printingId: string | null;
  language: string | null;
}

const CARDMARKET: Marketplace = "cardmarket";

export function cardmarketStockRepo(db: Kysely<Database>) {
  return {
    /**
     * Every printing behind the given Cardmarket products, both finishes. A row
     * with a null `printingId` is a product nobody has mapped yet.
     */
    productPrintings(externalIds: number[]): Promise<CardmarketProductPrintingRow[]> {
      if (externalIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("marketplaceProducts as p")
        .leftJoin("marketplaceProductVariants as v", "v.marketplaceProductId", "p.id")
        .leftJoin("printings as pr", "pr.id", "v.printingId")
        .where("p.marketplace", "=", CARDMARKET)
        .where("p.externalId", "in", [...new Set(externalIds)])
        .select(["p.externalId", "p.finish", "p.productName", "v.printingId", "pr.language"])
        .execute();
    },
  };
}
