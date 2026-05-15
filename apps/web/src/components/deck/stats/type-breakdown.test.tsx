import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { cloneElement } from "react";
import type * as Recharts from "recharts";
import { describe, expect, it, vi } from "vitest";

// Recharts' ResponsiveContainer measures its parent and renders 0x0 in jsdom,
// so the inner chart never paints its <text> ticks. Replacing it with a
// pass-through that injects explicit width/height into the child chart lets
// the BarChart commit X-axis labels to the DOM.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof Recharts>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 400, height: 200 } as Partial<typeof children.props>),
  };
});

vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({ fire: "#f00", water: "#00f" }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: {
      finishes: {},
      rarities: {},
      domains: { fire: "Fire", water: "Water" },
      cardTypes: { unit: "Unit", spell: "Spell" },
      superTypes: {},
      artVariants: {},
    },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { TypeBreakdown } from "./type-breakdown";

describe("TypeBreakdown x-axis labels", () => {
  it("renders display labels (not slugs) for card types", () => {
    const { container } = render(
      <TypeBreakdown
        data={[
          { type: "unit", total: 12, fire: 12 },
          { type: "spell", total: 1, water: 1 },
        ]}
        domains={["fire", "water"]}
        singleColor
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("12 Units");
    expect(text).toContain("1 Spell");
    expect(text).not.toMatch(/\b\d+ units?\b/u);
    expect(text).not.toMatch(/\b\d+ spells?\b/u);
  });
});
