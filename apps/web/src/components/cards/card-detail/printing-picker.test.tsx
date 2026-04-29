import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      rarities: ["Common"],
      domains: [],
      cardTypes: [],
      superTypes: [],
      artVariants: ["normal"],
    },
    labels: {
      finishes: { normal: "Normal" },
      rarities: { Common: "Common" },
      domains: {},
      cardTypes: {},
      superTypes: {},
      artVariants: { normal: "Normal" },
    },
    domainColors: {},
    rarityColors: {},
  }),
}));

vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => ({ get: () => null }),
}));

vi.mock("@/hooks/use-price-history", () => ({
  usePriceHistory: () => ({ data: undefined }),
}));

// Render a button inside the mocked popover so the test exercises the worst case:
// if the outer row is also a <button>, the rendered DOM contains nested buttons.
vi.mock("./owned-collections-popover", () => ({
  OwnedCollectionsPopover: () => <button type="button">owned</button>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingPicker } from "./printing-picker";

describe("PrintingPicker", () => {
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
});
