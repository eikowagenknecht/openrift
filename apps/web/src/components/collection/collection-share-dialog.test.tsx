import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const unshareMutate = vi.fn();

vi.mock("@/hooks/use-collections", () => ({
  useShareCollection: () => ({ mutate: shareMutate, isPending: false }),
  useUnshareCollection: () => ({ mutate: unshareMutate, isPending: false }),
}));

// Friend-group sharing is exercised at the route level; here we just stub the
// hooks so the dialog renders without a QueryClientProvider. An empty groups
// list short-circuits the new "Share with friend groups" section.
vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroups: () => ({ data: { items: [], pendingInvites: [], outgoingRequests: [] } }),
  useShareCollectionWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useUnshareCollectionFromFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-collection-group-shares", () => ({
  useCollectionGroupShares: () => ({ data: { items: [] } }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://openrift.test",
}));

const { CollectionShareDialog } = await import("./collection-share-dialog");

function Harness({ isPublic, shareToken }: { isPublic: boolean; shareToken: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <CollectionShareDialog
      collectionId="abc"
      isPublic={isPublic}
      shareToken={shareToken}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

describe("CollectionShareDialog", () => {
  it("renders 'Create link' when the collection is not yet shared", () => {
    render(<Harness isPublic={false} shareToken={null} />);
    expect(screen.getByRole("button", { name: /create link/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop sharing/iu })).not.toBeInTheDocument();
  });

  it("triggers useShareCollection when 'Create link' is clicked", async () => {
    const user = userEvent.setup();
    shareMutate.mockClear();
    render(<Harness isPublic={false} shareToken={null} />);
    await user.click(screen.getByRole("button", { name: /create link/iu }));
    expect(shareMutate).toHaveBeenCalledWith("abc");
  });

  it("renders the share URL and a Stop sharing button when public", () => {
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    const input = screen.getByDisplayValue("https://openrift.test/collections/share/AbCdEfGhIjKl");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create link/iu })).not.toBeInTheDocument();
  });

  it("triggers useUnshareCollection when 'Stop sharing' is clicked", async () => {
    const user = userEvent.setup();
    unshareMutate.mockClear();
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /stop sharing/iu }));
    expect(unshareMutate).toHaveBeenCalledWith("abc");
  });

  it("flips the Copy button label to 'Copied' after clicking", async () => {
    const user = userEvent.setup();
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /copy/iu }));
    expect(screen.getByRole("button", { name: /copied/iu })).toBeInTheDocument();
  });
});
