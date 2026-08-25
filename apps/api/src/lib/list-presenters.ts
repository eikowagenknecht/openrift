import type {
  EntrySource,
  Finish,
  ListDetailListResponse,
  ListEntryDetailResponse,
  ListEntryResponse,
  ListResponse,
  ListRules,
  PublicListResponse,
  Rarity,
  TradePreference,
} from "@openrift/shared";
import { hydrateListRules } from "@openrift/shared";
import type { Selectable } from "kysely";

import type { ListEntriesTable, ListsTable } from "../db/index.js";

const EMPTY_TRADE_PREFERENCE: TradePreference = {
  pricePref: null,
  priceAbsoluteCents: null,
  tradeType: null,
};

function tradeDefaultsFromList(
  row: Pick<
    Selectable<ListsTable>,
    "defaultPricePref" | "defaultPriceAbsoluteCents" | "defaultTradeType"
  >,
): TradePreference {
  if (
    row.defaultPricePref === null &&
    row.defaultPriceAbsoluteCents === null &&
    row.defaultTradeType === null
  ) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.defaultPricePref,
    priceAbsoluteCents: row.defaultPriceAbsoluteCents,
    tradeType: row.defaultTradeType,
  };
}

function tradeOverrideFromEntry(
  row: Pick<Selectable<ListEntriesTable>, "pricePref" | "priceAbsoluteCents" | "tradeType">,
): TradePreference {
  if (row.pricePref === null && row.priceAbsoluteCents === null && row.tradeType === null) {
    return EMPTY_TRADE_PREFERENCE;
  }
  return {
    pricePref: row.pricePref,
    priceAbsoluteCents: row.priceAbsoluteCents,
    tradeType: row.tradeType,
  };
}

export function toList(row: Selectable<ListsTable> & { entryCount?: number }): ListResponse {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    kind: row.kind,
    entryCount: row.entryCount ?? 0,
    isPublic: row.isPublic,
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tradeDefaults: tradeDefaultsFromList(row),
    currency: row.currency,
    // The summary only reports whether rules exist; the rules themselves ride
    // only on detail responses (toListDetail).
    hasRule: parseListRules(row.rules).length > 0,
    sidebarHidden: row.sidebarHidden,
  };
}

/**
 * Delegates to the shared `hydrateListRules` so a rule saved before a newer
 * filter dimension existed backfills that dimension instead of emitting a
 * partial filter that fails response output validation.
 */
export function parseListRules(value: ListRules | null | undefined): ListRules {
  return hydrateListRules(value);
}

export function toListDetail(
  row: Selectable<ListsTable> & { entryCount?: number },
): ListDetailListResponse {
  return { ...toList(row), rules: parseListRules(row.rules), ruleCombine: row.ruleCombine };
}

/** Public-facing shape — deliberately omits shareToken, isPublic, userId. */
export function toPublicList(row: Selectable<ListsTable>): PublicListResponse {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tradeDefaults: tradeDefaultsFromList(row),
    currency: row.currency,
  };
}

/**
 * The kind column tells which of cardId/printingId/copyId is non-null per
 * `chk_list_entries_kind_shape` — hence the casts.
 */
export function toListEntry(row: Selectable<ListEntriesTable>): ListEntryResponse {
  const base = {
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    tradeOverride: tradeOverrideFromEntry(row),
  };
  if (row.kind === "card") {
    return { ...base, kind: "card", cardId: row.cardId as string };
  }
  if (row.kind === "printing") {
    return { ...base, kind: "printing", printingId: row.printingId as string };
  }
  return { ...base, kind: "copy", copyId: row.copyId as string };
}

export function toListEntryDetail(
  row:
    | {
        kind: "card";
        id: string | null;
        listId: string;
        quantity: number;
        source: EntrySource;
        ruleQuantity: number;
        cardId: string;
        cardName: string;
        tradeOverride: TradePreference;
      }
    | {
        kind: "printing";
        id: string | null;
        listId: string;
        quantity: number;
        source: EntrySource;
        ruleQuantity: number;
        printingId: string;
        cardName: string;
        setId: string;
        rarity: string;
        finish: string;
        shortCode: string;
        language: string;
        imageId: string | null;
        tradeOverride: TradePreference;
      }
    | {
        kind: "copy";
        id: string | null;
        listId: string;
        quantity: number;
        source: EntrySource;
        ruleQuantity: number;
        copyId: string;
        printingId: string;
        collectionId: string;
        cardName: string;
        setId: string;
        rarity: string;
        finish: string;
        shortCode: string;
        language: string;
        imageId: string | null;
        reserved: boolean;
        onLoan: boolean;
        tradeOverride: TradePreference;
      },
): ListEntryDetailResponse {
  if (row.kind === "card") {
    return {
      kind: "card",
      id: row.id,
      listId: row.listId,
      quantity: row.quantity,
      source: row.source,
      ruleQuantity: row.ruleQuantity,
      cardId: row.cardId,
      cardName: row.cardName,
      tradeOverride: row.tradeOverride,
    };
  }
  if (row.kind === "printing") {
    return {
      kind: "printing",
      id: row.id,
      listId: row.listId,
      quantity: row.quantity,
      source: row.source,
      ruleQuantity: row.ruleQuantity,
      printingId: row.printingId,
      cardName: row.cardName,
      setId: row.setId,
      rarity: row.rarity as Rarity,
      finish: row.finish as Finish,
      shortCode: row.shortCode,
      language: row.language,
      imageId: row.imageId,
      tradeOverride: row.tradeOverride,
    };
  }
  return {
    kind: "copy",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    source: row.source,
    ruleQuantity: row.ruleQuantity,
    copyId: row.copyId,
    printingId: row.printingId,
    // collectionId is deliberately dropped from the wire: clients never consume
    // it, and it leaked the owner's collection to anonymous viewers of
    // public/group-shared lists.
    cardName: row.cardName,
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    reserved: row.reserved,
    onLoan: row.onLoan,
    tradeOverride: row.tradeOverride,
  };
}
