import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

const groupShareMutate = vi.fn();
const groupUnshareMutate = vi.fn();

let groupItems: { id: string; slug: string; name: string }[] = [];
let groupShareItems: { groupId: string }[] = [];

vi.mock("@/features/groups/hooks/use-friend-groups", () => ({
  useFriendGroups: () => ({
    data: { items: groupItems, outgoingRequests: [] },
  }),
  useShareListWithFriendGroup: () => ({ mutate: groupShareMutate, isPending: false }),
  useUnshareListFromFriendGroup: () => ({ mutate: groupUnshareMutate, isPending: false }),
}));

vi.mock("@/features/lists/hooks/use-list-group-shares", () => ({
  useListGroupShares: () => ({ data: { items: groupShareItems } }),
}));

const { ListGroupVisibilityDialog } = await import("./list-group-visibility-dialog");

const GROUP_ALPHA = { id: "g1", slug: "alpha", name: "Alpha" };
const GROUP_BETA = { id: "g2", slug: "beta", name: "Beta" };

function Harness({ onManagePublicLink = vi.fn() }: { onManagePublicLink?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ListGroupVisibilityDialog
      listId="abc"
      intent="wish"
      open={open}
      onOpenChange={setOpen}
      onManagePublicLink={onManagePublicLink}
    />
  );
}

describe("ListGroupVisibilityDialog", () => {
  it("shows an empty-state hint when the user has no groups", () => {
    groupItems = [];
    groupShareItems = [];
    render(<Harness />);
    expect(screen.getByText(/not in any friend groups/iu)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /all my groups/iu })).not.toBeInTheDocument();
  });

  it("derives 'All my groups' when the list is shared with every group", () => {
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }, { groupId: "g2" }];
    render(<Harness />);
    expect(screen.getByRole("radio", { name: /all my groups/iu })).toBeChecked();
  });

  it("derives 'Only me' when the list is shared with no group", () => {
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [];
    render(<Harness />);
    expect(screen.getByRole("radio", { name: /only me/iu })).toBeChecked();
  });

  it("unshares every shared group when 'Only me' is selected", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }, { groupId: "g2" }];
    groupUnshareMutate.mockClear();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: /only me/iu }));
    expect(groupUnshareMutate).toHaveBeenCalledWith({ slug: "alpha", listId: "abc" });
    expect(groupUnshareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
  });

  it("shares every unshared group when 'All my groups' is selected", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }];
    groupShareMutate.mockClear();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: /all my groups/iu }));
    expect(groupShareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
    expect(groupShareMutate).not.toHaveBeenCalledWith({ slug: "alpha", listId: "abc" });
  });

  it("reveals per-group checkboxes when partially shared and toggles one", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA, GROUP_BETA];
    groupShareItems = [{ groupId: "g1" }];
    groupShareMutate.mockClear();
    render(<Harness />);
    expect(screen.getByRole("radio", { name: /some groups/iu })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Beta" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Beta" }));
    expect(groupShareMutate).toHaveBeenCalledWith({ slug: "beta", listId: "abc" });
  });

  it("calls onManagePublicLink from the cross-link", async () => {
    const user = userEvent.setup();
    groupItems = [GROUP_ALPHA];
    groupShareItems = [];
    const onManagePublicLink = vi.fn();
    render(<Harness onManagePublicLink={onManagePublicLink} />);
    await user.click(screen.getByRole("button", { name: /share a public link/iu }));
    expect(onManagePublicLink).toHaveBeenCalledOnce();
  });
});
