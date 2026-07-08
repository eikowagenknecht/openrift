import type { CustomTagResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardTagEditor } from "./custom-tags-page";

const cards = [
  {
    id: "card-1",
    slug: "brazen-buccaneer",
    name: "Brazen Buccaneer",
    type: "Unit",
    types: ["Unit"],
    setSlugs: [],
  },
  {
    id: "card-2",
    slug: "riptide-rex",
    name: "Riptide Rex",
    type: "Unit",
    types: ["Unit"],
    setSlugs: [],
  },
];

vi.mock("@/hooks/use-admin-card-queries", () => ({
  useAllCards: () => ({ data: cards }),
}));

vi.mock("@/hooks/use-custom-tags", () => ({
  useCardCustomTags: () => ({ data: { customTagIds: [] } }),
  useSetCardCustomTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const tag: CustomTagResponse = {
  id: "tag-1",
  slug: "bandle-city",
  label: "Bandle City",
  category: "region",
  categoryLabel: "Region",
  categoryId: "cat-1",
  description: null,
  sortOrder: 0,
  cardCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("CardTagEditor", () => {
  // Regression: the Combobox fills the input with the picked card's name on
  // selection, which fires onSearch — that must not clear the fresh selection.
  it("keeps the picked card selected after choosing it from the dropdown", async () => {
    const user = userEvent.setup();
    render(<CardTagEditor tags={[tag]} />);

    await user.type(screen.getByPlaceholderText("Search by name…"), "brazen");
    await user.click(await screen.findByRole("option", { name: /Brazen Buccaneer/u }));

    expect(screen.getByRole("button", { name: "Bandle City" })).toBeInTheDocument();
    expect(screen.queryByText("No card selected.")).not.toBeInTheDocument();
  });

  it("clears the selection when the search text is edited afterwards", async () => {
    const user = userEvent.setup();
    render(<CardTagEditor tags={[tag]} />);

    const input = screen.getByPlaceholderText("Search by name…");
    await user.type(input, "brazen");
    await user.click(await screen.findByRole("option", { name: /Brazen Buccaneer/u }));
    await user.type(input, "x");

    expect(screen.getByText("No card selected.")).toBeInTheDocument();
  });
});
