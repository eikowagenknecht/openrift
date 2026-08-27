import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

const { collectionsMock, countsMock, quickAddMock, popoverHostProps } = vi.hoisted(() => ({
  collectionsMock: vi.fn(),
  countsMock: vi.fn(),
  quickAddMock: vi.fn(),
  popoverHostProps: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: collectionsMock() }),
  queryOptions: (options: unknown) => options,
}));

vi.mock("@/lib/collections-query", () => ({
  collectionsQueryOptions: () => ({ queryKey: ["collections"] }),
}));

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => "user-1",
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCountsForPrintings: () => ({ data: countsMock() }),
}));

vi.mock("@/hooks/use-quick-add-actions", () => ({
  useQuickAddActions: () => quickAddMock(),
}));

vi.mock("@/components/cards/card-detail/owned-collections-popover", () => ({
  OwnedCollectionsPopover: ({ count, totalCount }: { count: number; totalCount: number }) => (
    <span>{`breakdown ${count}/${totalCount}`}</span>
  ),
}));

vi.mock("@/components/collection/variant-locations-popover-host", () => ({
  VariantLocationsPopoverHost: (props: Record<string, unknown>) => {
    popoverHostProps.push(props);
    return null;
  },
}));

vi.mock("@/components/collection/annotated-dispose-dialog", () => ({
  AnnotatedDisposeDialog: () => null,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardPageCollectionActions, ownedSummary } from "./card-page-collection-actions";

const printing = stubPrinting({ id: "printing-1", cardId: "card-1" });
const sibling = stubPrinting({ id: "printing-2", cardId: "card-1", finish: "foil" });

function stubActions(overrides: Record<string, unknown> = {}) {
  return {
    handleQuickAdd: vi.fn(),
    handleAddToCollection: vi.fn(),
    tryUndoAdd: vi.fn().mockResolvedValue("done"),
    handleOpenVariants: vi.fn(),
    handleDisposeFromCollection: vi.fn(),
    closeVariants: vi.fn(),
    pendingAnnotatedDispose: null,
    confirmAnnotatedDispose: vi.fn(),
    cancelAnnotatedDispose: vi.fn(),
    disposeIsPending: false,
    ...overrides,
  };
}

describe("ownedSummary", () => {
  it("says nothing is owned when the whole card is at zero", () => {
    expect(ownedSummary(0, 0)).toBe("You don't own this card yet.");
  });

  it("points at the other printings when only they have copies", () => {
    expect(ownedSummary(0, 3)).toBe("You own 3 of this card, none of this printing.");
  });

  it("reports both figures when the printing is part of a larger holding", () => {
    expect(ownedSummary(2, 5)).toBe("You own 2 of this printing, 5 of this card.");
  });

  it("drops the card figure when it matches the printing", () => {
    expect(ownedSummary(4, 4)).toBe("You own 4 copies of this printing.");
    expect(ownedSummary(1, 1)).toBe("You own 1 copy of this printing.");
  });
});

describe("CardPageCollectionActions", () => {
  beforeEach(() => {
    popoverHostProps.length = 0;
    collectionsMock.mockReturnValue([{ id: "inbox-1", name: "Inbox", isInbox: true }]);
    countsMock.mockReturnValue({
      totals: { "printing-1": 2, "printing-2": 3 },
      total: 5,
      allTotals: { "printing-1": 2, "printing-2": 3 },
      allTotal: 5,
    });
    quickAddMock.mockReturnValue(stubActions());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds to the inbox and names it in the button label", async () => {
    const handleQuickAdd = vi.fn();
    quickAddMock.mockReturnValue(stubActions({ handleQuickAdd }));
    render(<CardPageCollectionActions printing={printing} siblings={[printing, sibling]} />);

    await userEvent.click(screen.getByRole("button", { name: /Add .+ to Inbox/u }));

    expect(handleQuickAdd).toHaveBeenCalledWith(printing);
  });

  it("shows the printing count next to the card total", () => {
    render(<CardPageCollectionActions printing={printing} siblings={[printing, sibling]} />);

    expect(screen.getByText("You own 2 of this printing, 5 of this card.")).toBeInTheDocument();
    expect(screen.getByText("breakdown 2/5")).toBeInTheDocument();
  });

  it("hides the minus while the printing has no copies to remove", () => {
    countsMock.mockReturnValue({ totals: {}, total: 0, allTotals: {}, allTotal: 0 });
    render(<CardPageCollectionActions printing={printing} siblings={[printing]} />);

    expect(screen.queryByRole("button", { name: /^Remove/u })).not.toBeInTheDocument();
    expect(screen.getByText("You don't own this card yet.")).toBeInTheDocument();
  });

  it("removes silently when the copies sit in one collection", async () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("done");
    const handleOpenVariants = vi.fn();
    quickAddMock.mockReturnValue(stubActions({ tryUndoAdd, handleOpenVariants }));
    render(<CardPageCollectionActions printing={printing} siblings={[printing]} />);

    await userEvent.click(screen.getByRole("button", { name: /^Remove/u }));

    expect(tryUndoAdd).toHaveBeenCalledWith(printing);
    expect(handleOpenVariants).not.toHaveBeenCalled();
  });

  it("escalates an ambiguous removal to the printing-scoped variant popover", async () => {
    const tryUndoAdd = vi.fn().mockResolvedValue("ambiguous");
    const handleOpenVariants = vi.fn();
    quickAddMock.mockReturnValue(stubActions({ tryUndoAdd, handleOpenVariants }));
    render(<CardPageCollectionActions printing={printing} siblings={[printing, sibling]} />);

    await userEvent.click(screen.getByRole("button", { name: /^Remove/u }));

    expect(handleOpenVariants).toHaveBeenCalledWith(
      printing,
      expect.any(HTMLElement),
      "remove",
      false,
      true,
    );
  });

  it("disables the plus until a target collection is known", () => {
    collectionsMock.mockReturnValue(undefined);
    quickAddMock.mockReturnValue(stubActions({ handleQuickAdd: undefined }));
    render(<CardPageCollectionActions printing={printing} siblings={[printing]} />);

    expect(screen.getByRole("button", { name: /^Add/u })).toBeDisabled();
  });

  it("hands the variant popover only this card's printings", () => {
    render(<CardPageCollectionActions printing={printing} siblings={[printing, sibling]} />);

    const props = popoverHostProps.at(-1);
    const map = props?.catalogPrintingsByCardId as Map<string, unknown[]>;
    expect(map.get("card-1")).toHaveLength(2);
    expect(props?.defaultTargetCollectionId).toBe("inbox-1");
  });
});
