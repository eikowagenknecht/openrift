import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ChipInput,
  FieldRow,
  MultiSelectDropdown,
  NumberInput,
  SingleSelect,
} from "@/features/contribute/components/form-fields";

describe("FieldRow", () => {
  it("labels a plain input", () => {
    render(
      <FieldRow label="Name">
        <Input />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Name")).toBe(screen.getByRole("textbox"));
  });

  it("labels a textarea", () => {
    render(
      <FieldRow label="Note">
        <Textarea />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Note").tagName).toBe("TEXTAREA");
  });

  it("labels a NumberInput", () => {
    render(
      <FieldRow label="Might">
        <NumberInput value={3} onChange={() => undefined} />
      </FieldRow>,
    );

    const input = screen.getByLabelText("Might");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(3);
  });

  it("labels a SingleSelect trigger", () => {
    render(
      <FieldRow label="Rarity">
        <SingleSelect
          value="common"
          onChange={() => undefined}
          options={["common"]}
          labels={{ common: "Common" }}
          placeholder="Pick a rarity"
        />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Rarity")).toHaveAttribute("data-slot", "select-trigger");
  });

  it("labels a MultiSelectDropdown trigger", () => {
    render(
      <FieldRow label="Markers">
        <MultiSelectDropdown
          value={[]}
          onChange={() => undefined}
          options={[{ slug: "promo", label: "Promo" }]}
          placeholder="None"
        />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Markers")).toHaveAttribute("data-slot", "combobox-trigger");
  });

  it("labels a ChipInput", () => {
    render(
      <FieldRow label="Tags">
        <ChipInput value={[]} onChange={() => undefined} placeholder="Poro" />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Tags")).toHaveAttribute("data-slot", "combobox-chip-input");
  });

  it("labels a Switch", () => {
    render(
      <FieldRow label="Signed">
        <Switch checked={false} onCheckedChange={() => undefined} />
      </FieldRow>,
    );

    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-labelledby")).toBe(screen.getByText("Signed").id);
  });

  it("points a ToggleGroup at the label with aria-labelledby", () => {
    render(
      <FieldRow label="Domains">
        <ToggleGroup multiple value={[]} onValueChange={() => undefined}>
          <ToggleGroupItem value="fury">Fury</ToggleGroupItem>
        </ToggleGroup>
      </FieldRow>,
    );

    const group = screen.getByLabelText("Domains");
    expect(group).toHaveAttribute("data-slot", "toggle-group");
    expect(group.getAttribute("aria-labelledby")).toBe(screen.getByText("Domains").id);
  });

  it("labels a required field, marker and all", () => {
    render(
      <FieldRow label="Name" required>
        <Input />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Name *")).toBe(screen.getByRole("textbox"));
    expect(screen.getByLabelText(/^Name/u)).toBe(screen.getByRole("textbox"));
  });

  it("focuses the control when the label is clicked", async () => {
    const user = userEvent.setup();
    render(
      <FieldRow label="Artist">
        <Input />
      </FieldRow>,
    );

    await user.click(screen.getByText("Artist"));

    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("leaves an id the child already sets alone", () => {
    render(
      <FieldRow label="Code">
        <Input id="own-id" />
      </FieldRow>,
    );

    expect(screen.getByLabelText("Code")).toHaveAttribute("id", "own-id");
    expect(screen.getByText("Code")).toHaveAttribute("for", "own-id");
  });
});
