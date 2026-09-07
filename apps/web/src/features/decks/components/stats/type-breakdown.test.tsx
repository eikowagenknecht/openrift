import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { cloneElement } from "react";
import type * as Recharts from "recharts";
import { describe, expect, it, vi } from "vitest";

import type { TypeCount } from "@/features/collections/lib/stat-types";

// jsdom renders ResponsiveContainer at 0x0, so the chart never paints <text> ticks; force explicit dimensions.
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
import { activeRowIndex } from "./energy-power-chart";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { TypeBreakdown } from "./type-breakdown";

describe("activeRowIndex", () => {
  // Exactly the fields recharts 3 hands external handlers; `activePayload` is a v2 field and is absent.
  const v3State = {
    activeCoordinate: { x: 120, y: 40 },
    activeDataKey: "fury",
    activeIndex: "1",
    activeLabel: "3 Spells",
    activeTooltipIndex: "1",
    isTooltipActive: true,
  };

  it("resolves the clicked column from the v3 state's string index", () => {
    expect(activeRowIndex(v3State, 3)).toBe(1);
  });

  it("falls back to activeTooltipIndex when activeIndex is absent", () => {
    expect(activeRowIndex({ activeTooltipIndex: "2" }, 3)).toBe(2);
  });

  it("resolves a numeric index too", () => {
    expect(activeRowIndex({ activeIndex: 0 }, 3)).toBe(0);
  });

  it("returns null for a click that landed on no column", () => {
    expect(activeRowIndex({ activeIndex: null }, 3)).toBeNull();
    expect(activeRowIndex({}, 3)).toBeNull();
    expect(activeRowIndex({ activeIndex: "" }, 3)).toBeNull();
  });

  it("rejects an index outside the data", () => {
    expect(activeRowIndex({ activeIndex: "3" }, 3)).toBeNull();
    expect(activeRowIndex({ activeIndex: "-1" }, 3)).toBeNull();
    expect(activeRowIndex({ activeIndex: "1.5" }, 3)).toBeNull();
    expect(activeRowIndex({ activeIndex: "fury" }, 3)).toBeNull();
  });
});

const TWO_TYPES: TypeCount[] = [
  { type: "unit", total: 12, fire: 12 },
  { type: "spell", total: 1, water: 1 },
];

function barOpacities(container: HTMLElement): string[] {
  return [...container.querySelectorAll("path.recharts-rectangle")].map(
    (rect) => rect.getAttribute("fill-opacity") ?? "1",
  );
}

describe("TypeBreakdown focused column", () => {
  it("dims the other columns when a column is focused", () => {
    const { container } = render(
      <TypeBreakdown data={TWO_TYPES} domains={["fire", "water"]} focusValue="spell" />,
    );
    const opacities = barOpacities(container);
    expect(opacities).toContain("0.3");
    expect(opacities).toContain("1");
  });

  it("leaves every column lit when nothing is focused", () => {
    const { container } = render(<TypeBreakdown data={TWO_TYPES} domains={["fire", "water"]} />);
    expect(barOpacities(container)).not.toContain("0.3");
  });
});

describe("TypeBreakdown cross-filter split", () => {
  it("splits a segment into a lit match and a faded remainder", () => {
    const { container } = render(
      <TypeBreakdown
        data={[{ type: "unit", total: 12, fire: 12 }]}
        domains={["fire"]}
        hitData={[{ type: "unit", total: 4, fire: 4 }]}
      />,
    );
    expect(barOpacities(container).toSorted()).toEqual(["0.3", "1"]);
  });

  it("fades a column whole when nothing in it matches", () => {
    const { container } = render(
      <TypeBreakdown data={TWO_TYPES} domains={["fire", "water"]} hitData={[]} />,
    );
    expect(barOpacities(container).every((value) => value === "0.3")).toBe(true);
  });

  it("leaves the bars alone without hitData", () => {
    const { container } = render(<TypeBreakdown data={TWO_TYPES} domains={["fire", "water"]} />);
    expect(barOpacities(container)).not.toContain("0.3");
  });
});

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
