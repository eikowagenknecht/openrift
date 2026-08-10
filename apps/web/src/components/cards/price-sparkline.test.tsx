import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { priceHistoryMock } = vi.hoisted(() => ({
  priceHistoryMock: vi.fn((): { data: unknown } => ({ data: undefined })),
}));

vi.mock("@/hooks/use-price-history", () => ({
  usePriceHistory: priceHistoryMock,
}));

// Recharts measures its container, which jsdom reports as 0x0; the chart body
// is not what these tests are about, so stub the container away.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
}));

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PriceSparkline } from "./price-sparkline";

function snapshotsFor(values: (number | null)[]) {
  return {
    cardtrader: {
      snapshots: values.map((value, index) => ({
        date: `2026-08-0${index + 1}`,
        low: value,
        zeroLow: null,
      })),
    },
  };
}

describe("PriceSparkline", () => {
  beforeEach(() => {
    priceHistoryMock.mockReset();
  });

  // Regression: the history is a plain query, so switching printings leaves
  // `data` undefined for a moment. Returning null there collapsed the row and
  // the whole detail sprang back when the data landed.
  it("holds the row's height while the history is still loading", () => {
    priceHistoryMock.mockReturnValue({ data: undefined });

    const { container } = render(<PriceSparkline printingId="p1" />);

    const placeholder = container.querySelector('[data-slot="skeleton"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.className).toContain("h-12");
  });

  it("renders the chart once the history has points to plot", () => {
    priceHistoryMock.mockReturnValue({ data: snapshotsFor([1.5, 2, 2.5]) });

    render(<PriceSparkline printingId="p1" />);

    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  // A loaded-but-empty history is a real "nothing to show", not a transient
  // gap, so the row collapses rather than holding space forever.
  it("renders nothing when the loaded history has too few points", () => {
    priceHistoryMock.mockReturnValue({ data: snapshotsFor([1.5]) });

    const { container } = render(<PriceSparkline printingId="p1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
