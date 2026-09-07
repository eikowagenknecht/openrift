import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MultiSelectCombobox } from "./multi-select-combobox";

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

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: /Unlimited/u })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ogn" })).toBeInTheDocument();
  });

  it("lets the user clear a selected value that has no backing option", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSets();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "ogn" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["unl"]);
  });

  it("does not duplicate a selected value that is still available", async () => {
    const user = userEvent.setup();
    renderSets({ selected: ["unl"] });

    await user.click(screen.getByRole("combobox"));

    const list = await screen.findByRole("listbox");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
  });
});

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

function renderWithFlags(
  flags: { label: string; state: boolean | null; onToggle: () => void }[],
  flagPosition: "top" | "bottom" = "bottom",
) {
  const onCycle = vi.fn();
  render(
    <MultiSelectCombobox
      triggerStyle="button"
      label="Art Variant"
      options={SET_OPTIONS}
      selected={[]}
      excluded={[]}
      onCycle={onCycle}
      flags={flags}
      flagPosition={flagPosition}
    />,
  );
  return { onCycle };
}

describe("MultiSelectCombobox flag rows", () => {
  it("routes a flag row click to that flag's onToggle and nowhere else", async () => {
    const user = userEvent.setup();
    const toggleOvernumbered = vi.fn();
    const toggleSigned = vi.fn();
    const { onCycle } = renderWithFlags([
      { label: "Overnumbered", state: null, onToggle: toggleOvernumbered },
      { label: "Signed", state: null, onToggle: toggleSigned },
    ]);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Signed" }));

    expect(toggleSigned).toHaveBeenCalledOnce();
    expect(toggleOvernumbered).not.toHaveBeenCalled();
    expect(onCycle).not.toHaveBeenCalled();
  });

  it("lists every flag after the options with one divider before the block", async () => {
    const user = userEvent.setup();
    renderWithFlags([
      { label: "Overnumbered", state: null, onToggle: vi.fn() },
      { label: "Signed", state: null, onToggle: vi.fn() },
    ]);

    await user.click(screen.getByRole("combobox"));

    const list = await screen.findByRole("listbox");
    const names = within(list)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual(["Origins", "Unlimited", "Beyond the Rift", "Overnumbered", "Signed"]);
    expect(list.querySelectorAll('[data-slot="combobox-separator"]')).toHaveLength(1);
  });

  it("leads with the flags and one divider after them at the top position", async () => {
    const user = userEvent.setup();
    renderWithFlags(
      [
        { label: "Has any marker", state: null, onToggle: vi.fn() },
        { label: "Signed", state: null, onToggle: vi.fn() },
      ],
      "top",
    );

    await user.click(screen.getByRole("combobox"));

    const list = await screen.findByRole("listbox");
    const names = within(list)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual(["Has any marker", "Signed", "Origins", "Unlimited", "Beyond the Rift"]);
    expect(list.querySelectorAll('[data-slot="combobox-separator"]')).toHaveLength(1);
  });

  it("names a single active flag on the trigger and signs an excluded one", () => {
    renderWithFlags([
      { label: "Overnumbered", state: null, onToggle: vi.fn() },
      { label: "Signed", state: true, onToggle: vi.fn() },
    ]);
    expect(screen.getByRole("combobox")).toHaveTextContent("Signed");
  });

  it("summarises several active flags with their signs", () => {
    renderWithFlags([
      { label: "Overnumbered", state: false, onToggle: vi.fn() },
      { label: "Signed", state: true, onToggle: vi.fn() },
    ]);
    expect(screen.getByRole("combobox")).toHaveTextContent("−Overnumbered, Signed");
  });
});

const MARKER_OPTIONS = [
  { value: "promo", label: "Promo" },
  { value: "judge", label: "Judge" },
] as const;

function renderInMenu() {
  const onCycle = vi.fn();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>More</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Banned</DropdownMenuItem>
        <MultiSelectCombobox
          triggerStyle="menu"
          label="Markers"
          searchPlaceholder="Search markers…"
          options={MARKER_OPTIONS}
          selected={[]}
          excluded={[]}
          onCycle={onCycle}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { onCycle };
}

describe("MultiSelectCombobox inside a dropdown menu", () => {
  it("types the search query into the combobox input, not the menu's typeahead", async () => {
    const user = userEvent.setup();
    renderInMenu();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByText("Markers"));

    const input = await screen.findByPlaceholderText("Search markers…");
    await user.type(input, "promo");

    expect(input).toHaveValue("promo");
    expect(screen.queryByRole("option", { name: /Judge/u })).not.toBeInTheDocument();
  });

  it("still navigates and picks a row with the keyboard", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderInMenu();

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByText("Markers"));
    await screen.findByPlaceholderText("Search markers…");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onCycle).toHaveBeenCalledExactlyOnceWith("promo");
  });
});
