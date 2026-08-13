import type { FriendGroupDetailResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acceptMutate = vi.fn();
const declineMutate = vi.fn();

/** Swapped per test so the top-bar actions can read a group from "the cache". */
let detailData: FriendGroupDetailResponse | undefined;

vi.mock("@/hooks/use-friend-groups", () => ({
  useAcceptFriendGroupInvite: () => ({ mutate: acceptMutate, isPending: false }),
  useDeclineFriendGroupInvite: () => ({ mutate: declineMutate, isPending: false }),
  useFriendGroupDetail: () => ({ data: detailData }),
  useFriendGroupShareableLists: () => ({ data: { items: [] } }),
  useKickFriendGroupMember: () => ({ mutate: vi.fn(), isPending: false }),
  useShareListWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
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

const {
  filterMembersByName,
  memberShareVolumes,
  MembersPageContent,
  MembersTradedAction,
  sortMembers,
} = await import("./friend-group-members-page");

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

function makeShare(
  userId: string,
  listIntent: FriendGroupDetailResponse["shares"][number]["listIntent"],
  entryCount: number,
  listId: string,
): FriendGroupDetailResponse["shares"][number] {
  return {
    groupId: "group-1",
    listId,
    listName: `List ${listId}`,
    listIntent,
    listKind: "card",
    entryCount,
    userId,
    userName: `Player ${userId}`,
    sharedAt: "2026-01-01T00:00:00Z",
  };
}

function makeCollectionShare(
  userId: string,
  collectionId: string,
): FriendGroupDetailResponse["collectionShares"][number] {
  return {
    groupId: "group-1",
    collectionId,
    collectionName: `Collection ${collectionId}`,
    userId,
    userName: `Player ${userId}`,
    sharedAt: "2026-01-01T00:00:00Z",
    copyCount: 4,
    coverPrintings: [],
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

/** @returns The roster rows' member names, top to bottom. */
function rowNames(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((row) => row.querySelector(".font-medium")?.textContent ?? "");
}

describe("memberShareVolumes", () => {
  it("sums card counts per intent and counts shared collections", () => {
    const volumes = memberShareVolumes(
      [
        makeShare("u2", "trade", 12, "l1"),
        makeShare("u2", "trade", 5, "l2"),
        makeShare("u2", "wish", 3, "l3"),
      ],
      [makeCollectionShare("u2", "c1"), makeCollectionShare("u2", "c2")],
    );
    expect(volumes.get("u2")).toEqual({ offered: 17, wanted: 3, collections: 2 });
  });

  it("leaves organize lists out of both totals", () => {
    const volumes = memberShareVolumes([makeShare("u2", "organize", 40, "l1")], []);
    expect(volumes.has("u2")).toBe(false);
  });

  it("keeps an entry at zero for a shared but empty list", () => {
    const volumes = memberShareVolumes([makeShare("u2", "trade", 0, "l1")], []);
    expect(volumes.get("u2")).toEqual({ offered: 0, wanted: 0, collections: 0 });
  });

  it("returns nothing for members who share nothing", () => {
    expect(memberShareVolumes([], []).size).toBe(0);
  });
});

describe("filterMembersByName", () => {
  const members = [
    makeMember("u1", "member", { userName: "Ashe" }),
    makeMember("u2", "member", { userName: "Braum" }),
    makeMember("u3", "member", { userName: null }),
  ];

  it("keeps everyone for a blank query", () => {
    expect(filterMembersByName(members, "   ")).toHaveLength(3);
  });

  it("matches a case-insensitive substring", () => {
    expect(filterMembersByName(members, "RAU").map((m) => m.userId)).toEqual(["u2"]);
  });

  it("drops nameless members once a query is typed", () => {
    expect(filterMembersByName(members, "a").map((m) => m.userId)).toEqual(["u1", "u2"]);
  });
});

describe("sortMembers", () => {
  const ashe = makeMember("u1", "member", { userName: "Ashe", joinedAt: "2026-01-01T00:00:00Z" });
  const braum = makeMember("u2", "member", { userName: "Braum", joinedAt: "2026-03-01T00:00:00Z" });
  const nameless = makeMember("u3", "member", { userName: null, joinedAt: "2026-02-01T00:00:00Z" });

  it("puts the newest joiner first by default", () => {
    expect(sortMembers([ashe, braum, nameless], "recent", {}).map((m) => m.userId)).toEqual([
      "u2",
      "u3",
      "u1",
    ]);
  });

  it("sorts by name with nameless members last", () => {
    expect(sortMembers([nameless, braum, ashe], "name", {}).map((m) => m.userId)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("sorts by cards traded, breaking ties by name", () => {
    expect(
      sortMembers([braum, ashe, nameless], "traded", { u1: 4, u2: 4, u3: 9 }).map((m) => m.userId),
    ).toEqual(["u3", "u1", "u2"]);
  });

  it("treats a member absent from the traded map as zero", () => {
    expect(sortMembers([ashe, braum], "traded", { u1: 1 }).map((m) => m.userId)).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("leaves the input array untouched", () => {
    const input = [braum, ashe];
    sortMembers(input, "name", {});
    expect(input.map((m) => m.userId)).toEqual(["u2", "u1"]);
  });
});

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

  it("drops the section heading and role tally the page title already carried", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "admin")],
        })}
      />,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText(/1 owner/u)).not.toBeInTheDocument();
  });

  // The count is the viewer's own trades with that member, so the label says
  // so. It used to be group-wide and read as a claim about the two of them,
  // which put "3 traded" beside someone the viewer had never traded with.
  it("shows a traded-count stat only for members the viewer has traded with", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "member")],
          cardsTradedByMember: { u2: 12 },
        })}
      />,
    );
    expect(screen.getByText("12 traded with you")).toBeInTheDocument();
    // The zero-count member (viewer-1) carries no stat at all. The pattern is
    // anchored to the stat's "<n> traded with you" shape so the sort select's
    // "Most traded with you" label doesn't count as a match.
    expect(screen.getAllByText(/^\d+ traded with you$/u)).toHaveLength(1);
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
});

describe("MembersPageContent volume pills", () => {
  it("sums cards offered and wanted and counts collections, hiding zeroes", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "member")],
          shares: [
            makeShare("u2", "wish", 3, "l1"),
            makeShare("u2", "wish", 1, "l2"),
            makeShare("u2", "trade", 12, "l3"),
            // Organize lists don't count toward trading and stay hidden.
            makeShare("u2", "organize", 40, "l4"),
          ],
        })}
      />,
    );
    expect(screen.getByText("12 offered")).toBeInTheDocument();
    expect(screen.getByText("4 wanted")).toBeInTheDocument();
    expect(screen.queryByText(/collection/u)).not.toBeInTheDocument();
  });

  it("keeps the collection pill singular for one shared collection", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("u2", "member")],
          collectionShares: [makeCollectionShare("u2", "c1")],
        })}
      />,
    );
    expect(screen.getByText("1 collection")).toBeInTheDocument();
  });

  it("pluralizes the collection pill past one", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("u2", "member")],
          collectionShares: [makeCollectionShare("u2", "c1"), makeCollectionShare("u2", "c2")],
        })}
      />,
    );
    expect(screen.getByText("2 collections")).toBeInTheDocument();
  });

  it("falls back to the empty label when a shared list holds no cards", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("u2", "member")],
          shares: [makeShare("u2", "trade", 0, "l1")],
        })}
      />,
    );
    expect(screen.getByText("Nothing shared yet")).toBeInTheDocument();
  });

  it("labels other members who share nothing but nudges the viewer instead", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner"), makeMember("u2", "member")],
        })}
      />,
    );
    expect(screen.getAllByText("Nothing shared yet")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Share a tradelist/u })).toBeInTheDocument();
  });

  it("drops the nudge once the viewer shares something", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [makeMember("viewer-1", "owner")],
          shares: [makeShare("viewer-1", "trade", 7, "l1")],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Share a tradelist/u })).not.toBeInTheDocument();
    expect(screen.getByText("7 offered")).toBeInTheDocument();
  });
});

describe("MembersPageContent toolbar", () => {
  it("orders the roster by the viewer's traded count before any input", () => {
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            makeMember("u1", "member", { userName: "Ashe", joinedAt: "2026-04-01T00:00:00Z" }),
            makeMember("u2", "member", { userName: "Braum", joinedAt: "2026-01-01T00:00:00Z" }),
          ],
          cardsTradedByMember: { u2: 9 },
        })}
      />,
    );
    expect(rowNames()).toEqual(["Braum", "Ashe"]);
  });

  it("filters the roster as the viewer types", async () => {
    const user = userEvent.setup();
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({
          members: [
            makeMember("u1", "member", { userName: "Ashe" }),
            makeMember("u2", "member", { userName: "Braum" }),
          ],
        })}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Search members" }), "bra");
    expect(rowNames()).toEqual(["Braum"]);
  });

  it("says so when nothing matches the search", async () => {
    const user = userEvent.setup();
    render(
      <MembersPageContent
        slug="bothfeld"
        data={makeDetail({ members: [makeMember("u1", "member", { userName: "Ashe" })] })}
      />,
    );
    await user.type(screen.getByRole("textbox", { name: "Search members" }), "zed");
    expect(screen.getByText("No members match your search.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("MembersTradedAction", () => {
  it("links to the trades page with the group's lifetime tally", () => {
    detailData = makeDetail({ cardsTradedCount: 304 });
    render(<MembersTradedAction slug="bothfeld" />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("304 cards traded");
    expect(link).toHaveAttribute("href", "/groups/bothfeld/trades");
  });

  it("stays hidden until the group has traded a card", () => {
    detailData = makeDetail({ cardsTradedCount: 0 });
    const { container } = render(<MembersTradedAction slug="bothfeld" />);
    expect(container).toBeEmptyDOMElement();
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
