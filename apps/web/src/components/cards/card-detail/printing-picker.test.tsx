import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: {
      finishes: ["normal"],
      rarities: ["common"],
      domains: [],
      cardTypes: [],
      superTypes: [],
      artVariants: ["normal"],
    },
    labels: {
      finishes: { normal: "Normal" },
      rarities: { Common: "common" },
      domains: {},
      cardTypes: {},
      superTypes: {},
      artVariants: { normal: "Normal" },
    },
    domainColors: {},
    rarityColors: {},
  }),
  // Deliberately not alphabetical: the tab-order test proves the picker follows this order.
  useLanguageList: () => [
    { code: "EN", name: "English", color: null },
    { code: "JA", name: "Japanese", color: null },
    { code: "DE", name: "German", color: null },
  ],
  useLanguageLabels: () => ({ EN: "English", JA: "Japanese", DE: "German" }),
}));

const { priceGetMock, priceHistoryMock } = vi.hoisted(() => ({
  priceGetMock: vi.fn((): number | null | undefined => null),
  priceHistoryMock: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ get: priceGetMock }),
}));

vi.mock("@/hooks/use-price-history", () => ({
  usePriceHistory: priceHistoryMock,
}));

// Render a button inside the mocked popover so the test exercises the worst case:
// if the outer row is also a <button>, the rendered DOM contains nested buttons.
vi.mock("./owned-collections-popover", () => ({
  OwnedCollectionsPopover: () => <button type="button">owned</button>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingPicker } from "./printing-picker";

describe("PrintingPicker", () => {
  beforeEach(() => {
    priceGetMock.mockReset();
    priceGetMock.mockReturnValue(null);
    priceHistoryMock.mockClear();
  });

  it("does not nest a <button> inside another <button>", () => {
    const printing = stubPrinting();
    const { container } = render(
      <PrintingPicker current={printing} printings={[printing]} onSelect={() => {}} />,
    );
    const nested = container.querySelectorAll("button button");
    expect(nested).toHaveLength(0);
  });

  it("renders the row as a non-button element with role=button", () => {
    const printing = stubPrinting();
    const { container } = render(
      <PrintingPicker current={printing} printings={[printing]} onSelect={() => {}} />,
    );
    const row = container.querySelector('[role="button"]');
    expect(row).not.toBeNull();
    expect(row?.tagName).not.toBe("BUTTON");
  });

  it("skips the price-history fetch when an inline price exists", () => {
    priceGetMock.mockReturnValue(4.2);
    const printing = stubPrinting();

    render(<PrintingPicker current={printing} printings={[printing]} onSelect={() => {}} />);

    expect(priceHistoryMock).toHaveBeenCalledWith(null, "30d");
  });

  it("fetches the price history as a fallback when no inline price exists", () => {
    priceGetMock.mockReturnValue(undefined);
    const printing = stubPrinting();

    render(<PrintingPicker current={printing} printings={[printing]} onSelect={() => {}} />);

    expect(priceHistoryMock).toHaveBeenCalledWith(printing.id, "30d");
  });

  describe("language tabs", () => {
    it("shows no tabs when every printing shares one language", () => {
      const printings = [stubPrinting(), stubPrinting()];

      render(<PrintingPicker current={printings[0]!} printings={printings} onSelect={() => {}} />);

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });

    it("offers one tab per language, in taxonomy order", () => {
      const printings = [
        stubPrinting({ language: "DE" }),
        stubPrinting({ language: "EN" }),
        stubPrinting({ language: "JA" }),
      ];

      render(<PrintingPicker current={printings[1]!} printings={printings} onSelect={() => {}} />);

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
        "EN1",
        "JA1",
        "DE1",
      ]);
    });

    it("opens on the shown card's language", () => {
      const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "DE" })];

      render(<PrintingPicker current={printings[1]!} printings={printings} onSelect={() => {}} />);

      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("DE");
    });

    it("shows only the active language's printings", async () => {
      const user = userEvent.setup();
      const english = stubPrinting({ language: "EN" });
      const german = stubPrinting({ language: "DE" });

      render(
        <PrintingPicker current={english} printings={[english, german]} onSelect={() => {}} />,
      );

      expect(
        within(screen.getByRole("tabpanel")).getAllByRole("button", { name: "owned" }),
      ).toHaveLength(1);

      await user.click(screen.getByRole("tab", { name: /DE/u }));

      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("DE");
      expect(
        within(screen.getByRole("tabpanel")).getAllByRole("button", { name: "owned" }),
      ).toHaveLength(1);
    });

    it("keeps a language not present in the taxonomy reachable", () => {
      const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "XX" })];

      render(<PrintingPicker current={printings[0]!} printings={printings} onSelect={() => {}} />);

      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["EN1", "XX1"]);
    });

    it("falls back to the first tab when the shown card's language has no rows", () => {
      const current = stubPrinting({ language: "JA" });
      const printings = [stubPrinting({ language: "EN" }), stubPrinting({ language: "DE" })];

      render(<PrintingPicker current={current} printings={printings} onSelect={() => {}} />);

      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("EN");
    });
  });
});
