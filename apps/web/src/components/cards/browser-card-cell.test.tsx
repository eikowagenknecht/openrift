import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import type { WishEntryFlat } from "@/lib/wish-entry";
import { useCardRowActionsStore } from "@/stores/card-row-actions-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const cardId = "card-chaos-rune";
const printingX = stubPrinting({ id: "p-x", cardId, card: { name: "Chaos Rune" } });
const printingY = stubPrinting({ id: "p-y", cardId, card: { name: "Chaos Rune" } });

let ownedByPrinting: Record<string, number> = {};

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCountsForPrintings: (printingIds: readonly string[]) => {
    const totals = Object.fromEntries(printingIds.map((id) => [id, ownedByPrinting[id] ?? 0]));
    let total = 0;
    for (const id of printingIds) {
      total += ownedByPrinting[id] ?? 0;
    }
    return { data: { totals, total, allTotals: totals, allTotal: total } };
  },
}));

vi.mock("@/components/cards/card-detail/owned-collections-popover", () => ({
  OwnedCollectionsPopover: () => <span>breakdown</span>,
}));

interface StripProbeProps {
  decrement?: { onClick: (event: { currentTarget: HTMLElement }) => void };
  increment?: { onClick: (event: { currentTarget: HTMLElement }) => void };
  onPillClick?: (event: { currentTarget: HTMLElement }) => void;
  pillOverride?: ReactNode;
  extras?: ReactNode;
}

let strip: ReactElement<StripProbeProps> | undefined;
let contextMenu: ReactNode;

// Mounting the real strip would drag in popover trees this test has no providers for.
vi.mock("@/components/cards/card-cell", () => ({
  CardCell: ({
    strip: cellStrip,
    contextMenu: cellMenu,
  }: {
    strip?: ReactElement<StripProbeProps>;
    contextMenu?: ReactNode;
  }) => {
    strip = cellStrip;
    contextMenu = cellMenu;
    return <div>{cellStrip?.props.extras}</div>;
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
const { BrowserCardCell } = await import("./browser-card-cell");

const display = { getFallbackArt: () => null } as unknown as CardThumbnailDisplay;

function renderCell(props: {
  canAdd: boolean;
  canMenuAdd?: boolean;
  canWish?: boolean;
  showStrip?: boolean;
  inCardsView?: boolean;
  siblings?: (typeof printingX)[];
  wishEntries?: readonly WishEntryFlat[];
}) {
  const inCardsView = props.inCardsView ?? true;
  return render(
    <BrowserCardCell
      printing={printingX}
      itemId="p-x"
      siblings={props.siblings ?? [printingX]}
      cardWidth={200}
      priority={false}
      showImages
      view={inCardsView ? "cards" : "printings"}
      display={display}
      priceRange={undefined}
      showStrip={props.showStrip ?? true}
      canAdd={props.canAdd}
      canMenuAdd={props.canMenuAdd ?? props.canAdd}
      canWish={props.canWish ?? false}
      addTargetName="Inbox"
      wishEntries={props.wishEntries}
      inCardsView={inCardsView}
    />,
  );
}

const resetHandlers = createStoreResetter(useCardRowActionsStore);

describe("BrowserCardCell strip", () => {
  beforeEach(() => {
    resetHandlers();
    ownedByPrinting = {};
    strip = undefined;
    contextMenu = undefined;
  });
  afterEach(resetHandlers);

  it("stays read-only when the browser has no add target", () => {
    ownedByPrinting = { "p-x": 2 };
    renderCell({ canAdd: false });

    expect(strip?.props.increment).toBeUndefined();
    expect(strip?.props.decrement).toBeUndefined();
    expect(strip?.props.onPillClick).toBeUndefined();
    expect(strip?.props.pillOverride).toBeDefined();
  });

  it("renders no strip at all when counts are hidden", () => {
    renderCell({ canAdd: true, showStrip: false });

    expect(strip).toBeUndefined();
  });

  it("offers only a plus on an unowned card with a single variant", () => {
    renderCell({ canAdd: true });

    expect(strip?.props.increment).toBeDefined();
    expect(strip?.props.decrement).toBeUndefined();
    expect(strip?.props.onPillClick).toBeUndefined();
    expect(strip?.props.pillOverride).toBeDefined();
  });

  it("offers a minus and the variant popover once a copy is owned", () => {
    ownedByPrinting = { "p-x": 1 };
    renderCell({ canAdd: true });

    expect(strip?.props.decrement).toBeDefined();
    expect(strip?.props.onPillClick).toBeDefined();
    expect(strip?.props.pillOverride).toBeUndefined();
  });

  it("opens the variant popover on an unowned card that has several variants", () => {
    renderCell({ canAdd: true, siblings: [printingX, printingY] });

    expect(strip?.props.onPillClick).toBeDefined();
  });

  it("keeps the pill read-only in printings view, where a tile is one variant", () => {
    renderCell({ canAdd: true, inCardsView: false, siblings: [printingX, printingY] });

    expect(strip?.props.onPillClick).toBeUndefined();
  });

  it("dispatches a plus to the registered catalog handler", () => {
    const onIncrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onIncrement });
    renderCell({ canAdd: true });

    strip?.props.increment?.onClick({ currentTarget: document.createElement("button") });

    expect(onIncrement).toHaveBeenCalledWith(printingX, undefined);
  });

  it("always wraps the cell in its context menu, the add path that survives the counts toggle", () => {
    renderCell({ canAdd: false, canWish: false, showStrip: false });

    expect(contextMenu).toBeDefined();
  });

  it("hands the minus its anchor so the handler can open the popover against it", () => {
    const onDecrement = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onDecrement });
    ownedByPrinting = { "p-x": 1 };
    renderCell({ canAdd: true });

    const anchor = document.createElement("button");
    strip?.props.decrement?.onClick({ currentTarget: anchor });

    expect(onDecrement).toHaveBeenCalledWith(printingX, anchor, undefined);
  });
});

describe("BrowserCardCell wishlist affordance", () => {
  beforeEach(() => {
    resetHandlers();
    ownedByPrinting = {};
    strip = undefined;
    contextMenu = undefined;
  });
  afterEach(resetHandlers);

  it("offers nothing to a signed-out visitor", () => {
    renderCell({ canAdd: false, canWish: false });

    expect(strip?.props.extras).toBeUndefined();
    expect(screen.queryByRole("button", { name: /wishlist/u })).not.toBeInTheDocument();
  });

  it("offers a hollow heart on a card the viewer has not wished for", () => {
    renderCell({ canAdd: true, canWish: true });

    expect(
      screen.getByRole("button", { name: "Add Chaos Rune to a wishlist" }),
    ).toBeInTheDocument();
  });

  it("opens the picker for the card the heart belongs to", async () => {
    const onAddToWishlist = vi.fn();
    useCardRowActionsStore.getState().setHandlers("catalog", { onAddToWishlist });
    renderCell({ canAdd: true, canWish: true });

    await userEvent.click(screen.getByRole("button", { name: "Add Chaos Rune to a wishlist" }));

    expect(onAddToWishlist).toHaveBeenCalledWith(printingX);
  });

  it("fills the heart once the card is on a wishlist", () => {
    renderCell({
      canAdd: true,
      canWish: true,
      wishEntries: [
        {
          entryId: "e-1",
          listId: "l-1",
          listName: "Chase cards",
          kind: "card",
          cardId,
          quantity: 2,
        },
      ],
    });

    expect(
      screen.queryByRole("button", { name: "Add Chaos Rune to a wishlist" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("On your wishlist (2)")).toBeInTheDocument();
  });
});
