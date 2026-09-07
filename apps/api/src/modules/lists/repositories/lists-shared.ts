import type { EntrySource } from "@openrift/shared/types/api/list";
import type { TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Finish, Rarity } from "@openrift/shared/types/enums";

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

interface ListEntryRowBase {
  /** Real `list_entries.id` for manual/both entries; `null` for rule-only. */
  id: string | null;
  listId: string;
  quantity: number;
  source: EntrySource;
  /** The rules' additive contribution to `quantity`; 0 for manual-only. */
  ruleQuantity: number;
  cardName: string;
  tradeOverride: TradePreference;
}

interface ListEntryRowPrintingFields {
  setId: string;
  rarity: Rarity;
  finish: Finish;
  shortCode: string;
  language: string;
  imageId: string | null;
}

export type ListEntryRow =
  | (ListEntryRowBase & { kind: "card"; cardId: string })
  | (ListEntryRowBase & ListEntryRowPrintingFields & { kind: "printing"; printingId: string })
  | (ListEntryRowBase &
      ListEntryRowPrintingFields & {
        kind: "copy";
        copyId: string;
        printingId: string;
        collectionId: string;
        /** True when the copy is pinned to a live in-app trade. */
        reserved: boolean;
        /** True when the copy is out on a live loan. */
        onLoan: boolean;
      });

export function tradeOverrideFromRow(row: {
  pricePref: string | null;
  priceAbsoluteCents: number | null;
  tradeType: string | null;
}): TradePreference {
  if (row.pricePref === null && row.priceAbsoluteCents === null && row.tradeType === null) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.pricePref as TradePreference["pricePref"],
    priceAbsoluteCents: row.priceAbsoluteCents,
    tradeType: row.tradeType as TradePreference["tradeType"],
  };
}
