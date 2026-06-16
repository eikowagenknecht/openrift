import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockListItem {
  listId: string;
  listName: string;
  listIntent: "wish" | "trade" | "organize";
  listKind: "card" | "printing" | "copy";
  entryCount: number;
  sharedAt: string | null;
}

// Mutated per test before rendering; read lazily inside the mock factory.
let currentItems: MockListItem[] = [];

const shareMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupShareableLists: () => ({ data: { items: currentItems } }),
  useShareListWithFriendGroup: () => ({ mutateAsync: shareMutateAsync, isPending: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

const { ShareListsWithGroupDialog } = await import("./share-lists-with-group-dialog");

const onOpenChange = vi.fn();

function renderDialog() {
  return render(
    <ShareListsWithGroupDialog
      slug="bothfeld"
      groupName="Bothfeld Connection"
      open
      onOpenChange={onOpenChange}
    />,
  );
}

const WISH: MockListItem = {
  listId: "l1",
  listName: "My Wants",
  listIntent: "wish",
  listKind: "card",
  entryCount: 3,
  sharedAt: null,
};
const TRADE: MockListItem = {
  listId: "l2",
  listName: "For Trade",
  listIntent: "trade",
  listKind: "copy",
  entryCount: 7,
  sharedAt: null,
};

describe("ShareListsWithGroupDialog", () => {
  beforeEach(() => {
    currentItems = [WISH, TRADE];
    shareMutateAsync.mockClear();
    onOpenChange.mockClear();
  });

  it("pre-selects every unshared wish/trade list", () => {
    renderDialog();
    expect(screen.getByRole("checkbox", { name: /My Wants/u })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /For Trade/u })).toBeChecked();
  });

  it("shares every selected list on confirm and closes", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Share 2 lists" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(2));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", listId: "l1" });
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", listId: "l2" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shares only the lists left checked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: /For Trade/u }));
    await user.click(screen.getByRole("button", { name: "Share 1 list" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(1));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", listId: "l1" });
  });

  it("shares nothing when the user skips", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(shareMutateAsync).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables the share button when nothing is selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: /My Wants/u }));
    await user.click(screen.getByRole("checkbox", { name: /For Trade/u }));

    expect(screen.getByRole("button", { name: /^Share/u })).toBeDisabled();
  });

  it("excludes organize lists and lists already shared", () => {
    currentItems = [
      WISH,
      { ...TRADE, sharedAt: "2026-06-16T00:00:00Z" },
      {
        listId: "l3",
        listName: "Binder",
        listIntent: "organize",
        listKind: "card",
        entryCount: 1,
        sharedAt: null,
      },
    ];
    renderDialog();

    expect(screen.getByRole("checkbox", { name: /My Wants/u })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /For Trade/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Binder/u })).not.toBeInTheDocument();
  });

  it("offers a create-a-list message when there is nothing to share", () => {
    currentItems = [{ ...TRADE, sharedAt: "2026-06-16T00:00:00Z" }];
    renderDialog();

    expect(
      screen.getByText(/don't have a wishlist or tradelist to share yet/iu),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Share/u })).not.toBeInTheDocument();
    // The footer "Close" plus the dialog's built-in close icon both match.
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });
});
