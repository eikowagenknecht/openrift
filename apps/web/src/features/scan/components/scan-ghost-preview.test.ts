import { describe, expect, it } from "vitest";

import { ghostAppearance } from "./scan-ghost-preview";

describe("ghostAppearance", () => {
  it("is faint and fully blurred at zero confidence", () => {
    expect(ghostAppearance(0)).toEqual({ opacity: 0.3, blurPx: 6 });
  });

  it("is nearly solid and sharp at full confidence", () => {
    expect(ghostAppearance(1)).toEqual({ opacity: 0.95, blurPx: 0 });
  });

  it("interpolates between the bounds", () => {
    expect(ghostAppearance(0.5)).toEqual({ opacity: 0.63, blurPx: 3 });
  });

  it("rises monotonically in opacity and falls monotonically in blur", () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => ghostAppearance(value));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.opacity).toBeGreaterThan(steps[i - 1]!.opacity);
      expect(steps[i]!.blurPx).toBeLessThan(steps[i - 1]!.blurPx);
    }
  });

  it("clamps confidences above 1", () => {
    expect(ghostAppearance(1.7)).toEqual(ghostAppearance(1));
  });

  it("clamps negative confidences", () => {
    expect(ghostAppearance(-2)).toEqual(ghostAppearance(0));
  });

  it("treats non-finite confidences as zero", () => {
    expect(ghostAppearance(Number.NaN)).toEqual(ghostAppearance(0));
    expect(ghostAppearance(Number.POSITIVE_INFINITY)).toEqual(ghostAppearance(0));
  });

  it("rounds to two decimals so the style string stays stable", () => {
    const { opacity, blurPx } = ghostAppearance(1 / 3);
    expect(opacity).toBe(0.52);
    expect(blurPx).toBe(4);
  });
});
