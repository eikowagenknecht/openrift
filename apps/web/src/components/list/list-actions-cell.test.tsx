import type { CardTradeLiveAnnotation, ListEntryDetailResponse, Printing } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListActionsCell } from "@/components/list/list-actions-cell";
import { buildListTradeIndex } from "@/components/list/list-trade-status";
import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

// Two printings of one card: the wish entry names the card, the trade lands on
// the printing the entry never mentions.
const wished = stubPrinting({ id: "printing-a1", cardId: "card-a" });
const wishedSibling = stubPrinting({ id: "printing-a2", cardId: "card-a" });

const CATALOG: Record<string, Printing> = {
  [wished.id]: wished,
  [wishedSibling.id]: wishedSibling,
};

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: wished.id,
    role: "giver",
    phase: "reserved",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

const ENTRY_BASE = {
  id: "entry-1",
  listId: "list-1",
  quantity: 1,
  ruleQuantity: 0,
  tradeOverride: EMPTY_TRADE_PREFERENCE,
  source: "manual",
  cardName: "Ionian Sentry",
} as const;

const PRINTING_FIELDS = {
  setId: wished.setId,
  rarity: wished.rarity,
  finish: wished.finish,
  shortCode: wished.shortCode,
  language: wished.language,
  imageId: null,
} as const;

const copyRow: ListEntryDetailResponse = {
  ...ENTRY_BASE,
  kind: "copy",
  copyId: "copy-1",
  printingId: wished.id,
  ...PRINTING_FIELDS,
  reserved: true,
  onLoan: false,
};

const wishRow: ListEntryDetailResponse = { ...ENTRY_BASE, kind: "card", cardId: "card-a" };

function renderCell(entry: ListEntryDetailResponse, annotations: CardTradeLiveAnnotation[]) {
  render(
    <ListActionsCell
      printing={wished}
      itemId="item-1"
      kind={entry.kind === "copy" ? "copy" : "card"}
      entryByItemId={new Map([["item-1", entry]])}
      entriesByPrintingId={new Map()}
      tradeIndex={buildListTradeIndex(annotations, CATALOG)}
      supportsTradePrefs={false}
      listTradeDefaults={EMPTY_TRADE_PREFERENCE}
      listCurrency={null}
      onEditTradePref={vi.fn()}
      onRemoveEntry={vi.fn()}
      onQuantityChange={vi.fn()}
      onTakeOff={vi.fn()}
      isRemovePendingFor={() => false}
      isQuantityPendingFor={() => false}
    />,
  );
}

describe("ListActionsCell trade status", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows nothing on a free copy when no trade touches its printing", () => {
    renderCell({ ...copyRow, reserved: false }, []);
    expect(screen.queryByText("Reserved")).not.toBeInTheDocument();
    expect(screen.queryByText("Traded")).not.toBeInTheDocument();
  });

  // The list payload and the live-trade feed are two queries, so the entries
  // land first. The pinned copy keeps its marker across that gap.
  it("keeps a pinned copy marked while the live-trade feed is still empty", () => {
    renderCell(copyRow, []);
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });

  it("still says Reserved for a pinned copy whose trade is only accepted", () => {
    renderCell(copyRow, [annotation({ phase: "reserved" })]);
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });

  // Wish lists are card- or printing-kind and carry no `reserved` flag, so they
  // could never show a trade status at all before.
  it("gives a card-kind wish row the incoming status of any printing of the card", () => {
    renderCell(wishRow, [
      annotation({ printingId: wishedSibling.id, role: "receiver", phase: "reserved" }),
    ]);
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });

  it("names the phase on an incoming wish row that is only requested", () => {
    renderCell(wishRow, [annotation({ role: "receiver", phase: "asked" })]);
    expect(screen.getByText("Requested")).toBeInTheDocument();
  });
});
