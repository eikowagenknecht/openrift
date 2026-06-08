import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockGroup {
  id: string;
  slug: string;
  name: string;
}

// Mutated per test before rendering. Read lazily inside the mock factory so it
// reflects the value at render time, not at hoist time.
let currentGroups: MockGroup[] = [];

const createMutate = vi.fn(
  (_payload: unknown, opts?: { onSuccess?: (list: { id: string }) => unknown }) => {
    void opts?.onSuccess?.({ id: "new-list" });
  },
);
const shareMutateAsync = vi.fn().mockResolvedValue(undefined);
const bulkAddMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-lists", () => ({
  useCreateList: () => ({ mutate: createMutate, isPending: false }),
  useBulkAddListEntries: () => ({ mutateAsync: bulkAddMutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupsList: () => ({ data: { items: currentGroups } }),
  useShareListWithFriendGroup: () => ({ mutateAsync: shareMutateAsync, isPending: false }),
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: (selector: (state: { defaultCurrency: string }) => unknown) =>
    selector({ defaultCurrency: "EUR" }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

// The trade-preferences editor pulls in unrelated currency/select machinery;
// stub it out so these tests focus on the group-sharing behavior.
vi.mock("@/components/trade-preferences/trade-preference-editor", () => ({
  TradePreferenceEditor: () => null,
}));

const { CreateListDialog } = await import("./create-list-dialog");

function Harness() {
  const [open, setOpen] = useState(true);
  return <CreateListDialog intent="wish" open={open} onOpenChange={setOpen} />;
}

const GROUPS: MockGroup[] = [
  { id: "g1", slug: "alpha", name: "Alpha" },
  { id: "g2", slug: "beta", name: "Beta" },
];

describe("CreateListDialog group sharing", () => {
  beforeEach(() => {
    currentGroups = GROUPS;
    createMutate.mockClear();
    shareMutateAsync.mockClear();
    bulkAddMutateAsync.mockClear();
  });

  it("checks every group by default", () => {
    render(<Harness />);
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).toBeChecked();
  });

  it("shares the new list with all groups by default", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText("List name"), "Wants");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(2));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "alpha", listId: "new-list" });
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "beta", listId: "new-list" });
  });

  it("excludes a group that the user unchecks", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Beta" }));
    await user.type(screen.getByPlaceholderText("List name"), "Wants");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(1));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "alpha", listId: "new-list" });
  });

  it("re-checking a group puts it back in the share set", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const beta = screen.getByRole("checkbox", { name: "Beta" });
    await user.click(beta);
    await user.click(beta);
    await user.type(screen.getByPlaceholderText("List name"), "Wants");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(2));
  });

  it("hides the section and shares nothing when the user has no groups", async () => {
    currentGroups = [];
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByText(/share with friend groups/iu)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("List name"), "Wants");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(shareMutateAsync).not.toHaveBeenCalled();
  });
});
