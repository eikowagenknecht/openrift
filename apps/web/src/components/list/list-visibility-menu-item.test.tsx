import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

let shareItems: { groupId: string; groupSlug: string; groupName: string }[] = [];
let groupItems: { id: string }[] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { items: shareItems } }),
  queryOptions: (options: unknown) => options,
  useSuspenseQuery: () => ({ data: { items: shareItems } }),
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

const { ListVisibilityMenuItem } = await import("./list-visibility-menu-item");

const GROUP_ALPHA = { groupId: "g1", groupSlug: "alpha", groupName: "Alpha" };
const GROUP_BETA = { groupId: "g2", groupSlug: "beta", groupName: "Beta" };

/** A menu item needs a menu around it — BaseUI's Item reads its root context. */
function renderInMenu(item: ReactNode) {
  return render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>{item}</DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("ListVisibilityMenuItem", () => {
  it("renders nothing when the user has no groups", () => {
    groupItems = [];
    shareItems = [];
    renderInMenu(<ListVisibilityMenuItem listId="list-1" intent="wish" />);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("marks a fully shared list as visible to all and opens the control on click", async () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA, GROUP_BETA];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    renderInMenu(
      <ListVisibilityMenuItem
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    await user.click(await screen.findByRole("menuitem", { name: /group visibility\s*all/iu }));
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("shows a partial count when shared with only some groups", async () => {
    groupItems = [{ id: "g1" }, { id: "g2" }];
    shareItems = [GROUP_ALPHA];
    renderInMenu(<ListVisibilityMenuItem listId="list-1" intent="trade" />);
    expect(
      await screen.findByRole("menuitem", { name: /group visibility\s*1\/2/iu }),
    ).toBeInTheDocument();
  });

  it("marks an unshared wish list as visible to none and opens the control on click", async () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    const onManageVisibility = vi.fn();
    const user = userEvent.setup();
    renderInMenu(
      <ListVisibilityMenuItem
        listId="list-1"
        intent="wish"
        onManageVisibility={onManageVisibility}
      />,
    );
    await user.click(await screen.findByRole("menuitem", { name: /group visibility\s*none/iu }));
    expect(onManageVisibility).toHaveBeenCalledOnce();
  });

  it("renders nothing for an unshared organize list", () => {
    groupItems = [{ id: "g1" }];
    shareItems = [];
    renderInMenu(<ListVisibilityMenuItem listId="list-1" intent="organize" />);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });
});
