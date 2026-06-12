import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

let shareItems: { groupId: string; groupSlug: string; groupName: string }[] = [];
let groupItems: { id: string }[] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { items: shareItems } }),
}));

// createServerFn runs a builder chain at module load; stub it so importing the
// component doesn't pull in the real server-fn runtime.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      middleware: () => builder,
      handler: () => vi.fn(),
    };
    return builder;
  },
  createMiddleware: () => ({ server: () => ({}) }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupsList: () => ({ data: { items: groupItems } }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "user-1",
}));

const { ListGroupSharesBadge } = await import("./list-group-shares-badge");

const GROUP_ALPHA = { groupId: "g1", groupSlug: "alpha", groupName: "Alpha" };
const GROUP_BETA = { groupId: "g2", groupSlug: "beta", groupName: "Beta" };

describe("ListGroupSharesBadge", () => {
  it("renders nothing when the user has no groups", () => {
    groupItems = [];
    shareItems = [];
    const { container } = render(<ListGroupSharesBadge listId="list-1" intent="wish" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'Visible to your groups' when shared with every group and opens the control on click", async () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA, GROUP_BETA];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    render(
      <ListGroupSharesBadge
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    const badge = screen.getByRole("button", { name: /visible to your groups/iu });
    await user.click(badge);
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("shows a partial count when shared with only some groups", () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA];
    render(<ListGroupSharesBadge listId="list-1" intent="trade" />);
    expect(screen.getByRole("button", { name: /visible to 1 of 2 groups/iu })).toBeInTheDocument();
  });

  it("nudges an unshared wish list when the user has groups", async () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    render(
      <ListGroupSharesBadge
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    const badge = screen.getByRole("button", { name: /not visible to your groups/iu });
    await user.click(badge);
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("does not nudge an unshared organize list", () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    const { container } = render(<ListGroupSharesBadge listId="list-1" intent="organize" />);
    expect(container).toBeEmptyDOMElement();
  });
});
