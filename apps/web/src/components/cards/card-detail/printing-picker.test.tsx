import { render } from "@testing-library/react";
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

  // The 30-day history is only a fallback for rows with no current price.
  // Fetching it unconditionally fans out into one price-history call per
  // printing every time a card is selected (Sentry: N+1 API call on /cards).
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
});
