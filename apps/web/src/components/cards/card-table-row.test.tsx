import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardTableRow } from "./card-table-row";

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
