import type { FriendGroupDetailResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acceptMutate = vi.fn();
const declineMutate = vi.fn();

vi.mock("@/hooks/use-friend-groups", () => ({
  useAcceptFriendGroupInvite: () => ({ mutate: acceptMutate, isPending: false }),
  useDeclineFriendGroupInvite: () => ({ mutate: declineMutate, isPending: false }),
  useFriendGroupDetail: () => ({ data: undefined }),
  useKickFriendGroupMember: () => ({ mutate: vi.fn(), isPending: false }),
  useTransferFriendGroupOwnership: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFriendGroupRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "viewer-1",
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const { MembersPageContent } = await import("./friend-group-members-page");

function makeMember(
  userId: string,
  role: FriendGroupDetailResponse["members"][number]["role"],
  overrides: Partial<FriendGroupDetailResponse["members"][number]> = {},
): FriendGroupDetailResponse["members"][number] {
  return {
    userId,
    userName: `Player ${userId}`,
    userImage: null,
    gravatarHash: "hash",
    role,
    contactMethods: [],
    joinedAt: "2026-02-10T12:00:00Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<FriendGroupDetailResponse> = {}): FriendGroupDetailResponse {
  return {
    group: {
      id: "group-1",
      slug: "bothfeld",
      name: "Bothfeld Connection",
      description: null,
      code: null,
      codeRotatedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    viewerStatus: "member",
    viewerRole: "owner",
    members: [],
    shares: [],
    collectionShares: [],
    pendingRequests: [],
    cardsTradedCount: 0,
    cardsTradedByMember: {},
    ...overrides,
  };
}

function makeRequest(userId: string): FriendGroupDetailResponse["pendingRequests"][number] {
  return {
    id: `req-${userId}`,
    userId,
    userName: `Requester ${userId}`,
    userImage: null,
    gravatarHash: "hash",
    createdAt: "2026-07-14T12:00:00Z",
  };
}

describe("MembersPageContent roster", () => {
  it("shows role chips for owner and admin but not for plain members", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            makeMember("viewer-1", "owner"),
            makeMember("u2", "admin"),
            makeMember("u3", "member"),
          ],
        })}
      />,
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    // "Member" never renders as a chip — no chip means plain member.
    expect(screen.queryByText("Member")).not.toBeInTheDocument();
  });

  it("marks the viewer's own row and shows join dates", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            makeMember("viewer-1", "owner"),
            makeMember("u2", "member", { joinedAt: "2025-09-03T12:00:00Z" }),
          ],
        })}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Joined Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("Joined Sep 2025")).toBeInTheDocument();
  });

  it("summarizes shared lists and collections as pills, hiding zero counts", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "member")],
          shares: [
            {
              groupId: "group-1",
              listId: "l1",
              listName: "Wants",
              listIntent: "wish",
              listKind: "card",
              entryCount: 3,
              userId: "u2",
              userName: "Player u2",
              sharedAt: "2026-01-01T00:00:00Z",
            },
            {
              groupId: "group-1",
              listId: "l2",
              listName: "More wants",
              listIntent: "wish",
              listKind: "card",
              entryCount: 1,
              userId: "u2",
              userName: "Player u2",
              sharedAt: "2026-01-01T00:00:00Z",
            },
            {
              groupId: "group-1",
              listId: "l3",
              listName: "Haves",
              listIntent: "trade",
              listKind: "card",
              entryCount: 2,
              userId: "u2",
              userName: "Player u2",
              sharedAt: "2026-01-01T00:00:00Z",
            },
            // Organize lists don't count toward trading and stay hidden.
            {
              groupId: "group-1",
              listId: "l4",
              listName: "Binder",
              listIntent: "organize",
              listKind: "card",
              entryCount: 5,
              userId: "u2",
              userName: "Player u2",
              sharedAt: "2026-01-01T00:00:00Z",
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/2 wishlists/u)).toBeInTheDocument();
    expect(screen.getByText(/1 tradelist/u)).toBeInTheDocument();
    expect(screen.queryByText(/collection/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/organize/u)).not.toBeInTheDocument();
  });

  it("shows a traded-count pill only for members with completed trades", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "member")],
          cardsTradedByMember: { u2: 12 },
        })}
      />,
    );
    expect(screen.getByText("12 traded")).toBeInTheDocument();
    // The zero-count member (viewer-1) carries no pill at all.
    expect(screen.getAllByText(/traded/u)).toHaveLength(1);
  });

  it("marks members who joined within the last month as New", () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            // Fixture default joinedAt (2026-02-10) is far outside the window.
            makeMember("viewer-1", "owner"),
            makeMember("u2", "member", { joinedAt: recent }),
          ],
        })}
      />,
    );
    expect(screen.getAllByText("New")).toHaveLength(1);
  });

  it("labels members sharing nothing instead of leaving the card bare", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({ members: [makeMember("viewer-1", "owner")] })}
      />,
    );
    expect(screen.getByText("Nothing shared yet")).toBeInTheDocument();
  });

  it("tallies owners and admins next to the section heading", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            makeMember("viewer-1", "owner"),
            makeMember("u2", "admin"),
            makeMember("u3", "admin"),
            makeMember("u4", "member"),
          ],
        })}
      />,
    );
    expect(screen.getByText("1 owner · 2 admins")).toBeInTheDocument();
  });
});

describe("MembersPageContent pending requests", () => {
  beforeEach(() => {
    acceptMutate.mockClear();
    declineMutate.mockClear();
  });

  it("shows the requests band to admins and approves the right user", async () => {
    const user = userEvent.setup();
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          viewerRole: "admin",
          members: [makeMember("viewer-1", "admin")],
          pendingRequests: [makeRequest("u9")],
        })}
      />,
    );
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Requester u9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve/u }));
    expect(acceptMutate).toHaveBeenCalledWith({ slug: "bothfeld", userId: "u9" });
  });

  it("hides the band from plain members even when requests exist", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          viewerRole: "member",
          members: [makeMember("viewer-1", "member")],
          pendingRequests: [makeRequest("u9")],
        })}
      />,
    );
    expect(screen.queryByText("Requests")).not.toBeInTheDocument();
  });
});
