import { describe, expect, it } from "vitest";

import { PRICE_SAMPLE_COUNT, chartDay, priceSeries, tickStep } from "./vignette-price-chart";

const source = { price: 3.8, phase: 4.1, swing: 1.1, rate: 0.011 };

describe("priceSeries", () => {
  it("returns one sample per plotted point", () => {
    expect(priceSeries(source, 90)).toHaveLength(PRICE_SAMPLE_COUNT);
  });

  it("ends on the source price so the last point matches the quoted value", () => {
    expect(priceSeries(source, 90).at(-1)).toBeCloseTo(source.price, 10);
  });

  it("is deterministic, so the server and client renders agree", () => {
    expect(priceSeries(source, 90)).toEqual(priceSeries(source, 90));
  });

  it("moves with the range", () => {
    expect(priceSeries(source, 30)).not.toEqual(priceSeries(source, 210));
  });
});

describe("tickStep", () => {
  it("picks a step that spans the range in two gaps", () => {
    expect(tickStep(3.6, 4)).toBe(0.25);
    expect(tickStep(1, 9)).toBe(5);
  });

  it("falls back to 50 for a range no listed step covers", () => {
    expect(tickStep(0, 1000)).toBe(50);
  });
});

describe("chartDay", () => {
  it("counts back from the pinned end day", () => {
    expect(chartDay(0)).toBe("2026-08-24");
    expect(chartDay(30)).toBe("2026-07-25");
  });
});
