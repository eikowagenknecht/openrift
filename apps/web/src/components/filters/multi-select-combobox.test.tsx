import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MultiSelectCombobox } from "./multi-select-combobox";

// A single available option (Unlimited) standing in for a collection that now
// only holds UNL cards. "ogn" is the orphan: still selected in the URL state,
// but no longer present in the available options because every OGN card was
// moved out of the collection.
const UNL_OPTION = { value: "unl", label: "Unlimited", prefix: "UNL" } as const;

function renderSets(props: Partial<Parameters<typeof MultiSelectCombobox>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <MultiSelectCombobox
      triggerStyle="button"
      label="Sets"
      options={[UNL_OPTION]}
      selected={["ogn", "unl"]}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

describe("MultiSelectCombobox orphan selections", () => {
  it("keeps a selected value visible after it drops out of the options", async () => {
    const user = userEvent.setup();
    renderSets();

    // The trigger summarises the two selected values even though only one has a
    // backing option.
    await user.click(screen.getByRole("combobox"));

    // Both the available option and the orphan render as list rows, so the user
    // can see and act on either.
    expect(await screen.findByRole("option", { name: /Unlimited/u })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ogn" })).toBeInTheDocument();
  });

  it("lets the user clear a selected value that has no backing option", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSets();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "ogn" }));

    // Unticking the orphan removes only it, leaving the still-available UNL set.
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["unl"]);
  });

  it("does not duplicate a selected value that is still available", async () => {
    const user = userEvent.setup();
    renderSets({ selected: ["unl"] });

    // A single selection labels the trigger with that option, not the count.
    await user.click(screen.getByRole("combobox"));

    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
  });
});
