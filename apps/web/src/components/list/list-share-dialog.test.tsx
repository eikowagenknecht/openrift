import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const unshareMutate = vi.fn();

vi.mock("@/hooks/use-lists", () => ({
  useShareList: () => ({ mutate: shareMutate, isPending: false }),
  useUnshareList: () => ({ mutate: unshareMutate, isPending: false }),
}));

// Friend-group sharing is exercised at the route level; here we just stub the
// hooks so the dialog renders without a QueryClientProvider. An empty groups
// list short-circuits the "Share with friend groups" section.
vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroups: () => ({ data: { items: [], pendingInvites: [], outgoingRequests: [] } }),
  useShareListWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useUnshareListFromFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-list-group-shares", () => ({
  useListGroupShares: () => ({ data: { items: [] } }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://openrift.test",
}));

const { ListShareDialog } = await import("./list-share-dialog");

function Harness({ shareToken }: { shareToken: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <ListShareDialog listId="abc" shareToken={shareToken} open={open} onOpenChange={setOpen} />
  );
}

describe("ListShareDialog", () => {
  it("renders 'Create link' when the list is not yet shared", () => {
    render(<Harness shareToken={null} />);
    expect(screen.getByRole("button", { name: /create link/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop sharing/iu })).not.toBeInTheDocument();
  });

  it("triggers useShareList when 'Create link' is clicked", async () => {
    const user = userEvent.setup();
    shareMutate.mockClear();
    render(<Harness shareToken={null} />);
    await user.click(screen.getByRole("button", { name: /create link/iu }));
    expect(shareMutate).toHaveBeenCalledWith("abc");
  });

  it("renders the share URL and a Stop sharing button when shared", () => {
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    const input = screen.getByDisplayValue("https://openrift.test/lists/share/AbCdEfGhIjKl");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create link/iu })).not.toBeInTheDocument();
  });

  it("triggers useUnshareList when 'Stop sharing' is clicked", async () => {
    const user = userEvent.setup();
    unshareMutate.mockClear();
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /stop sharing/iu }));
    expect(unshareMutate).toHaveBeenCalledWith("abc");
  });

  it("flips the Copy button label to 'Copied' after clicking", async () => {
    const user = userEvent.setup();
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /copy/iu }));
    expect(screen.getByRole("button", { name: /copied/iu })).toBeInTheDocument();
  });
});
