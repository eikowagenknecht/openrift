import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";
import { stubCardViewerItem } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@/hooks/use-apply-tag-filter", () => ({
  useApplyTagFilter: () => null,
}));

vi.mock("@/components/cards/card-detail", () => ({
  CardDetail: ({ actions, onClose }: { actions?: ReactNode; onClose?: () => void }) => (
    <div>
      <div>Card detail stub</div>
      {actions}
      <button type="button" onClick={onClose}>
        Close card details
      </button>
    </div>
  ),
}));

const { SelectionDetailPane } = await import("./selection-detail-pane");

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

function renderPane(items: ReturnType<typeof stubCardViewerItem>[]) {
  return render(
    <SelectionDetailPane
      items={items}
      printingsByCardId={new Map()}
      showImages={false}
      onSearchAndClose={() => {}}
    />,
  );
}

describe("SelectionDetailPane", () => {
  it("renders nothing while the pane is undocked", () => {
    const items = [stubCardViewerItem()];
    useSelectionStore.setState({
      selectedCard: items[0]!.printing,
      selectedIndex: 0,
      detailOpen: true,
    });
    renderPane(items);

    expect(screen.queryByText("Card detail stub")).not.toBeInTheDocument();
  });

  it("holds its place with an empty state when docked with nothing selected", () => {
    useDisplayStore.setState({ paneDocked: true });
    renderPane([stubCardViewerItem()]);

    expect(screen.getByText("Select a card to see its details")).toBeInTheDocument();
  });

  it("shows the selected card once docked", async () => {
    const items = [stubCardViewerItem()];
    useDisplayStore.setState({ paneDocked: true });
    useSelectionStore.setState({
      selectedCard: items[0]!.printing,
      selectedIndex: 0,
      detailOpen: true,
    });
    renderPane(items);

    expect(await screen.findByText("Card detail stub")).toBeInTheDocument();
    expect(screen.queryByText("Select a card to see its details")).not.toBeInTheDocument();
  });

  it("closes the whole dock when the card's close button is used", async () => {
    const user = userEvent.setup();
    const items = [stubCardViewerItem()];
    useDisplayStore.setState({ paneDocked: true });
    useSelectionStore.setState({
      selectedCard: items[0]!.printing,
      selectedIndex: 0,
      detailOpen: true,
    });
    renderPane(items);

    await user.click(await screen.findByRole("button", { name: "Close card details" }));

    expect(useDisplayStore.getState().paneDocked).toBe(false);
    expect(useSelectionStore.getState().selectedCard).toBeNull();
    expect(screen.queryByText("Select a card to see its details")).not.toBeInTheDocument();
  });
});
