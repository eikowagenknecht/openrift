import type { CardTradeSheetResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const sheet = vi.hoisted(() => ({ current: null as CardTradeSheetResponse | null }));

vi.mock("@/hooks/use-card-trades", () => ({
  useTradeSheet: () => ({ data: sheet.current }),
  useUserTrades: () => ({ data: { items: [] } }),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ printingsById: {} }),
}));

// The sheet's children each carry their own queries and mutations, and none of
// them is what this file is about — the header's way out to the counterparty's
// shared lists is.
vi.mock("@/components/cards/card-detail-opener", () => ({
  CardDetailOverlayProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/friend-groups/contact-method-chips", () => ({
  ContactMethodChips: () => null,
}));
vi.mock("@/components/friend-groups/match-row-card", () => ({
  MatchTradeList: () => <div>match rows</div>,
}));
vi.mock("@/components/friend-groups/trade-bulk-actions", () => ({ BulkTradeActions: () => null }));
vi.mock("@/components/friend-groups/trade-cardmarket-export-dialog", () => ({
  TradeCardmarketExportDialog: () => null,
}));
vi.mock("@/components/friend-groups/trade-row", () => ({ TradeRow: () => null }));
vi.mock("@/components/layout/top-bar-breadcrumb", () => ({ TopBarBreadcrumbBar: () => null }));
vi.mock("@/components/trades/trade-balance-bar", () => ({ TradeBalanceBar: () => null }));
vi.mock("@/components/trades/trade-settle-section", () => ({ TradeSettleSection: () => null }));
vi.mock("@/components/user-avatar", () => ({ UserAvatar: () => null }));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
    className?: string;
  }) => {
    let path = to;
    for (const [key, value] of Object.entries(params ?? {})) {
      path = path.replace(`$${key}`, value);
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const { TradeSheetPage } = await import("./trade-sheet-page");

function makeMatch(
  overrides: Partial<CardTradeSheetResponse["othersHaveYourWants"][number]> = {},
): CardTradeSheetResponse["othersHaveYourWants"][number] {
  return {
    counterpartyUserId: "member-1",
    counterpartyName: "Ezreal",
    counterpartyImage: null,
    counterpartyGravatarHash: "hash",
    counterpartyListId: "list-1",
    counterpartyListName: "Their tradelist",
    viewerListName: "My wishlist",
    sellEntryId: "entry-1",
    sellListId: "list-1",
    copyId: "copy-1",
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    printingId: "printing-1",
    cardId: "card-1",
    cardName: "Jinx",
    setId: "OGN",
    rarity: "rare",
    finish: "standard",
    imageId: null,
    buyEntryId: "entry-2",
    buyListId: "list-2",
    buyEntryKind: "card",
    buyQuantity: 1,
    sellPref: { pricePref: null, priceAbsoluteCents: null, tradeType: null, currency: null },
    buyPref: { pricePref: null, priceAbsoluteCents: null, tradeType: null, currency: null },
    groupId: "group-1",
    groupSlug: "allerlei-spielerei",
    ...overrides,
  };
}

function makeSheet(overrides: Partial<CardTradeSheetResponse> = {}): CardTradeSheetResponse {
  return {
    counterparty: {
      userId: "member-1",
      name: "Ezreal",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    groups: [{ id: "group-1", slug: "allerlei-spielerei", name: "Allerlei Spielerei" }],
    othersHaveYourWants: [],
    othersWantYourHaves: [],
    ...overrides,
  };
}

describe("TradeSheetPage", () => {
  it("keeps the shared-lists link on a sheet that has suggestions", () => {
    sheet.current = makeSheet({ othersHaveYourWants: [makeMatch()] });
    render(<TradeSheetPage userId="member-1" fromGroupSlug="allerlei-spielerei" />);

    // The regression: this link used to live only in the empty state, so one
    // suggestion was enough to take away the only route to their lists.
    expect(screen.queryByText("Nothing traded yet")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View their lists" })).toHaveAttribute(
      "href",
      "/groups/allerlei-spielerei/members/member-1",
    );
  });

  it("offers exactly one shared-lists link on an empty sheet", () => {
    sheet.current = makeSheet();
    render(<TradeSheetPage userId="member-1" fromGroupSlug="allerlei-spielerei" />);

    expect(screen.getByText("Nothing traded yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View their lists" })).toHaveLength(1);
  });

  it("anchors the link to the group the viewer came through", () => {
    sheet.current = makeSheet({
      groups: [
        { id: "group-1", slug: "allerlei-spielerei", name: "Allerlei Spielerei" },
        { id: "group-2", slug: "summoner-skirmish", name: "Summoner Skirmish" },
      ],
    });
    render(<TradeSheetPage userId="member-1" fromGroupSlug="summoner-skirmish" />);

    expect(screen.getByRole("link", { name: "View their lists" })).toHaveAttribute(
      "href",
      "/groups/summoner-skirmish/members/member-1",
    );
  });

  it("falls back to the first shared group when the viewer arrived without one", () => {
    sheet.current = makeSheet({
      groups: [
        { id: "group-1", slug: "allerlei-spielerei", name: "Allerlei Spielerei" },
        { id: "group-2", slug: "summoner-skirmish", name: "Summoner Skirmish" },
      ],
    });
    render(<TradeSheetPage userId="member-1" />);

    expect(screen.getByRole("link", { name: "View their lists" })).toHaveAttribute(
      "href",
      "/groups/allerlei-spielerei/members/member-1",
    );
  });
});
