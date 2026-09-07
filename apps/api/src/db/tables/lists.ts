import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import type {
  Currency,
  TradePricePref,
  TradeType,
} from "@openrift/shared/types/api/trade-preferences";
import type { ListRuleCombine, ListRules } from "@openrift/shared/types/list-rule";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface ListsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  defaultPricePref: TradePricePref | null;
  defaultPriceAbsoluteCents: number | null;
  defaultTradeType: TradeType | null;
  currency: Currency | null;
  sortOrder: Generated<number>;
  sidebarHidden: Generated<boolean>;
  rules: ColumnType<ListRules, ListRules | undefined, ListRules>;
  ruleCombine: ListRuleCombine | null;
}

export interface ListEntriesTable {
  id: Generated<string>;
  listId: string;
  userId: string;
  kind: ListKind;
  cardId: string | null;
  printingId: string | null;
  copyId: string | null;
  quantity: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  pricePref: TradePricePref | null;
  priceAbsoluteCents: number | null;
  tradeType: TradeType | null;
}
