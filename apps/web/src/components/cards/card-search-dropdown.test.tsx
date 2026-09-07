import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CardSearchResult } from "@/lib/card-search-result";

import { CardSearchDropdown } from "./card-search-dropdown";

const RESULTS: CardSearchResult[] = [
  { id: "azir", label: "Azir, Emperor of the Sands", sublabel: "emperor-of-the-sands" },
  { id: "jinx", label: "Jinx, Rebel", sublabel: "jinx-rebel" },
];

function Dropdown({ results }: { results: CardSearchResult[] }) {
  return (
    <CardSearchDropdown
      results={results}
      onSearch={vi.fn()}
      onSelect={vi.fn()}
      ariaLabel="Legend"
    />
  );
}

describe("CardSearchDropdown", () => {
  it("renders every row the surface matched, even when the label does not contain the query", async () => {
    const user = userEvent.setup();
    render(<Dropdown results={RESULTS} />);

    await user.type(screen.getByRole("combobox", { name: "Legend" }), "ogn202");

    expect(
      await screen.findByRole("option", { name: /Azir, Emperor of the Sands/u }),
    ).toBeVisible();
    expect(screen.getByRole("option", { name: /Jinx, Rebel/u })).toBeVisible();
  });

  it("shows the empty message only when the surface matched nothing", async () => {
    const user = userEvent.setup();
    render(<Dropdown results={[]} />);

    await user.type(screen.getByRole("combobox", { name: "Legend" }), "azir");

    expect(await screen.findByText("No matching cards")).toBeVisible();
  });
});
