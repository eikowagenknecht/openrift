import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: {
      finishes: ["normal"],
      rarities: ["common", "rare"],
      domains: [],
      cardTypes: [],
      superTypes: [],
      artVariants: ["normal"],
    },
    labels: {
      finishes: { normal: "Normal" },
      rarities: { common: "Common", rare: "Rare" },
      cardSizes: { standard: "Standard" },
      domains: {},
      cardTypes: {},
      superTypes: {},
      artVariants: { normal: "Normal" },
    },
    domainColors: {},
    rarityColors: {},
  }),
  useLanguageLabels: () => ({ EN: "English", DE: "German" }),
  useLanguageColors: () => ({}),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingRowContent, PrintingVariantLine } from "./printing-row";

describe("PrintingVariantLine", () => {
  it("omits the rarity icon when every sibling shares a rarity", () => {
    const printings = [stubPrinting({ rarity: "common" }), stubPrinting({ rarity: "common" })];

    render(<PrintingVariantLine printing={printings[0]!} siblings={printings} />);

    expect(screen.queryByAltText("common")).not.toBeInTheDocument();
  });

  it("shows each row's rarity icon when the siblings mix rarities", () => {
    const printings = [stubPrinting({ rarity: "common" }), stubPrinting({ rarity: "rare" })];

    render(<PrintingVariantLine printing={printings[1]!} siblings={printings} />);

    expect(screen.getByAltText("rare")).toBeInTheDocument();
  });

  it("omits the rarity icon when there is no sibling set to compare against", () => {
    render(<PrintingVariantLine printing={stubPrinting({ rarity: "rare" })} />);

    expect(screen.queryByAltText("rare")).not.toBeInTheDocument();
  });

  it("renders the code as plain text, never a link", () => {
    const printing = stubPrinting({ setSlug: "OGN" });

    render(<PrintingVariantLine printing={printing} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(printing.shortCode)).toBeInTheDocument();
  });
});

describe("PrintingRowContent", () => {
  it("shows no name line and a one-line thumbnail by default", () => {
    const printing = stubPrinting({ card: { name: "Lux" } });

    const { container } = render(<PrintingRowContent printing={printing} />);

    expect(screen.queryByText("Lux")).not.toBeInTheDocument();
    expect(container.querySelector(".h-8")).toBeInTheDocument();
    expect(container.querySelector(".h-10")).not.toBeInTheDocument();
  });

  it("adds the name line and the taller thumbnail when given a name", () => {
    const printing = stubPrinting();

    const { container } = render(<PrintingRowContent printing={printing} name="Lux" />);

    expect(screen.getByText("Lux")).toBeInTheDocument();
    expect(container.querySelector(".h-10")).toBeInTheDocument();
    expect(container.querySelector(".h-8")).not.toBeInTheDocument();
  });

  it("lets the caller override the thumbnail size", () => {
    const { container } = render(
      <PrintingRowContent printing={stubPrinting()} thumbClassName="h-12" />,
    );

    expect(container.querySelector(".h-12")).toBeInTheDocument();
    expect(container.querySelector(".h-8")).not.toBeInTheDocument();
  });

  it("renders the trailing slot", () => {
    render(<PrintingRowContent printing={stubPrinting()} right={<span>€1.23</span>} />);

    expect(screen.getByText("€1.23")).toBeInTheDocument();
  });
});
