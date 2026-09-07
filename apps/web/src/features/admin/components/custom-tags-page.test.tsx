import type { CustomTagResponse } from "@openrift/shared/types/api/admin";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardTagEditor, TagClearCardsAction } from "./custom-tags-page";

const cards = [
  {
    id: "card-1",
    slug: "brazen-buccaneer",
    name: "Brazen Buccaneer",
    type: "Unit",
    types: ["Unit"],
    setSlugs: [],
    shortCodes: [],
  },
  {
    id: "card-2",
    slug: "riptide-rex",
    name: "Riptide Rex",
    type: "Unit",
    types: ["Unit"],
    setSlugs: [],
    shortCodes: [],
  },
];

vi.mock("@/features/admin/hooks/use-admin-card-queries", () => ({
  useAllCards: () => ({ data: cards }),
}));

vi.mock("@/features/collections/hooks/use-custom-tags", () => ({
  useCardCustomTags: () => ({ data: { customTagIds: [] } }),
  useSetCardCustomTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearCustomTagCards: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

describe("TagClearCardsAction", () => {
  it("renders nothing when the tag has no cards", () => {
    render(<TagClearCardsAction row={{ ...tag, cardCount: 0 }} onClear={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before clearing", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(<TagClearCardsAction row={{ ...tag, cardCount: 3 }} onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onClear).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("all 3 cards");
  });

  it("clears the tag's assignments after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(<TagClearCardsAction row={{ ...tag, cardCount: 3 }} onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Clear" }));

    expect(onClear).toHaveBeenCalledWith(expect.objectContaining({ id: "tag-1", cardCount: 3 }));
  });

  it("does not clear when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn().mockResolvedValue(undefined);
    render(<TagClearCardsAction row={{ ...tag, cardCount: 3 }} onClear={onClear} />);

    await user.click(screen.getByRole("button", { name: "Clear" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onClear).not.toHaveBeenCalled();
  });
});
