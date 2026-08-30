import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdminFilterSelect, AdminFilterSwitch } from "./admin-filters";

const options = [
  { value: "any", label: "Any state" },
  { value: "new", label: "New" },
  { value: "accepted", label: "Accepted" },
];

describe("AdminFilterSelect", () => {
  it("names the trigger so it is not an anonymous combobox", () => {
    render(
      <AdminFilterSelect value="any" onChange={vi.fn()} label="Triage state" options={options} />,
    );

    expect(screen.getByRole("combobox", { name: "Triage state" })).toBeInTheDocument();
  });

  it("shows the selected option's label rather than its value", () => {
    render(
      <AdminFilterSelect
        value="accepted"
        onChange={vi.fn()}
        label="Triage state"
        options={options}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Triage state" })).toHaveTextContent("Accepted");
  });

  it("reports the picked option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AdminFilterSelect value="any" onChange={onChange} label="Triage state" options={options} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Triage state" }));
    await user.click(await screen.findByRole("option", { name: "New" }));

    expect(onChange).toHaveBeenCalledWith("new");
  });
});

describe("AdminFilterSwitch", () => {
  it("toggles from its label, not just the switch", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <AdminFilterSwitch id="decklists" checked={checked} onChange={setChecked}>
          Decklists published
        </AdminFilterSwitch>
      );
    }
    render(<Harness />);

    const toggle = screen.getByRole("switch", { name: "Decklists published" });
    expect(toggle).not.toBeChecked();

    await user.click(screen.getByText("Decklists published"));

    expect(toggle).toBeChecked();
  });
});
