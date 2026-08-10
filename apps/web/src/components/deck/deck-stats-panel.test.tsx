import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { DomainBar } from "./deck-stats-panel";

const COLORS = { fury: "#f00", calm: "#00f" };

const DISTRIBUTION = [
  { domain: "fury", count: 30 },
  { domain: "calm", count: 10 },
];

/**
 * The colored segments of a rendered bar, in DOM order.
 * @returns The segment elements.
 */
function segmentsOf(container: HTMLElement) {
  return [...container.querySelectorAll("span")].filter((el) => el.style.backgroundColor !== "");
}

describe("DomainBar", () => {
  it("renders nothing without cards", () => {
    const { container } = render(<DomainBar data={[]} total={0} colors={COLORS} />);
    expect(container.innerHTML).toBe("");
  });

  it("sizes each segment by its share of the total", () => {
    const { container } = render(<DomainBar data={DISTRIBUTION} total={40} colors={COLORS} />);
    const widths = segmentsOf(container).map((el) => el.style.width);
    expect(widths).toEqual(["75%", "25%"]);
  });

  it("skips domains with no copies", () => {
    const { container } = render(
      <DomainBar
        data={[...DISTRIBUTION, { domain: "mind", count: 0 }]}
        total={40}
        colors={COLORS}
      />,
    );
    expect(segmentsOf(container)).toHaveLength(2);
  });

  // The editor sidebar's identity header is itself a button, so its copy of the
  // bar must not nest interactive tooltip triggers inside it.
  it("drops the tooltip triggers when not interactive", () => {
    const { container, queryAllByRole } = render(
      <DomainBar data={DISTRIBUTION} total={40} colors={COLORS} interactive={false} />,
    );
    expect(queryAllByRole("button")).toHaveLength(0);
    expect(segmentsOf(container).map((el) => el.style.width)).toEqual(["75%", "25%"]);
  });
});
