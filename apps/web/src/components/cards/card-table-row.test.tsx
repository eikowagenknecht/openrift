import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardTableRow, getCardTableMinWidth } from "./card-table-row";

describe("CardTableRow", () => {
  it("renders data-printing-id on the row so keyboard `-` can anchor the dispose picker to it", () => {
    // Regression: without this attribute, useGridKeyboardNav.querySelector returns
    // null, anchorEl is undefined, and the multi-collection picker silently bails.
    const printing = stubPrinting({ id: "p-row-1" });
    const { container } = render(
      <CardTableRow
        printing={printing}
        isSelected={false}
        actionsColumn="none"
        columns="1fr"
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    const row = container.querySelector('[data-printing-id="p-row-1"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute("role")).toBe("row");
  });
});

describe("getCardTableMinWidth", () => {
  // Regression: the table sits in a horizontal-scroll wrapper sized to this
  // width. If it drifts below the sum of the fixed grid-template columns +
  // gap-3 spacing, cells start clipping into the detail pane again at
  // intermediate viewport widths.
  it("matches the sum of fixed grid-template column tracks + gap-3 spacing", () => {
    expect(getCardTableMinWidth("none")).toBe(60 + 180 + 160 + 200 + 130 + 4 * 12);
    expect(getCardTableMinWidth("narrow")).toBe(60 + 180 + 160 + 200 + 130 + 80 + 5 * 12);
    expect(getCardTableMinWidth("wide")).toBe(60 + 180 + 160 + 200 + 130 + 220 + 5 * 12);
  });
});
