import type { CardTradeLiveAnnotation, Printing } from "@openrift/shared";
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

// Per-test state for the mocked feeds: which copies a live trade has pinned,
// which are out on a loan, and the viewer's live annotations. Reset in
// beforeEach.
const reservedCopyIds = new Set<string>();
const loanedCopyIds = new Set<string>();
let liveAnnotations: CardTradeLiveAnnotation[] = [];

function copiesFor(printingIds: readonly string[]): string[] {
  return printingIds.flatMap((id) => copiesByPrinting[id] ?? []);
}

// Stub the per-cell live queries: return exactly the copies for whatever
// printingIds the cell decides to query. The fix is about which ids it queries.
vi.mock("@/hooks/use-owned-count", () => ({
  useCopyRowsForPrintings: (printingIds: readonly string[]) => ({
    data: printingIds.flatMap((printingId) =>
      (copiesByPrinting[printingId] ?? []).map((id) =>
        stubCopy({
          id,
          printingId,
          reserved: reservedCopyIds.has(id),
          onLoan: loanedCopyIds.has(id),
        }),
      ),
    ),
  }),
  useOwnedCountsForPrintings: (printingIds: readonly string[]) => {
    const totals = Object.fromEntries(
      printingIds.map((id) => [id, (copiesByPrinting[id] ?? []).length]),
    );
    const total = copiesFor(printingIds).length;
    return { data: { totals, total, allTotals: totals, allTotal: total } };
  },
}));

// The cell reads its own live-trade annotations (ADR-019) rather than taking
// them from the grid, so the test feeds the hook directly.
vi.mock("@/hooks/use-card-trades", () => ({
  useLiveTradesByPrinting: () => ({ data: { annotations: liveAnnotations } }),
}));

/** The strip props the probe below reads. */
interface StripProbeProps {
  /** Where the stacked strips put the loan / trade / metadata chips. */
  extras?: ReactNode;
  /** What the copies-view strip receives to word its marker with. */
  tradeAnnotation?: CardTradeLiveAnnotation | null;
}

// Render the left overlay (where the SelectionCheckbox lives) and a marker for
// which strip the cell decided to produce (count strip vs. the ADR-038 copy
// metadata strip), identified by the element's component name; skip the whole
// thumbnail tree.
//
// Of the strip itself only the `extras` slot is rendered, which is where the
// chips under test live. Mounting a real count strip would drag in the
// owned-collections popover, which this test has no providers for. The
// copies-view strip has no extras, so its annotation is probed as an attribute
// instead. How it draws that annotation is copy-metadata-badges.test.tsx's job.
vi.mock("@/components/cards/card-cell", () => ({
  CardCell: ({
    leftOverlay,
    strip,
  }: {
    leftOverlay?: ReactNode;
    strip?: ReactElement<StripProbeProps>;
  }) => (
    <div>
      {leftOverlay}
      {strip ? (
        <div
          data-testid="cell-strip"
          data-strip-kind={typeof strip.type === "function" ? strip.type.name : String(strip.type)}
          data-trade-phase={strip.props.tradeAnnotation?.phase ?? ""}
        >
          {strip.props.extras}
        </div>
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

function renderStripCell(props: {
  stacked: boolean;
  mode: "browse" | "select";
  itemId?: string;
  sourceCollectionIsGroup?: boolean;
  dataView?: "cards" | "printings";
  siblings?: Printing[];
}) {
  return render(
    <CollectionGridCell
      printing={printingX}
      itemId={props.itemId ?? "p-x"}
      cardWidth={200}
      priority={false}
      dataView={props.dataView ?? "printings"}
      mode={props.mode}
      showLibrary={false}
      stacked={props.stacked}
      siblings={props.siblings}
      collectionId={collectionId}
      sourceCollectionIsGroup={props.sourceCollectionIsGroup ?? false}
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

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "p-x",
    role: "giver",
    phase: "reserved",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

// Wiring only: which annotation the cell picks up and what it does with it.
// The picking rules themselves are tile-trade-status.test.ts's job.
describe("CollectionGridCell live-trade chip", () => {
  beforeEach(() => {
    resetSelection();
    reservedCopyIds.clear();
    loanedCopyIds.clear();
    liveAnnotations = [];
  });
  afterEach(resetSelection);

  it("chips a stacked tile whose printing has a live trade", () => {
    liveAnnotations = [annotation({ phase: "reserved", quantity: 1 })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(screen.getByLabelText("Reserved (outgoing) · 1 copy")).toBeInTheDocument();
  });

  it("chips a stacked tile in select mode too", () => {
    liveAnnotations = [annotation({ phase: "reserved", quantity: 1 })];

    renderStripCell({ stacked: true, mode: "select" });

    expect(screen.getByLabelText("Reserved (outgoing) · 1 copy")).toBeInTheDocument();
  });

  it("leaves the tile alone when the live trade is on a different printing", () => {
    liveAnnotations = [annotation({ printingId: "p-y" })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(screen.queryByLabelText(/Reserved/u)).not.toBeInTheDocument();
  });

  // The product rule: "3" must never read as "3 committed", so the tooltip
  // names the copies still free next to it. Printing X holds two copies here
  // and one is already pinned, leaving one.
  it("qualifies an asked count with the copies still free", () => {
    reservedCopyIds.add("cx1");
    liveAnnotations = [annotation({ phase: "asked", quantity: 3 })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(
      screen.getByLabelText("Requested (outgoing) · 3 copies wanted, 1 available"),
    ).toBeInTheDocument();
  });

  // The cell hands its whole copy set to the count, so a loaned copy is
  // subtracted here exactly as the server's reservable supply subtracts it.
  it("counts neither the pinned nor the loaned copy as available", () => {
    reservedCopyIds.add("cx1");
    loanedCopyIds.add("cx2");
    liveAnnotations = [annotation({ phase: "asked", quantity: 2 })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(
      screen.getByLabelText("Requested (outgoing) · 2 copies wanted, 0 available"),
    ).toBeInTheDocument();
  });

  // A group "bulk box" holds the group's copies, and an annotation names only a
  // printing. So a trade on it is about copies the viewer holds personally, in
  // some other collection entirely.
  it("shows no chip on a group bulk-box tile", () => {
    liveAnnotations = [annotation({ phase: "reserved" })];

    renderStripCell({ stacked: true, mode: "browse", sourceCollectionIsGroup: true });

    expect(screen.queryByLabelText(/Reserved/u)).not.toBeInTheDocument();
  });

  it("reports the card-wide figure in cards view, where siblings share a tile", () => {
    liveAnnotations = [
      annotation({ printingId: "p-x", quantity: 1 }),
      annotation({ printingId: "p-y", quantity: 2 }),
    ];

    renderStripCell({
      stacked: true,
      mode: "browse",
      dataView: "cards",
      siblings: [printingX, printingY],
    });

    expect(
      screen.getByLabelText("Reserved (outgoing) · 1 of this printing (3 across all printings)"),
    ).toBeInTheDocument();
  });

  // A copies-view tile is one physical copy, so the cell hands the strip the
  // annotation and lets the copy's own `reserved` flag decide whether to draw it.
  it("hands the copies-view strip its printing's annotation instead of a chip", () => {
    liveAnnotations = [annotation({ phase: "traded" })];

    renderStripCell({ stacked: false, mode: "browse", itemId: "cx1" });

    expect(screen.getByTestId("cell-strip").dataset.tradePhase).toBe("traded");
  });
});
