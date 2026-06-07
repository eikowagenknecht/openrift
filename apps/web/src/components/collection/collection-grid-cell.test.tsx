import type { Printing } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

// Two printings of one card — the /collections "printings" view renders each
// as its own cell, both sharing a cardId (e.g. "Chaos Rune" + "Chaos Rune SFD").
const cardId = "card-chaos-rune";
const printingX = stubPrinting({ id: "p-x", cardId, card: { name: "Chaos Rune" } });
const printingY = stubPrinting({ id: "p-y", cardId, card: { name: "Chaos Rune" } });

// Owned copies per printing, all in the same collection.
const copiesByPrinting: Record<string, string[]> = {
  "p-x": ["cx1", "cx2"],
  "p-y": ["cy1"],
};

function copiesFor(printingIds: readonly string[]): string[] {
  return printingIds.flatMap((id) => copiesByPrinting[id] ?? []);
}

// Stub the per-cell live queries: return exactly the copies for whatever
// printingIds the cell decides to query. The fix is about which ids it queries.
vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCopyIdsForPrintings: (printingIds: readonly string[]) => ({
    data: copiesFor(printingIds),
  }),
  useOwnedCountsForPrintings: (printingIds: readonly string[]) => {
    const totals = Object.fromEntries(
      printingIds.map((id) => [id, (copiesByPrinting[id] ?? []).length]),
    );
    const total = copiesFor(printingIds).length;
    return { data: { totals, total, allTotals: totals, allTotal: total } };
  },
}));

// Render the left overlay (where the SelectionCheckbox lives) and a marker for
// whether the cell decided to produce a strip; skip the whole thumbnail tree.
vi.mock("@/components/cards/card-cell", () => ({
  CardCell: ({ leftOverlay, strip }: { leftOverlay?: ReactNode; strip?: ReactNode }) => (
    <div>
      {leftOverlay}
      {strip ? <div data-testid="cell-strip" /> : null}
    </div>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
const { CollectionGridCell } = await import("./collection-grid-cell");

const collectionId = "col-1";
const display = {} as CardThumbnailDisplay;

function renderCell(props: { dataView: "cards" | "printings"; siblings: Printing[] | undefined }) {
  return render(
    <CollectionGridCell
      printing={printingX}
      itemId="p-x"
      cardWidth={200}
      priority={false}
      dataView={props.dataView}
      mode="select"
      showLibrary={false}
      stacked
      siblings={props.siblings}
      collectionId={collectionId}
      display={display}
      showImages
    />,
  );
}

const resetSelection = createStoreResetter(useGridSelectionStore);

describe("CollectionGridCell selection checkbox", () => {
  beforeEach(resetSelection);
  afterEach(resetSelection);

  it("checks a printing in printings view when only its own copies are selected", () => {
    // Select just printing X's copies — the user clicked one of two printings.
    useGridSelectionStore.getState().addToSelection(["cx1", "cx2"]);

    // The parent (catalog grouping) still hands both siblings to the cell.
    renderCell({ dataView: "printings", siblings: [printingX, printingY] });

    // Regression: before the fix the cell folded in sibling Y's copy (cy1),
    // so the "every copy selected" test failed and the box stayed unchecked
    // even though the action bar reported a selection.
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("leaves the checkbox unchecked in printings view when nothing is selected", () => {
    renderCell({ dataView: "printings", siblings: [printingX, printingY] });

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("still aggregates sibling copies in cards view", () => {
    // Cards view shows one cell per card; selecting it must require every
    // sibling printing's copies to be selected.
    useGridSelectionStore.getState().addToSelection(["cx1", "cx2"]);
    const { rerender } = renderCell({ dataView: "cards", siblings: [printingX, printingY] });
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    useGridSelectionStore.getState().addToSelection(["cy1"]);
    rerender(
      <CollectionGridCell
        printing={printingX}
        itemId="p-x"
        cardWidth={200}
        priority={false}
        dataView="cards"
        mode="select"
        showLibrary={false}
        stacked
        siblings={[printingX, printingY]}
        collectionId={collectionId}
        display={display}
        showImages
      />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});

function renderStripCell(props: { stacked: boolean; mode: "browse" | "select" }) {
  return render(
    <CollectionGridCell
      printing={printingX}
      itemId="p-x"
      cardWidth={200}
      priority={false}
      dataView="printings"
      mode={props.mode}
      showLibrary={false}
      stacked={props.stacked}
      siblings={undefined}
      collectionId={collectionId}
      display={display}
      showImages
    />,
  );
}

describe("CollectionGridCell strip gating", () => {
  beforeEach(resetSelection);
  afterEach(resetSelection);

  // A copies-view tile (`!stacked`) is a single physical copy, so its count is
  // always 1 and the per-printing strip controls don't apply — no strip.
  it("renders no strip on a copies-view tile in browse mode", () => {
    renderStripCell({ stacked: false, mode: "browse" });
    expect(screen.queryByTestId("cell-strip")).toBeNull();
  });

  it("renders no strip on a copies-view tile in select mode", () => {
    renderStripCell({ stacked: false, mode: "select" });
    expect(screen.queryByTestId("cell-strip")).toBeNull();
  });

  it("still renders the aggregate strip on a stacked tile in browse mode", () => {
    renderStripCell({ stacked: true, mode: "browse" });
    expect(screen.getByTestId("cell-strip")).toBeDefined();
  });
});
