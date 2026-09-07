import { ALL_SEARCH_FIELDS } from "@openrift/shared/types/search";
import type { SearchField } from "@openrift/shared/types/search";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseFilterValues, mockUseFilterActions, mockTrackEvent } = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

vi.mock("@/features/cards/hooks/use-card-filters", () => ({
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

async function openScopeMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /change search scope/iu }));
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

  it("hides the chip when all fields are selected and the field is unfocused", () => {
    setup();

    expect(screen.queryByText(/^in:/u)).not.toBeInTheDocument();
  });

  it("shows an 'all' chip once the empty field is focused", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("textbox"));

    expect(screen.getByText("in: all")).toBeInTheDocument();
  });

  it("keeps the untouched-scope chip out of the way once text is typed", async () => {
    const user = userEvent.setup();
    setup({ search: "teemo" });

    await user.click(screen.getByRole("textbox"));

    expect(screen.queryByText(/^in:/u)).not.toBeInTheDocument();
  });

  it("keeps a narrowed chip visible while text is typed", async () => {
    const user = userEvent.setup();
    setup({ search: "teemo", scope: ["cardText"] });

    await user.click(screen.getByRole("textbox"));

    expect(screen.getByText("in: card text")).toBeInTheDocument();
  });

  it("mirrors an explicit prefix instead of the picked scope", () => {
    setup({ search: "n:teemo", scope: ["cardText"] });

    expect(screen.getByText("in: name")).toBeInTheDocument();
  });

  it("mirrors a prefix the moment the colon is typed", () => {
    setup({ search: "n:" });

    expect(screen.getByText("in: name")).toBeInTheDocument();
  });

  it("summarizes several prefixes in one query", () => {
    setup({ search: "k:fury n:teemo" });

    expect(screen.getByText("in: name, keywords")).toBeInTheDocument();
  });

  it("offers no menu or remove button on the prefix chip", () => {
    setup({ search: "n:teemo" });

    expect(screen.queryByRole("button", { name: /change search scope/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search in all fields" })).not.toBeInTheDocument();
  });

  it("returns to the scope chip once the prefix is removed", async () => {
    const user = userEvent.setup();
    setup({ search: "n:teemo", scope: ["cardText"] });

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "teemo");

    expect(screen.getByText("in: card text")).toBeInTheDocument();
  });

  it("resets the scope to all fields via the chip's remove button", async () => {
    const user = userEvent.setup();
    const actions = setup({ scope: ["cardText"] });

    await user.click(screen.getByRole("button", { name: "Search in all fields" }));

    expect(actions.selectAllSearchFields).toHaveBeenCalledTimes(1);
    expect(actions.setSearch).not.toHaveBeenCalled();
  });

  it("offers no remove button while every field is in scope", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("textbox"));

    expect(screen.queryByRole("button", { name: "Search in all fields" })).not.toBeInTheDocument();
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
    expect(screen.getByText("in: card text")).toBeInTheDocument();
  });
});

describe("SearchBar scope menu", () => {
  it("lists every searchable field alongside its typed prefix", async () => {
    const user = userEvent.setup();
    setup({ scope: ["cardText"] });

    await openScopeMenu(user);

    for (const label of ["Name", "Card Text", "Keywords", "Tags", "Artist"]) {
      expect(screen.getByRole("checkbox", { name: new RegExp(label, "u") })).toBeInTheDocument();
    }
    for (const prefix of ["n:", "d:", "k:", "t:", "a:", "f:", "ty:", "id:"]) {
      expect(screen.getByText(prefix)).toBeInTheDocument();
    }
  });

  it("checks the fields that are in scope and leaves the rest unchecked", async () => {
    const user = userEvent.setup();
    setup({ scope: ["cardText"] });

    await openScopeMenu(user);

    expect(screen.getByRole("checkbox", { name: /Card Text/u })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Keywords/u })).not.toBeChecked();
  });

  it("toggles a single field from the menu", async () => {
    const user = userEvent.setup();
    const actions = setup({ scope: ["cardText"] });

    await openScopeMenu(user);
    await user.click(screen.getByRole("checkbox", { name: /Keywords/u }));

    expect(actions.toggleSearchField).toHaveBeenCalledWith("keywords");
    expect(actions.selectOnlySearchField).not.toHaveBeenCalled();
  });

  it("narrows to one field via the row's 'only' action", async () => {
    const user = userEvent.setup();
    const actions = setup();

    await user.click(screen.getByRole("textbox"));
    await openScopeMenu(user);
    await user.click(screen.getByRole("button", { name: "Search only Keywords" }));

    expect(actions.selectOnlySearchField).toHaveBeenCalledWith("keywords");
  });

  it("omits the 'only' action on the field that is already the whole scope", async () => {
    const user = userEvent.setup();
    setup({ scope: ["keywords"] });

    await openScopeMenu(user);

    expect(screen.queryByRole("button", { name: "Search only Keywords" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search only Tags" })).toBeInTheDocument();
  });

  it("widens back to every field from the 'All fields' row", async () => {
    const user = userEvent.setup();
    const actions = setup({ scope: ["cardText"] });

    await openScopeMenu(user);
    await user.click(screen.getByRole("checkbox", { name: "All fields" }));

    expect(actions.selectAllSearchFields).toHaveBeenCalledTimes(1);
  });
});
