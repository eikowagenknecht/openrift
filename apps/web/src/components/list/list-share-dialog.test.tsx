import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const unshareMutate = vi.fn();
const groupShareMutate = vi.fn();
const groupUnshareMutate = vi.fn();

let groupItems: { id: string; slug: string; name: string }[] = [];
let groupShareItems: { groupId: string }[] = [];

vi.mock("@/hooks/use-lists", () => ({
  useShareList: () => ({ mutate: shareMutate, isPending: false }),
  useUnshareList: () => ({ mutate: unshareMutate, isPending: false }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroups: () => ({
    data: { items: groupItems, pendingInvites: [], outgoingRequests: [] },
  }),
  useShareListWithFriendGroup: () => ({ mutate: groupShareMutate, isPending: false }),
  useUnshareListFromFriendGroup: () => ({ mutate: groupUnshareMutate, isPending: false }),
}));

vi.mock("@/hooks/use-list-group-shares", () => ({
  useListGroupShares: () => ({ data: { items: groupShareItems } }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://openrift.test",
}));

const { ListShareDialog } = await import("./list-share-dialog");

const queryClient = new QueryClient();

const GROUP_ALPHA = { id: "g1", slug: "alpha", name: "Alpha" };
const GROUP_BETA = { id: "g2", slug: "beta", name: "Beta" };

function Harness({ shareToken }: { shareToken: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <QueryClientProvider client={queryClient}>
      <ListShareDialog
        listId="abc"
        listName="Holiday Targets"
        intent="wish"
        kind="card"
        tradeDefaults={{ pricePref: null, priceAbsoluteCents: null, tradeType: null }}
        currency={null}
        shareToken={shareToken}
        updatedAt="2026-06-09T00:00:00.000Z"
        entries={[]}
        open={open}
        onOpenChange={setOpen}
      />
    </QueryClientProvider>
  );
}

describe("ListShareDialog", () => {
  it("renders 'Create link' when the list is not yet shared", () => {
    groupItems = [];
    render(<Harness shareToken={null} />);
    expect(screen.getByRole("button", { name: /create link/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop sharing/iu })).not.toBeInTheDocument();
  });

  it("triggers useShareList when 'Create link' is clicked", async () => {
    const user = userEvent.setup();
    groupItems = [];
    shareMutate.mockClear();
    render(<Harness shareToken={null} />);
    await user.click(screen.getByRole("button", { name: /create link/iu }));
    expect(shareMutate).toHaveBeenCalledWith("abc");
  });

  it("renders the share URL and a Stop sharing button when shared", () => {
    groupItems = [];
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    const input = screen.getByDisplayValue("https://openrift.test/lists/share/AbCdEfGhIjKl");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create link/iu })).not.toBeInTheDocument();
  });

  it("triggers useUnshareList when 'Stop sharing' is clicked", async () => {
    const user = userEvent.setup();
    groupItems = [];
    unshareMutate.mockClear();
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /stop sharing/iu }));
    expect(unshareMutate).toHaveBeenCalledWith("abc");
  });

  it("flips the link Copy button label to 'Copied' after clicking", async () => {
    const user = userEvent.setup();
    groupItems = [];
    render(<Harness shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /^copy$/iu }));
    expect(screen.getByRole("button", { name: /^copied$/iu })).toBeInTheDocument();
  });

  it("shows the 'Post to a chat' controls whether or not the list is shared", () => {
    groupItems = [];
    const { rerender } = render(<Harness shareToken={null} />);
    expect(screen.getByText(/post to a chat/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy text/iu })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download image/iu })).toBeInTheDocument();

    rerender(<Harness shareToken="AbCdEfGhIjKl" />);
    expect(screen.getByText(/post to a chat/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy text/iu })).toBeInTheDocument();
  });

  it("hides the Group visibility section when the user has no groups", () => {
    groupItems = [];
    groupShareItems = [];
    render(<Harness shareToken={null} />);
    expect(screen.queryByText(/group visibility/iu)).not.toBeInTheDocument();
  });

  it("derives 'All my groups' when the list is shared with every group", () => {
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }, { groupId: "g2" }];
    render(<Harness shareToken={null} />);
    expect(screen.getByRole("radio", { name: /all my groups/iu })).toBeChecked();
  });

  it("derives 'Only me' when the list is shared with no group", () => {
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [];
    render(<Harness shareToken={null} />);
    expect(screen.getByRole("radio", { name: /only me/iu })).toBeChecked();
  });

  it("unshares every shared group when 'Only me' is selected", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }, { groupId: "g2" }];
    groupUnshareMutate.mockClear();
    render(<Harness shareToken={null} />);
    await user.click(screen.getByRole("radio", { name: /only me/iu }));
    expect(groupUnshareMutate).toHaveBeenCalledWith({ slug: "alpha", listId: "abc" });
    expect(groupUnshareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
  });

  it("shares every unshared group when 'All my groups' is selected", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }];
    groupShareMutate.mockClear();
    render(<Harness shareToken={null} />);
    await user.click(screen.getByRole("radio", { name: /all my groups/iu }));
    expect(groupShareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
    expect(groupShareMutate).not.toHaveBeenCalledWith({ slug: "alpha", listId: "abc" });
  });

  it("reveals per-group checkboxes when 'Some groups' is selected", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }];
    groupShareMutate.mockClear();
    groupUnshareMutate.mockClear();
    render(<Harness shareToken={null} />);
    // Partially shared, so the mode derives to "Some groups" with the
    // checkbox list already visible.
    expect(screen.getByRole("radio", { name: /some groups/iu })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Beta" }));
    expect(groupShareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
  });
});
