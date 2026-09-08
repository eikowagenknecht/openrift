import type { RuleQuantity } from "@openrift/shared/types/list-rule";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { QuantityControl } from "@/features/lists/components/rule-quantity-control";

function Harness({ initial }: { initial: RuleQuantity }) {
  const [value, setValue] = useState<RuleQuantity>(initial);
  return <QuantityControl value={value} onChange={setValue} />;
}

describe("QuantityControl", () => {
  it("lets the amount be emptied while typing a playset multiplier", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "playset", multiplier: 1 }} />);
    const field = screen.getByLabelText("Quantity amount");

    await user.clear(field);

    expect(field).toHaveValue(null);

    await user.type(field, "3");

    expect(field).toHaveValue(3);
  });

  it("lets the amount be emptied while typing a fixed count", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "fixed", n: 1 }} />);
    const field = screen.getByLabelText("Quantity amount");

    await user.clear(field);

    expect(field).toHaveValue(null);

    await user.type(field, "4");

    expect(field).toHaveValue(4);
  });

  it("restores the clamped amount when an emptied field loses focus", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ mode: "playset", multiplier: 2 }} />);
    const field = screen.getByLabelText("Quantity amount");

    await user.clear(field);
    await user.tab();

    expect(field).toHaveValue(2);
  });
});
