import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tradeSheet = vi.fn((_userId: string) => ({
  data: { othersHaveYourWants: [], othersWantYourHaves: [] },
}));

vi.mock("@/features/groups/hooks/use-card-trades", () => ({
  useGroupTrades: () => ({ data: { items: [] } }),
  useUserTrades: () => ({ data: { items: [] } }),
  useTradeSheet: (userId: string) => tradeSheet(userId),
}));

vi.mock("@/features/groups/hooks/use-friend-groups", () => ({
  useFriendGroupDetail: () => ({
    data: { group: { id: "group-1", name: "Bothfeld Basement", slug: "bothfeld" } },
  }),
  useFriendGroupMemberDetail: (_slug: string, userId: string) => ({
    data: {
      member: {
        userId,
        userName: userId === "viewer-1" ? "Robin" : "Klemen",
        userImage: null,
        gravatarHash: "hash",
        role: "member",
        contactMethods: [],
        joinedAt: "2026-01-01T00:00:00Z",
      },
      shares:
        userId === "u2"
          ? [
              {
                groupId: "group-1",
                listId: "list-1",
                listName: "Binder",
                listIntent: "trade",
                listKind: "printing",
                entryCount: 3,
                userId,
              },
            ]
          : [],
      collectionShares: [],
    },
  }),
}));

vi.mock("./shared-list-row", () => ({
  SharedListRow: () => <div>list-row</div>,
}));

vi.mock("./shared-collection-row", () => ({
  SharedCollectionRow: () => <div>collection-row</div>,
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "viewer-1",
}));

vi.mock("@/features/cards/components/card-detail-opener", () => ({
  CardDetailOverlayProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/layout/top-bar-breadcrumb", () => ({
  TopBarBreadcrumbBar: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({ children }: { children?: ReactNode }) => <a href="/mock">{children}</a>,
}));

const { MemberDetailPage } = await import("./member-detail-page");

beforeEach(() => {
  tradeSheet.mockClear();
});

describe("MemberDetailPage", () => {
  it("shows the trade summary and fetches the sheet for another member", () => {
    render(<MemberDetailPage slug="bothfeld" userId="u2" />);
    expect(screen.getByText("Open trade sheet")).toBeInTheDocument();
    expect(tradeSheet).toHaveBeenCalledWith("u2");
  });

  it("folds a quiet, share-less member into one empty state", () => {
    render(<MemberDetailPage slug="bothfeld" userId="u3" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Klemen hasn't shared any lists or collections with this group, and the two of you haven't traded.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Open trade sheet")).not.toBeInTheDocument();
    expect(screen.queryByText(/hasn't shared any collections/u)).not.toBeInTheDocument();
  });

  it("skips the trades section and the sheet fetch on the viewer's own page", () => {
    render(<MemberDetailPage slug="bothfeld" userId="viewer-1" />);
    expect(screen.queryByText("Open trade sheet")).not.toBeInTheDocument();
    expect(tradeSheet).not.toHaveBeenCalled();
    expect(
      screen.getByText("You haven't shared any collections or lists with this group yet."),
    ).toBeInTheDocument();
  });
});
