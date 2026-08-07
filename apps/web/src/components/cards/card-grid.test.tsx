import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { useDisplayStore } from "@/stores/display-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { stubCardViewerItem } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import type { GroupInfo } from "./card-grid-types";

const COLUMNS = 3;
const CONTAINER_WIDTH = 400;

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: {}, labels: {} }),
}));
vi.mock("@/hooks/use-admin-settings", () => ({
  useAdminSettings: () => null,
}));
// Fixed layout so row-height estimates are deterministic in jsdom (where
// offsetWidth is always 0 and ResizeObserver is a no-op stub).
vi.mock("@/hooks/use-responsive-columns", () => ({
  useResponsiveColumns: () => ({
    containerRef: () => {},
    containerEl: null,
    columns: COLUMNS,
    physicalMax: 8,
    physicalMin: 1,
    autoColumns: COLUMNS,
    containerWidth: CONTAINER_WIDTH,
    measured: true,
  }),
  SSR_RESPONSIVE_GRID_COLS: "",
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardGrid } from "./card-grid";
// oxlint-disable-next-line import/first -- must import after vi.mock
import {
  BUTTON_PAD,
  CARD_ASPECT_INVERSE,
  HEADER_CONTENT_HEIGHT,
  HEADER_PB,
  HEADER_PT,
  LABEL_HEIGHT,
} from "./card-grid-constants";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { computeGridMetrics } from "./card-grid-metrics";

// Mirrors CardGrid's estimateRowHeight for the mocked layout above.
const { gap: GAP, cardWidth: THUMB_WIDTH } = computeGridMetrics(CONTAINER_WIDTH, COLUMNS);
const CARDS_ROW_HEIGHT = Math.round(
  (THUMB_WIDTH - BUTTON_PAD * 2) * CARD_ASPECT_INVERSE + LABEL_HEIGHT + BUTTON_PAD * 2,
);
const HEADER_ROW_HEIGHT = HEADER_PT + HEADER_CONTENT_HEIGHT + HEADER_PB;

const resetDisplayStore = createStoreResetter(useDisplayStore);
const resetGridFocusStore = createStoreResetter(useGridFocusStore);

afterEach(() => {
  resetDisplayStore();
  resetGridFocusStore();
});

function makeSet(index: number): GroupInfo {
  return { id: `set-${index}`, slug: `SET${index}`, name: `Set ${index}`, setType: "main" };
}

function makeItems(setId: string, count: number): CardViewerItem[] {
  return Array.from({ length: count }, (_, index) =>
    stubCardViewerItem({ id: `${setId}-printing-${index}`, setId }),
  );
}

function gridElement(items: CardViewerItem[], setOrder: GroupInfo[]) {
  return (
    <CardGrid
      items={items}
      totalItems={items.length}
      renderCard={(item) => <div>{item.id}</div>}
      setOrder={setOrder}
      groupBy="set"
      stickyOffset={0}
    />
  );
}

function rowTop(container: HTMLElement, index: number): number {
  const row = container.querySelector(`[data-index="${index}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`virtual row ${index} not rendered`);
  }
  const match = /translateY\((?<offset>-?[\d.]+)px\)/u.exec(row.style.transform);
  if (!match?.groups?.offset) {
    throw new Error(`virtual row ${index} has no translateY transform`);
  }
  return Number(match.groups.offset);
}

describe("CardGrid virtual row positioning", () => {
  it("positions grouped rows using header and cards estimates", () => {
    // 3 sets × 2 items at 3 columns → [header, cards, header, cards, header, cards].
    const sets = [makeSet(1), makeSet(2), makeSet(3)];
    const items = sets.flatMap((set) => makeItems(set.id, 2));
    const { container } = render(gridElement(items, sets));

    expect(rowTop(container, 0)).toBe(0);
    expect(rowTop(container, 1)).toBe(HEADER_ROW_HEIGHT + GAP);
    expect(rowTop(container, 2)).toBe(HEADER_ROW_HEIGHT + CARDS_ROW_HEIGHT + GAP * 2);
  });

  it("re-measures rows when new items change row kinds at the same row count", () => {
    // Regression test: switching between two lists that flatten to the same
    // virtual row COUNT but different row KINDS. react-virtual's measurements
    // memo doesn't track estimateSize, so without an explicit measure() the
    // new all-cards rows keep the old header-sized slots and stack into each
    // other until a resize forces a re-measure.
    const groupedSets = [makeSet(1), makeSet(2), makeSet(3)];
    const groupedItems = groupedSets.flatMap((set) => makeItems(set.id, 2));

    const { container, rerender } = render(gridElement(groupedItems, groupedSets));
    // Sanity: grouped layout alternates header/cards rows.
    expect(rowTop(container, 1)).toBe(HEADER_ROW_HEIGHT + GAP);

    // Same row count (6), but single-group: all rows are cards rows.
    const flatSet = makeSet(9);
    const flatItems = makeItems(flatSet.id, 16);
    rerender(gridElement(flatItems, [flatSet]));

    expect(rowTop(container, 0)).toBe(0);
    expect(rowTop(container, 1)).toBe(CARDS_ROW_HEIGHT + GAP);
    expect(rowTop(container, 2)).toBe((CARDS_ROW_HEIGHT + GAP) * 2);
    expect(rowTop(container, 3)).toBe((CARDS_ROW_HEIGHT + GAP) * 3);
  });
});
