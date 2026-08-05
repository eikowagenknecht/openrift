import { ALL_SEARCH_FIELDS } from "@openrift/shared";
import type { SearchField } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseFilterValues, mockUseFilterActions, mockTrackEvent } = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: mockTrackEvent,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { SearchBar } from "./search-bar";

function setup({
  search = "",
  scope = [...ALL_SEARCH_FIELDS],
}: {
  search?: string;
  scope?: SearchField[];
} = {}) {
  const actions = {
    setSearch: vi.fn(),
    toggleSearchField: vi.fn(),
    selectAllSearchFields: vi.fn(),
    selectOnlySearchField: vi.fn(),
  };
  mockUseFilterValues.mockReturnValue({
    filterState: { search },
    searchScope: scope,
    hasActiveFilters: search !== "",
    view: "cards",
  });
  mockUseFilterActions.mockReturnValue(actions);
  render(<SearchBar totalCards={40} filteredCount={12} />);
  return actions;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SearchBar scope chip", () => {
  it("shows the chip while the input is empty when the scope is narrowed", () => {
    setup({ scope: ["cardText"] });

    expect(screen.getByText("in: card text")).toBeInTheDocument();
  });

  it("summarizes more than two scope fields with a +N suffix", () => {
    setup({ scope: ["name", "cardText", "keywords"] });

    expect(screen.getByText("in: name, card text +1")).toBeInTheDocument();
  });

  it("hides the chip when all fields are selected", () => {
    setup();

    expect(screen.queryByText(/^in:/u)).not.toBeInTheDocument();
  });

  it("hides the chip when the query uses an explicit prefix", () => {
    setup({ search: "n:teemo", scope: ["cardText"] });

    expect(screen.queryByText(/^in:/u)).not.toBeInTheDocument();
  });

  it("resets the scope to all fields via the chip's remove button", async () => {
    const user = userEvent.setup();
    const actions = setup({ scope: ["cardText"] });

    await user.click(screen.getByRole("button", { name: "Search in all fields" }));

    expect(actions.selectAllSearchFields).toHaveBeenCalledTimes(1);
    expect(actions.setSearch).not.toHaveBeenCalled();
  });

  it("drops the scope when Backspace is pressed in the empty field", async () => {
    const user = userEvent.setup();
    const actions = setup({ scope: ["cardText"] });

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Backspace}");

    expect(actions.selectAllSearchFields).toHaveBeenCalled();
  });

  it("leaves the scope alone when Backspace edits typed text", async () => {
    const user = userEvent.setup();
    const actions = setup({ search: "teemo", scope: ["cardText"] });

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Backspace}");

    expect(actions.selectAllSearchFields).not.toHaveBeenCalled();
  });

  it("clears only the text via the input's clear button, keeping the scope", async () => {
    const user = userEvent.setup();
    const actions = setup({ search: "teemo", scope: ["cardText"] });

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(actions.setSearch).toHaveBeenCalledWith("");
    expect(actions.selectAllSearchFields).not.toHaveBeenCalled();
    // The chip must survive the clear — it reflects the persistent scope.
    expect(screen.getByText("in: card text")).toBeInTheDocument();
  });
});
