import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FieldDef } from "./candidate-spreadsheet";
import { CandidateSpreadsheet } from "./candidate-spreadsheet";

const markerField: FieldDef = {
  key: "markerSlugs",
  label: "Markers",
  array: true,
  labeledOptions: [
    { value: "champion", label: "Champion" },
    { value: "unit", label: "Unit" },
    { value: "spell", label: "Spell" },
  ],
};

describe("CandidateSpreadsheet multi-select", () => {
  it("batches toggles and only calls onActiveChange when the dropdown closes", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    // Open the multi-select editor by clicking the active cell (shows the current value).
    await user.click(screen.getByText("Champion"));

    // Toggle two items: deselect Champion, select Unit and Spell.
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Champion" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Unit" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Spell" }));

    // No mutation fired during the intermediate toggles.
    expect(onActiveChange).not.toHaveBeenCalled();

    // Close the dropdown (Escape triggers onOpenChange(false)).
    await user.keyboard("{Escape}");

    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange).toHaveBeenCalledWith("markerSlugs", ["unit", "spell"]);
  });

  it("does not call onActiveChange when closed with no net changes", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("Champion"));
    // Toggle Unit on then off — ends where it started.
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Unit" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Unit" }));
    await user.keyboard("{Escape}");

    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("passes null when all items are deselected", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("Champion"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Champion" }));
    await user.keyboard("{Escape}");

    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange).toHaveBeenCalledWith("markerSlugs", null);
  });
});
