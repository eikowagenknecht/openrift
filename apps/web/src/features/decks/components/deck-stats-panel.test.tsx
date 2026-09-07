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

  it("drops tooltip triggers when not interactive, so they don't nest inside the sidebar's own button header", () => {
    const { container, queryAllByRole } = render(
      <DomainBar data={DISTRIBUTION} total={40} colors={COLORS} interactive={false} />,
    );
    expect(queryAllByRole("button")).toHaveLength(0);
    expect(segmentsOf(container).map((el) => el.style.width)).toEqual(["75%", "25%"]);
  });
});
