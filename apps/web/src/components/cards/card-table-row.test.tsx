import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardTableRow, getCardTableColumns, getCardTableMinWidth } from "./card-table-row";

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
    expect(getCardTableMinWidth("narrow")).toBe(60 + 180 + 160 + 200 + 130 + 96 + 5 * 12);
    expect(getCardTableMinWidth("stepper")).toBe(60 + 180 + 160 + 200 + 130 + 150 + 5 * 12);
    expect(getCardTableMinWidth("wide")).toBe(60 + 180 + 160 + 200 + 130 + 220 + 5 * 12);
  });

  it("drops the grouped column's track and gap when grouping by set/type/rarity", () => {
    // Grouping by set removes the 160px Set track (and one 12px gap), since the
    // group headers already spell out the set on every row.
    expect(getCardTableMinWidth("narrow", "set")).toBe(60 + 180 + 200 + 130 + 96 + 4 * 12);
    expect(getCardTableMinWidth("narrow", "type")).toBe(60 + 180 + 160 + 130 + 96 + 4 * 12);
    expect(getCardTableMinWidth("narrow", "rarity")).toBe(60 + 180 + 160 + 200 + 96 + 4 * 12);
  });

  it("keeps every column for group axes without a matching column", () => {
    const full = getCardTableMinWidth("narrow");
    expect(getCardTableMinWidth("narrow", "none")).toBe(full);
    expect(getCardTableMinWidth("narrow", "domain")).toBe(full);
    expect(getCardTableMinWidth("narrow", "year")).toBe(full);
  });
});

describe("getCardTableColumns", () => {
  it("omits the grouped column's track", () => {
    expect(getCardTableColumns("narrow", "set")).toBe("60px minmax(180px, 1fr) 200px 130px 96px");
    expect(getCardTableColumns("stepper", "type")).toBe(
      "60px minmax(180px, 1fr) 160px 130px 150px",
    );
  });

  it("keeps all tracks when the group axis has no matching column", () => {
    expect(getCardTableColumns("wide", "domain")).toBe(
      "60px minmax(180px, 1fr) 160px 200px 130px 220px",
    );
  });
});
