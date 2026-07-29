import type { Printing } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { stubCopy, stubPrinting } from "@/test/factories";
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
  useCopyRowsForPrintings: (printingIds: readonly string[]) => ({
    data: copiesFor(printingIds).map((id) => stubCopy({ id })),
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
// which strip the cell decided to produce (count strip vs. the ADR-038 copy
// metadata strip), identified by the element's component name; skip the whole
// thumbnail tree.
vi.mock("@/components/cards/card-cell", () => ({
  CardCell: ({ leftOverlay, strip }: { leftOverlay?: ReactNode; strip?: ReactElement }) => (
    <div>
      {leftOverlay}
      {strip ? (
        <div
          data-testid="cell-strip"
          data-strip-kind={typeof strip.type === "function" ? strip.type.name : String(strip.type)}
        />
      ) : null}
    </div>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
const { CollectionGridCell } = await import("./collection-grid-cell");

const collectionId = "col-1";
// Only getFallbackArt is real: the cell calls it to decide whether to render
// the standalone suggest-image pill; the thumbnail tree consuming the rest of
// the bundle is mocked out above.
const display = { getFallbackArt: () => null } as unknown as CardThumbnailDisplay;

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
      sourceCollectionIsGroup={false}
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
        sourceCollectionIsGroup={false}
        display={display}
        showImages
      />,
    );
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});

function renderStripCell(props: { stacked: boolean; mode: "browse" | "select"; itemId?: string }) {
  return render(
    <CollectionGridCell
      printing={printingX}
      itemId={props.itemId ?? "p-x"}
      cardWidth={200}
      priority={false}
      dataView="printings"
      mode={props.mode}
      showLibrary={false}
      stacked={props.stacked}
      siblings={undefined}
      collectionId={collectionId}
      sourceCollectionIsGroup={false}
      display={display}
      showImages
    />,
  );
}

describe("CollectionGridCell strip gating", () => {
  beforeEach(resetSelection);
  afterEach(resetSelection);

  // A copies-view tile (`!stacked`) is a single physical copy, so its count is
  // always 1 and the per-printing count controls don't apply — the strip row
  // instead carries the copy's metadata chips (ADR-038).
  it("renders the metadata strip, not the count strip, on a copies-view tile in browse mode", () => {
    renderStripCell({ stacked: false, mode: "browse", itemId: "cx1" });
    expect(screen.getByTestId("cell-strip").dataset.stripKind).toBe("CopyMetadataStrip");
  });

  it("renders the metadata strip on a copies-view tile in select mode", () => {
    renderStripCell({ stacked: false, mode: "select", itemId: "cx1" });
    expect(screen.getByTestId("cell-strip").dataset.stripKind).toBe("CopyMetadataStrip");
  });

  it("still renders the aggregate count strip on a stacked tile in browse mode", () => {
    renderStripCell({ stacked: true, mode: "browse" });
    expect(screen.getByTestId("cell-strip").dataset.stripKind).toBe("CardCountStrip");
  });
});
