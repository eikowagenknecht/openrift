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

const { ListVisibilityButton } = await import("./list-visibility-button");

const GROUP_ALPHA = { groupId: "g1", groupSlug: "alpha", groupName: "Alpha" };
const GROUP_BETA = { groupId: "g2", groupSlug: "beta", groupName: "Beta" };

describe("ListVisibilityButton", () => {
  it("renders nothing when the user has no groups", () => {
    groupItems = [];
    shareItems = [];
    const { container } = render(<ListVisibilityButton listId="list-1" intent="wish" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the button 'Visible to all your groups' when shared everywhere and opens the control on click", async () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA, GROUP_BETA];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    render(
      <ListVisibilityButton
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    const button = screen.getByRole("button", { name: /visible to all your groups/iu });
    await user.click(button);
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("labels a partial count when shared with only some groups", () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA];
    render(<ListVisibilityButton listId="list-1" intent="trade" />);
    expect(screen.getByRole("button", { name: /visible to 1 of 2 groups/iu })).toBeInTheDocument();
  });

  it("marks an unshared wish list as not visible and opens the control on click", async () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    render(
      <ListVisibilityButton
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    const button = screen.getByRole("button", { name: /not visible to your groups/iu });
    await user.click(button);
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("renders nothing for an unshared organize list", () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    const { container } = render(<ListVisibilityButton listId="list-1" intent="organize" />);
    expect(container).toBeEmptyDOMElement();
  });
});
