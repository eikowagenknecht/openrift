import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { Printing } from "@openrift/shared/types/catalog";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useGridSelectionStore } from "@/features/cards/stores/grid-selection-store";
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

const reservedCopyIds = new Set<string>();
const loanedCopyIds = new Set<string>();
let liveAnnotations: CardTradeLiveAnnotation[] = [];

function copiesFor(printingIds: readonly string[]): string[] {
  return printingIds.flatMap((id) => copiesByPrinting[id] ?? []);
}

vi.mock("@/features/collections/hooks/use-owned-count", () => ({
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

vi.mock("@/features/groups/hooks/use-card-trades", () => ({
  useLiveTradesByPrinting: () => ({ data: { annotations: liveAnnotations } }),
}));

interface StripProbeProps {
  extras?: ReactNode;
  tradeAnnotation?: CardTradeLiveAnnotation | null;
}

// Renders leftOverlay and the strip's extras/tradeAnnotation only, skipping the
// thumbnail tree; a real count strip would drag in the owned-collections popover.
vi.mock("@/features/cards/components/card-cell", () => ({
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
// Only getFallbackArt is real; the cell calls it to decide whether to render
// the standalone suggest-image pill.
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
    useGridSelectionStore.getState().addToSelection(["cx1", "cx2"]);

    renderCell({ dataView: "printings", siblings: [printingX, printingY] });

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("leaves the checkbox unchecked in printings view when nothing is selected", () => {
    renderCell({ dataView: "printings", siblings: [printingX, printingY] });

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("still aggregates sibling copies in cards view", () => {
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

// Picking rules themselves are tile-trade-status.test.ts's job.
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

  it("qualifies an asked count with the copies still free", () => {
    reservedCopyIds.add("cx1");
    liveAnnotations = [annotation({ phase: "asked", quantity: 3 })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(
      screen.getByLabelText("Requested (outgoing) · 3 copies wanted, 1 available"),
    ).toBeInTheDocument();
  });

  it("counts neither the pinned nor the loaned copy as available", () => {
    reservedCopyIds.add("cx1");
    loanedCopyIds.add("cx2");
    liveAnnotations = [annotation({ phase: "asked", quantity: 2 })];

    renderStripCell({ stacked: true, mode: "browse" });

    expect(
      screen.getByLabelText("Requested (outgoing) · 2 copies wanted, 0 available"),
    ).toBeInTheDocument();
  });

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

  it("hands the copies-view strip its printing's annotation instead of a chip", () => {
    liveAnnotations = [annotation({ phase: "reserved" })];

    renderStripCell({ stacked: false, mode: "browse", itemId: "cx1" });

    expect(screen.getByTestId("cell-strip").dataset.tradePhase).toBe("reserved");
  });
});
