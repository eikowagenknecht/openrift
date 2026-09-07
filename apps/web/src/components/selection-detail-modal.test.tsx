import type * as ReactRouter from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
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

// The modal's history entry goes through the router (see
// use-overlay-history-entry), which has no provider in a bare render.
const navigateMock = vi.fn();
const routerStub = { navigate: navigateMock, latestLocation: { href: "/cards" } };
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useRouter: () => routerStub,
}));

// BaseUI's Dialog portals and traps focus; pass-through stubs keep the test on
// the modal's own wiring (open gating, dock handoff, history entry).
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open === false ? null : <div>{children}</div>,
  // Spreads props so the modal's onKeyDown reaches the DOM for the
  // arrow-key tests below.
  DialogContent: ({
    children,
    ...props
  }: { children?: ReactNode; style?: CSSProperties } & Record<string, unknown>) => (
    <div {...props}>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // Renders as a plain button so the close control keeps its accessible name,
  // which is the thing the app and the e2e locators share.
  DialogClose: ({
    children,
    render: _render,
    ...props
  }: { children?: ReactNode; render?: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

// The real CardDetail is lazy-loaded and heavy; the stub surfaces only what
// these tests assert on.
vi.mock("@/components/cards/card-detail", () => ({
  CardDetail: ({
    navLabel,
    actions,
    footerSlot,
  }: {
    navLabel?: string;
    actions?: ReactNode;
    footerSlot?: ReactNode;
  }) => (
    <div>
      <div>Card detail stub</div>
      {navLabel ? <div>{navLabel}</div> : null}
      {actions}
      {/* A stand-in for the language tabs, which own left/right themselves. */}
      <div role="tablist">
        <button type="button" role="tab">
          EN
        </button>
      </div>
      {footerSlot}
    </div>
  ),
}));

const { SelectionDetailModal } = await import("./selection-detail-modal");

const resetSelectionStore = createStoreResetter(useSelectionStore);
const resetDisplayStore = createStoreResetter(useDisplayStore);

beforeEach(() => {
  resetSelectionStore();
  resetDisplayStore();
  navigateMock.mockReset();
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
    selectedCard: items[0]!.printing,
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
      selectedCard: items[1]!.printing,
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
    expect(useSelectionStore.getState().selectedCard).toBe(items[0]!.printing);
    expect(useSelectionStore.getState().detailOpen).toBe(true);
  });

  it("renders the surface's action row for the shown card", async () => {
    const items = [stubCardViewerItem()];
    selectFirst(items);
    renderModal(items, (printing) => <div>actions for {printing.id}</div>);

    expect(await screen.findByText(`actions for ${items[0]!.printing.id}`)).toBeInTheDocument();
  });

  describe("keyboard navigation", () => {
    it("steps to the next and previous card with the arrow keys", async () => {
      const items = [stubCardViewerItem(), stubCardViewerItem(), stubCardViewerItem()];
      useSelectionStore.setState({
        selectedCard: items[1]!.printing,
        selectedIndex: 1,
        detailOpen: true,
      });
      renderModal(items);
      // Dispatched from inside the dialog, which is where the focus trap keeps
      // it in the real thing.
      const inside = await screen.findByText("Card detail stub");

      fireEvent.keyDown(inside, { key: "ArrowRight" });
      expect(useSelectionStore.getState().selectedIndex).toBe(2);
      expect(useSelectionStore.getState().selectedCard).toBe(items[2]!.printing);

      fireEvent.keyDown(inside, { key: "ArrowLeft" });
      fireEvent.keyDown(inside, { key: "ArrowLeft" });
      expect(useSelectionStore.getState().selectedIndex).toBe(0);
      expect(useSelectionStore.getState().selectedCard).toBe(items[0]!.printing);
    });

    it("stays put at the ends of the list", async () => {
      const items = [stubCardViewerItem(), stubCardViewerItem()];
      selectFirst(items);
      renderModal(items);
      const inside = await screen.findByText("Card detail stub");

      fireEvent.keyDown(inside, { key: "ArrowLeft" });

      expect(useSelectionStore.getState().selectedIndex).toBe(0);
    });

    it("leaves left/right to the language tabs when the key comes from them", async () => {
      const items = [stubCardViewerItem(), stubCardViewerItem()];
      selectFirst(items);
      renderModal(items);

      fireEvent.keyDown(await screen.findByRole("tab"), { key: "ArrowRight" });

      expect(useSelectionStore.getState().selectedIndex).toBe(0);
    });
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
