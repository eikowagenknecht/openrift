import type {
  CardTradeLiveAnnotation,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListActionsCell } from "@/features/lists/components/list-actions-cell";
import { buildListTradeIndex } from "@/features/lists/components/list-trade-status";
import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
  } & ComponentProps<"a">) => {
    let path = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      path = path.replace(`$${key}`, value);
    }
    return (
      <a href={path} {...props}>
        {children}
      </a>
    );
  },
}));

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

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "summoner-skirmish",
    groupName: "Summoner Skirmish",
    role: "receiver",
    initiator: "receiver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    printingId: wished.id,
    cardId: "card-a",
    quantity: 1,
    status: "reserved",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T10:00:00.000Z",
    completedAt: null,
    closedAt: null,
    expiresAt: null,
    viewerSyncAppliedAt: null,
    counterpartySyncAppliedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

function renderCell(
  entry: ListEntryDetailResponse,
  annotations: CardTradeLiveAnnotation[],
  trades: CardTradeResponse[] = [],
) {
  render(
    <ListActionsCell
      printing={wished}
      itemId="item-1"
      kind={entry.kind === "copy" ? "copy" : "card"}
      entryByItemId={new Map([["item-1", entry]])}
      entriesByPrintingId={new Map()}
      tradeIndex={buildListTradeIndex(annotations, CATALOG, trades)}
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

  // Wish lists are card- or printing-kind and carry no `reserved` flag.
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

  it("links a reserved wish row to the trade sheet of the person holding it", () => {
    renderCell(
      wishRow,
      [annotation({ printingId: wishedSibling.id, role: "receiver", phase: "reserved" })],
      [stubTrade({ printingId: wishedSibling.id })],
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trades/user-2");
  });

  it("leaves the row unlinked when the trade is on a printing the chip doesn't show", () => {
    renderCell(
      wishRow,
      [annotation({ printingId: wishedSibling.id, role: "receiver", phase: "reserved" })],
      [stubTrade({ printingId: wished.id })],
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });
});
