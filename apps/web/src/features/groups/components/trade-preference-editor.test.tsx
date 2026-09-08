import type { TradePreference } from "@openrift/shared/types/api/trade-preferences";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { offeredPricePrefs, TradePreferenceEditor } from "./trade-preference-editor";

describe("offeredPricePrefs", () => {
  it("omits Fixed when editing a list's defaults", () => {
    const options = offeredPricePrefs(true, null);
    expect(options).not.toContain("absolute");
    expect(options).toEqual(["cm_lowest", "tcg_lowest", "ct_zero"]);
  });

  it("offers Fixed in the per-entry override editor", () => {
    expect(offeredPricePrefs(false, null)).toContain("absolute");
  });

  it("keeps Fixed for a list that already defaults to it, so it can be switched away from", () => {
    expect(offeredPricePrefs(true, "absolute")).toContain("absolute");
  });
});

describe("TradePreferenceEditor", () => {
  it("still renders the Fixed label for a grandfathered list default", () => {
    const fixed: TradePreference = {
      pricePref: "absolute",
      priceAbsoluteCents: 450,
      tradeType: null,
    };
    render(<TradePreferenceEditor value={fixed} onChange={vi.fn()} currency="EUR" />);

    expect(screen.getByLabelText("Price")).toHaveTextContent("Fixed");
  });

  it("lets the fixed amount be retyped digit by digit", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<TradePreference>({
        pricePref: "absolute",
        priceAbsoluteCents: 450,
        tradeType: null,
      });
      return <TradePreferenceEditor value={value} onChange={setValue} currency="EUR" />;
    }
    render(<Harness />);
    const amount = screen.getByLabelText("Amount");

    await user.clear(amount);

    expect(amount).toHaveValue("");

    await user.type(amount, "12.5");

    expect(amount).toHaveValue("12.5");

    await user.tab();

    expect(amount).toHaveValue("12.50");
  });
});
