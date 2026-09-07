import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LensRow, LensSeries } from "@/lib/deck-stat-lenses";

import { LensBar } from "./lens-bar";

const SERIES: LensSeries[] = [
  { key: "common", label: "Common", color: "#aaa" },
  { key: "rare", label: "Rare", color: "#a0f" },
];

const ROWS: LensRow[] = [
  { key: "common", label: "12 Common", total: 12, segments: { common: 12 } },
  { key: "rare", label: "3 Rare", total: 3, segments: { rare: 3 } },
];

describe("LensBar", () => {
  it("renders nothing without counted copies", () => {
    const { container } = render(
      <LensBar
        title="Rarity"
        rows={[{ key: "common", label: "0 Common", total: 0, segments: { common: 0 } }]}
        series={SERIES}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders the title and a legend entry per row", () => {
    const { container } = render(<LensBar title="Rarity" rows={ROWS} series={SERIES} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Rarity");
    expect(text).toContain("12 Common");
    expect(text).toContain("3 Rare");
  });

  it("clicking a segment or legend entry reports the row key", () => {
    const onSegmentClick = vi.fn();
    const { getAllByRole } = render(
      <LensBar rows={ROWS} series={SERIES} onSegmentClick={onSegmentClick} />,
    );
    const buttons = getAllByRole("button");
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[1]!);
    expect(onSegmentClick).toHaveBeenCalledWith("rare");
  });

  it("dims everything but the focused segment", () => {
    const { getAllByRole } = render(
      <LensBar rows={ROWS} series={SERIES} onSegmentClick={() => {}} focusValue="rare" />,
    );
    const opacities = getAllByRole("button").map((el) => el.style.opacity);
    expect(opacities).toContain("0.3");
    expect(opacities).toContain("1");
  });

  it("splits segments into a lit hit portion and a faded remainder", () => {
    const { container } = render(
      <LensBar
        rows={[ROWS[0]!]}
        series={SERIES}
        hitRows={[{ key: "common", label: "", total: 4, segments: { common: 4 } }]}
      />,
    );
    const parts = [...container.querySelectorAll("span")].filter(
      (el) => el.style.flexGrow !== "" && el.style.backgroundColor !== "",
    );
    expect(parts).toHaveLength(2);
    expect(Number(parts[0]!.style.flexGrow)).toBeCloseTo(4 / 12, 5);
    expect(parts[1]!.style.opacity).toBe("0.3");
  });

  it("keeps zero rows in the legend but out of the bar", () => {
    const rows: LensRow[] = [
      { key: "common", label: "12 Common", total: 12, segments: { common: 12 } },
      { key: "rare", label: "0 Rare", total: 0, segments: { rare: 0 } },
    ];
    const { container, getAllByRole } = render(
      <LensBar rows={rows} series={SERIES} onSegmentClick={() => {}} />,
    );
    expect(container.textContent).toContain("0 Rare");
    expect(getAllByRole("button")).toHaveLength(2);
  });
});
