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

// The rule editor's dropdowns are a single cycling include/exclude axis behind a
// placeholder, so the trigger must distinguish the two buckets rather than
// collapse them into a single "N selected".
const SET_OPTIONS = [
  { value: "ogn", label: "Origins" },
  { value: "unl", label: "Unlimited" },
  { value: "btr", label: "Beyond the Rift" },
] as const;

function renderIncludeExclude(include: string[], exclude: string[]) {
  const onCycle = vi.fn();
  render(
    <MultiSelectCombobox
      triggerStyle="button"
      label="Sets"
      placeholder="Any"
      options={SET_OPTIONS}
      selected={include}
      excluded={exclude}
      onCycle={onCycle}
    />,
  );
  return { onCycle };
}

describe("MultiSelectCombobox include/exclude summary", () => {
  it("shows the placeholder when nothing is selected", () => {
    renderIncludeExclude([], []);
    expect(screen.getByRole("combobox")).toHaveTextContent("Any");
  });

  it("names a single included value with a + prefix", () => {
    renderIncludeExclude(["ogn"], []);
    expect(screen.getByRole("combobox")).toHaveTextContent("+Origins");
  });

  it("counts multiple included values", () => {
    renderIncludeExclude(["ogn", "unl"], []);
    expect(screen.getByRole("combobox")).toHaveTextContent("+2");
  });

  it("names a single excluded value with a − prefix", () => {
    renderIncludeExclude([], ["unl"]);
    expect(screen.getByRole("combobox")).toHaveTextContent("−Unlimited");
  });

  it("summarises both buckets together instead of a bare count", () => {
    renderIncludeExclude(["ogn"], ["unl", "btr"]);
    expect(screen.getByRole("combobox")).toHaveTextContent("+Origins, −2");
  });
});

describe("MultiSelectCombobox cycling rows", () => {
  it("routes a row click to onCycle with the option's value", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderIncludeExclude([], []);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Origins" }));

    expect(onCycle).toHaveBeenCalledExactlyOnceWith("ogn");
  });

  it("cycles an already-included row on click (the parent flips it to exclude)", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderIncludeExclude(["ogn"], []);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Origins" }));

    expect(onCycle).toHaveBeenCalledExactlyOnceWith("ogn");
  });

  it("keeps an excluded value with no backing option visible and cyclable", async () => {
    const user = userEvent.setup();
    const onCycle = vi.fn();
    // Only UNL has a backing option; "ogn" is excluded but no longer available.
    render(
      <MultiSelectCombobox
        triggerStyle="button"
        label="Sets"
        placeholder="Any"
        options={[UNL_OPTION]}
        selected={[]}
        excluded={["ogn"]}
        onCycle={onCycle}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "ogn" }));

    expect(onCycle).toHaveBeenCalledExactlyOnceWith("ogn");
  });
});
