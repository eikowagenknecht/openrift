import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CSSProperties, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";
import { stubCardViewerItem } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({}),
}));

vi.mock("@/hooks/use-apply-tag-filter", () => ({
  useApplyTagFilter: () => null,
}));

// BaseUI's Dialog portals and traps focus; pass-through stubs keep the test on
// the modal's own wiring (open gating, dock handoff, history entry).
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open === false ? null : <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode; style?: CSSProperties }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

// The real CardDetail is lazy-loaded and heavy; the stub surfaces only what
// these tests assert on.
vi.mock("@/components/cards/card-detail", () => ({
  CardDetail: ({ navLabel, actions }: { navLabel?: string; actions?: ReactNode }) => (
    <div>
      <div>Card detail stub</div>
      {navLabel ? <div>{navLabel}</div> : null}
      {actions}
    </div>
  ),
}));

const { SelectionDetailModal } = await import("./selection-detail-modal");

const resetSelectionStore = createStoreResetter(useSelectionStore);
const resetDisplayStore = createStoreResetter(useDisplayStore);

beforeEach(() => {
  resetSelectionStore();
  resetDisplayStore();
});

afterEach(() => {
  resetSelectionStore();
  resetDisplayStore();
});

function renderModal(
  items: ReturnType<typeof stubCardViewerItem>[],
  actions?: (printing: { id: string }) => ReactNode,
) {
  return render(
    <SelectionDetailModal
      items={items}
      printingsByCardId={new Map()}
      showImages={false}
      onSearchAndClose={() => {}}
      actions={actions}
    />,
  );
}

function selectFirst(items: ReturnType<typeof stubCardViewerItem>[]) {
  useSelectionStore.setState({
    selectedCard: items[0].printing,
    selectedIndex: 0,
    detailOpen: true,
  });
}

describe("SelectionDetailModal", () => {
  it("shows the selected card while the pane is undocked", async () => {
    const items = [stubCardViewerItem(), stubCardViewerItem()];
    selectFirst(items);
    renderModal(items);

    expect(await screen.findByText("Card detail stub")).toBeInTheDocument();
  });

  it("stands down while the pane is docked, so only one detail is on screen", () => {
    const items = [stubCardViewerItem()];
    selectFirst(items);
    useDisplayStore.setState({ paneDocked: true });
    renderModal(items);

    expect(screen.queryByText("Card detail stub")).not.toBeInTheDocument();
  });

  it("renders nothing when no card is selected", () => {
    renderModal([stubCardViewerItem()]);

    expect(screen.queryByText("Card detail stub")).not.toBeInTheDocument();
  });

  it("shows the position within the current list", async () => {
    const items = [stubCardViewerItem(), stubCardViewerItem(), stubCardViewerItem()];
    useSelectionStore.setState({
      selectedCard: items[1].printing,
      selectedIndex: 1,
      detailOpen: true,
    });
    renderModal(items);

    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("docks the pane and keeps the card when the footer link is used", async () => {
    const user = userEvent.setup();
    const items = [stubCardViewerItem()];
    selectFirst(items);
    renderModal(items);

    await user.click(await screen.findByRole("button", { name: "Dock it beside the grid" }));

    expect(useDisplayStore.getState().paneDocked).toBe(true);
    // The pane picks the card up from here — dropping the selection would make
    // the handoff look like a dismissal.
    expect(useSelectionStore.getState().selectedCard).toBe(items[0].printing);
    expect(useSelectionStore.getState().detailOpen).toBe(true);
  });

  it("renders the surface's action row for the shown card", async () => {
    const items = [stubCardViewerItem()];
    selectFirst(items);
    renderModal(items, (printing) => <div>actions for {printing.id}</div>);

    expect(await screen.findByText(`actions for ${items[0].printing.id}`)).toBeInTheDocument();
  });

  it("closes on a browser back navigation", async () => {
    const items = [stubCardViewerItem()];
    selectFirst(items);
    renderModal(items);
    await screen.findByText("Card detail stub");

    globalThis.dispatchEvent(new PopStateEvent("popstate"));

    expect(useSelectionStore.getState().detailOpen).toBe(false);
    expect(useSelectionStore.getState().selectedCard).toBeNull();
  });
});
