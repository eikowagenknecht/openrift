import type { TradePreference } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { offeredPricePrefs, TradePreferenceEditor } from "./trade-preference-editor";

describe("offeredPricePrefs", () => {
  it("omits Fixed when editing a list's defaults", () => {
    const options = offeredPricePrefs(true, null);
    expect(options).not.toContain("absolute");
    // The marketplace presets remain valid list-wide defaults.
    expect(options).toEqual(["cm_lowest", "tcg_lowest", "ct_zero"]);
  });

  it("offers Fixed in the per-entry override editor", () => {
    expect(offeredPricePrefs(false, null)).toContain("absolute");
  });

  it("keeps Fixed for a list that already defaults to it", () => {
    // Grandfather existing Fixed-default lists so the dropdown still resolves
    // and the user can switch away from it.
    expect(offeredPricePrefs(true, "absolute")).toContain("absolute");
  });
});

describe("TradePreferenceEditor", () => {
  it("still renders the Fixed label for a grandfathered list default", () => {
    // If "absolute" were dropped from the items, BaseUI's <SelectValue> couldn't
    // resolve the label and the trigger would render blank.
    const fixed: TradePreference = {
      pricePref: "absolute",
      priceAbsoluteCents: 450,
      tradeType: null,
    };
    render(<TradePreferenceEditor value={fixed} onChange={vi.fn()} currency="EUR" />);

    expect(screen.getByLabelText("Price")).toHaveTextContent("Fixed");
  });
});
