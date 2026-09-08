import type * as ReactRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectionStore } from "@/stores/selection-store";
import { stubCardViewerItem } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@/hooks/use-is-mobile", () => ({
  useIsMobile: () => true,
}));

vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({}),
}));

vi.mock("@/hooks/use-apply-tag-filter", () => ({
  useApplyTagFilter: () => null,
}));

// The drawer's history entry goes through the router (see
// use-overlay-history-entry), which has no provider in a bare render.
const routerStub = { navigate: vi.fn(), latestLocation: { href: "/cards" } };
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouter: () => routerStub,
}));

// BaseUI's Drawer needs a real pointer environment; pass-through stubs keep the
// test focused on the prev/next handler wiring.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DrawerContent: ({ children }: { children?: ReactNode; style?: CSSProperties }) => (
    <div>{children}</div>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// The real CardDetail is lazy-loaded and heavy; this stub only exposes the
// neighbor navigation the overlay wires up.
vi.mock("@/features/cards/components/card-detail/card-detail", () => ({
  CardDetail: ({
    onPrevCard,
    onNextCard,
  }: {
    onPrevCard?: () => void;
    onNextCard?: () => void;
  }) => (
    <div>
      <div>Card detail stub</div>
      {onPrevCard ? (
        <button type="button" onClick={onPrevCard}>
          Previous card
        </button>
      ) : null}
      {onNextCard ? (
        <button type="button" onClick={onNextCard}>
          Next card
        </button>
      ) : null}
    </div>
  ),
}));

const { SelectionMobileOverlay } = await import("./selection-mobile-overlay");

const resetSelectionStore = createStoreResetter(useSelectionStore);

beforeEach(resetSelectionStore);
afterEach(resetSelectionStore);

function renderOverlay(items: ReturnType<typeof stubCardViewerItem>[]) {
  return render(
    <SelectionMobileOverlay
      items={items}
      printingsByCardId={new Map()}
      showImages={false}
      onSearchAndClose={() => {}}
    />,
  );
}

describe("SelectionMobileOverlay neighbor navigation", () => {
  it("navigates to the previous and next cards from a valid index", async () => {
    const user = userEvent.setup();
    const items = [stubCardViewerItem(), stubCardViewerItem(), stubCardViewerItem()];
    useSelectionStore.setState({
      selectedCard: items[1]!.printing,
      selectedIndex: 1,
      detailOpen: true,
    });
    renderOverlay(items);

    await user.click(await screen.findByRole("button", { name: "Previous card" }));
    expect(useSelectionStore.getState().selectedIndex).toBe(0);
    expect(useSelectionStore.getState().selectedCard).toBe(items[0]!.printing);
  });

  it("offers no neighbor navigation when the stored index is stale", async () => {
    const items = [stubCardViewerItem()];
    useSelectionStore.setState({
      selectedCard: stubCardViewerItem().printing,
      selectedIndex: 5,
      detailOpen: true,
    });
    renderOverlay(items);

    await screen.findByText("Card detail stub");
    expect(screen.queryByRole("button", { name: "Previous card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next card" })).not.toBeInTheDocument();
  });

  it("hides the previous control on the first card and the next on the last", async () => {
    const items = [stubCardViewerItem(), stubCardViewerItem()];
    useSelectionStore.setState({
      selectedCard: items[0]!.printing,
      selectedIndex: 0,
      detailOpen: true,
    });
    renderOverlay(items);

    expect(await screen.findByRole("button", { name: "Next card" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous card" })).not.toBeInTheDocument();
  });
});
