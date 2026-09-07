import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { CardTableRow, getCardTableColumns, getCardTableMinWidth } from "./card-table-row";

describe("CardTableRow", () => {
  it("renders data-printing-id on the row so keyboard `-` can anchor the dispose picker to it", () => {
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

  it("renders the printing's note and citation links only when the surface asks for the column", () => {
    const printing = stubPrinting({
      id: "p-row-2",
      comment: "Handed out at the launch event",
      citations: [{ id: "c-1", label: "Reveal stream", sourceUrl: "https://youtu.be/abc" }],
    });
    const props = {
      printing,
      actionsColumn: "none",
      columns: "1fr",
      cardTypeLabels: {},
      superTypeLabels: {},
      rarityLabels: { common: "Common" },
      setNameBySlug: new Map<string, string>(),
      onRowClick: () => {},
    } as const;

    const withoutNotes = render(<CardTableRow {...props} />);
    expect(withoutNotes.queryByLabelText("Reveal stream")).toBeNull();
    expect(withoutNotes.queryByLabelText("Printing note")).toBeNull();
    withoutNotes.unmount();

    const withNotes = render(
      <CardTableRow {...props} options={{ columns: ["image", "name", "notes"] }} />,
    );
    expect(withNotes.getByLabelText("Printing note")).not.toBeNull();
    expect(withNotes.getByLabelText("Reveal stream").getAttribute("href")).toBe(
      "https://youtu.be/abc",
    );
  });

  it("names the printing's channel, counting the ones the cell has no room for", () => {
    const printing = stubPrinting({
      id: "p-row-3",
      distributionChannels: [
        {
          channel: {
            id: "ch-1",
            slug: "worlds-2026",
            label: "Worlds 2026",
            description: null,
            kind: "event",
            parentId: "ch-0",
            childrenLabel: null,
          },
          distributionNote: null,
          ancestorLabels: ["Events", "Championships"],
        },
        {
          channel: {
            id: "ch-2",
            slug: "store-kit",
            label: "Store Kit",
            description: null,
            kind: "product",
            parentId: null,
            childrenLabel: null,
          },
          distributionNote: null,
          ancestorLabels: [],
        },
      ],
    });
    const { getByText, container } = render(
      <CardTableRow
        printing={printing}
        actionsColumn="none"
        columns="1fr"
        options={{ columns: ["name", "channel"] }}
        cardTypeLabels={{}}
        superTypeLabels={{}}
        rarityLabels={{ common: "Common" }}
        setNameBySlug={new Map()}
        onRowClick={() => {}}
      />,
    );
    expect(getByText("Worlds 2026")).not.toBeNull();
    expect(getByText("Events › Championships")).not.toBeNull();
    expect(getByText("+1")).not.toBeNull();
    expect(container.querySelector('[title*="Store Kit"]')).not.toBeNull();
  });
});

describe("getCardTableMinWidth", () => {
  // The horizontal-scroll wrapper is sized to this width; below the sum of
  // fixed columns + gap-3, cells clip into the detail pane at mid viewports.
  it("matches the sum of fixed grid-template column tracks + gap-3 spacing", () => {
    expect(getCardTableMinWidth("none")).toBe(72 + 180 + 160 + 200 + 130 + 4 * 12);
    expect(getCardTableMinWidth("narrow")).toBe(72 + 180 + 160 + 200 + 130 + 96 + 5 * 12);
    expect(getCardTableMinWidth("stepper")).toBe(72 + 180 + 160 + 200 + 130 + 150 + 5 * 12);
    expect(getCardTableMinWidth("wide")).toBe(72 + 180 + 160 + 200 + 130 + 220 + 5 * 12);
  });

  it("drops the grouped column's track and gap when grouping by set/type/rarity", () => {
    expect(getCardTableMinWidth("narrow", "set")).toBe(72 + 180 + 200 + 130 + 96 + 4 * 12);
    expect(getCardTableMinWidth("narrow", "type")).toBe(72 + 180 + 160 + 130 + 96 + 4 * 12);
    expect(getCardTableMinWidth("narrow", "rarity")).toBe(72 + 180 + 160 + 200 + 96 + 4 * 12);
  });

  it("sizes a surface's own column set, not the default one", () => {
    expect(getCardTableMinWidth("narrow", undefined, { columns: ["image", "name", "notes"] })).toBe(
      72 + 180 + 112 + 96 + 3 * 12,
    );
    expect(
      getCardTableMinWidth("narrow", undefined, {
        columns: ["image", "name", "channel", "notes"],
      }),
    ).toBe(72 + 180 + 200 + 112 + 96 + 4 * 12);
    expect(getCardTableMinWidth("narrow", undefined, {})).toBe(getCardTableMinWidth("narrow"));
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
    expect(getCardTableColumns("narrow", "set")).toBe("72px minmax(180px, 1fr) 200px 130px 96px");
    expect(getCardTableColumns("stepper", "type")).toBe(
      "72px minmax(180px, 1fr) 160px 130px 150px",
    );
  });

  it("emits only the tracks the surface asked for, before the actions track", () => {
    expect(
      getCardTableColumns("narrow", undefined, {
        columns: ["image", "name", "channel", "notes"],
      }),
    ).toBe("72px minmax(180px, 1fr) 200px minmax(112px, 0.8fr) 96px");
  });

  it("moves the flexible track to the column named by `stretch`", () => {
    expect(
      getCardTableColumns("narrow", undefined, {
        columns: ["image", "name", "channel", "notes"],
        stretch: "channel",
      }),
    ).toBe("72px minmax(180px, 240px) minmax(200px, 1fr) minmax(112px, 0.8fr) 96px");
  });

  it("keeps the canonical left-to-right order whatever order the surface names", () => {
    expect(getCardTableColumns("none", undefined, { columns: ["notes", "name", "image"] })).toBe(
      "72px minmax(180px, 1fr) minmax(112px, 0.8fr)",
    );
  });

  it("keeps all tracks when the group axis has no matching column", () => {
    expect(getCardTableColumns("wide", "domain")).toBe(
      "72px minmax(180px, 1fr) 160px 200px 130px 220px",
    );
  });
});
