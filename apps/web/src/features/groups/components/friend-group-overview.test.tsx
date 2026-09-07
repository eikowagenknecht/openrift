import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import type { TournamentSummaryResponse } from "@openrift/shared/types/api/tournament";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoxWantRow } from "@/features/decks/lib/box-wants";
import { buildBoxWantsLookup } from "@/features/decks/lib/box-wants";

let currentTournaments: TournamentSummaryResponse[] = [];
let currentCollections: { id: string; name: string; groupId: string | null }[] = [];
let currentBoxWantRows: BoxWantRow[] = [];
const acceptMutate = vi.fn();
const declineMutate = vi.fn();

vi.mock("@/features/groups/hooks/use-card-trades", () => ({
  useGroupTrades: () => ({ data: { items: [] } }),
  useTradeActionCounts: () => ({ data: { byGroup: [] } }),
  useUserTrades: () => ({ data: { items: [] } }),
}));

vi.mock("@/features/cards/hooks/use-cards", () => ({
  useCards: () => ({ cardsById: {}, printingsById: {} }),
}));

vi.mock("@/features/collections/hooks/use-collections", () => ({
  useCollections: () => ({ data: currentCollections }),
}));

vi.mock("@/features/groups/hooks/use-friend-groups", () => ({
  useAcceptFriendGroupInvite: () => ({ mutate: acceptMutate, isPending: false }),
  useDeclineFriendGroupInvite: () => ({ mutate: declineMutate, isPending: false }),
  useFriendGroupMatches: () => ({
    data: { othersHaveYourWants: [], othersWantYourHaves: [] },
  }),
  useGroupBoxWants: () => buildBoxWantsLookup(currentBoxWantRows),
}));

vi.mock("@/features/tournaments/hooks/use-tournaments", () => ({
  useGroupTournaments: () => ({ data: { items: currentTournaments } }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "viewer-1",
}));

vi.mock("./friend-group-activity-feed", () => ({
  FriendGroupActivityFeed: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    search,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children?: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    if (search) {
      const query = Object.entries(search)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("&");
      if (query) {
        path = `${path}?${query}`;
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const { OverviewContent } = await import("./friend-group-overview");

beforeEach(() => {
  currentCollections = [];
  currentBoxWantRows = [];
});

function makeDetail(
  viewerRole: FriendGroupDetailResponse["viewerRole"],
  overrides: Partial<FriendGroupDetailResponse> = {},
): FriendGroupDetailResponse {
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
    viewerRole,
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

function renderOverview(
  viewerRole: FriendGroupDetailResponse["viewerRole"],
  overrides: Partial<FriendGroupDetailResponse> = {},
) {
  return render(<OverviewContent slug="bothfeld" data={makeDetail(viewerRole, overrides)} />);
}

function makeTournament(
  id: string,
  overrides: Partial<TournamentSummaryResponse> = {},
): TournamentSummaryResponse {
  return {
    id,
    name: `Summoner Skirmish ${id}`,
    status: "running",
    host: { type: "user", userId: "host-1", orgId: null, displayName: "Host", orgSlug: null },
    groupId: "group-1",
    groupSlug: "bothfeld",
    groupName: "Bothfeld Connection",
    pairingStyle: "pod",
    playMode: "1v1",
    deckSubmission: "none",
    deckFormat: null,
    // Far future so partitionTournaments keeps it in the current bucket.
    startsAt: "2099-01-01T18:00:00Z",
    endsAt: null,
    modules: { pairing: true, deckSubmission: false },
    participantCount: 0,
    pendingRequestCount: 0,
    myRoles: [],
    participantPreview: [],
    winner: null,
    coverLegends: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("OverviewContent wanted-in-box tile", () => {
  it("hides the tile when the group's boxes hold nothing from the viewer's wishlists", () => {
    currentCollections = [{ id: "box-1", name: "Bulk Box", groupId: "group-1" }];
    renderOverview("member");
    expect(screen.queryByRole("link", { name: /Cards you want/u })).not.toBeInTheDocument();
  });

  it("counts wanted cards across boxes and links the box holding the most, filtered", () => {
    currentCollections = [
      { id: "box-1", name: "Bulk Box", groupId: "group-1" },
      { id: "box-2", name: "Overflow", groupId: "group-1" },
      { id: "personal", name: "Mine", groupId: null },
    ];
    currentBoxWantRows = [
      { collectionId: "box-1", printingId: "p1", cardId: "card-a", fulfillableQuantity: 1 },
      { collectionId: "box-2", printingId: "p2", cardId: "card-a", fulfillableQuantity: 2 },
      { collectionId: "box-2", printingId: "p3", cardId: "card-b", fulfillableQuantity: 1 },
    ];
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Cards you want/u });
    expect(tile).toHaveAttribute("href", "/collections/box-2?wanted=true");
    expect(tile).toHaveTextContent("2");
    expect(tile).toHaveTextContent("across 2 group boxes");
  });

  it("names the box in the hint when only one holds wanted cards", () => {
    currentCollections = [{ id: "box-1", name: "Bulk Box", groupId: "group-1" }];
    currentBoxWantRows = [
      { collectionId: "box-1", printingId: "p1", cardId: "card-a", fulfillableQuantity: 3 },
    ];
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Cards you want/u });
    expect(tile).toHaveAttribute("href", "/collections/box-1?wanted=true");
    expect(tile).toHaveTextContent("waiting in Bulk Box");
  });
});

describe("OverviewContent tournaments tile", () => {
  beforeEach(() => {
    currentTournaments = [];
  });

  it("shows the tournaments tile to a plain member with no tournaments", () => {
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Tournaments/u });
    expect(tile).toHaveAttribute("href", "/groups/bothfeld/events");
    expect(tile).toHaveTextContent("None open");
    expect(tile).toHaveTextContent("no tournaments yet");
  });

  it("counts the viewer's participations in open tournaments in the hint", () => {
    currentTournaments = [
      makeTournament("a", { myRoles: ["participant"] }),
      makeTournament("b", { myRoles: ["participant"] }),
      makeTournament("c"),
    ];
    renderOverview("member");
    expect(screen.getByRole("link", { name: /Open tournaments/u })).toHaveTextContent(
      "you're in 2",
    );
  });

  it("ignores participations in completed tournaments and falls back to the total", () => {
    currentTournaments = [
      makeTournament("done", {
        status: "completed",
        startsAt: "2026-01-05T18:00:00Z",
        myRoles: ["participant"],
      }),
      makeTournament("open"),
    ];
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Open tournaments/u });
    expect(tile).toHaveTextContent("2 total");
    expect(tile).not.toHaveTextContent("you're in");
  });

  it("still shows the tile for admins", () => {
    renderOverview("admin");
    expect(screen.getByRole("link", { name: /Tournaments/u })).toBeInTheDocument();
  });

  // Tournament creation is admin-gated, so the empty-state copy must not tell plain members to plan one.
  it("nudges admins, but not members, to plan a tournament when none is open", () => {
    renderOverview("admin");
    expect(screen.getByRole("link", { name: /Tournaments/u })).toHaveTextContent(
      "Plan one for the next game night",
    );
    expect(screen.getByRole("link", { name: /Plan a tournament/u })).toHaveAttribute(
      "href",
      "/groups/bothfeld/events",
    );
  });

  it("shows members a plain empty state without a create call-to-action", () => {
    renderOverview("member");
    expect(screen.getByRole("link", { name: /Tournaments/u })).not.toHaveTextContent(
      "Plan one for the next game night",
    );
    expect(screen.queryByRole("link", { name: /Plan a tournament/u })).not.toBeInTheDocument();
    expect(screen.getByText(/When an admin sets one up/u)).toBeInTheDocument();
  });

  it("lists the next open tournament in the rail", () => {
    currentTournaments = [makeTournament("a")];
    renderOverview("member");
    expect(screen.getByRole("link", { name: /Summoner Skirmish a/u })).toHaveAttribute(
      "href",
      "/tournaments/a",
    );
  });
});

describe("OverviewContent trades hub", () => {
  beforeEach(() => {
    currentTournaments = [];
  });

  it("links to the trades page from the hub header", () => {
    renderOverview("member");
    expect(screen.getByRole("link", { name: /View trades/u })).toHaveAttribute(
      "href",
      "/groups/bothfeld/trades",
    );
  });

  it("shrinks to a headline when nothing needs the viewer", () => {
    renderOverview("member");
    expect(screen.getByText("No matches in this group yet")).toBeInTheDocument();
    expect(screen.queryByText("You could get")).not.toBeInTheDocument();
    expect(screen.queryByText("To hand over")).not.toBeInTheDocument();
  });
});

describe("OverviewContent requests band", () => {
  beforeEach(() => {
    currentTournaments = [];
    acceptMutate.mockClear();
    declineMutate.mockClear();
  });

  it("shows the band to an owner and approves the right user", async () => {
    const user = userEvent.setup();
    renderOverview("owner", { pendingRequests: [makeRequest("u9")] });
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("Requester u9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve/u }));
    expect(acceptMutate).toHaveBeenCalledWith({ slug: "bothfeld", userId: "u9" });
  });

  it("denies from the band", async () => {
    const user = userEvent.setup();
    renderOverview("admin", { pendingRequests: [makeRequest("u9")] });
    await user.click(screen.getByRole("button", { name: /Deny/u }));
    expect(declineMutate).toHaveBeenCalledWith({ slug: "bothfeld", userId: "u9" });
  });

  it("hides the band from plain members even when requests exist", () => {
    renderOverview("member", { pendingRequests: [makeRequest("u9")] });
    expect(screen.queryByText("Requests")).not.toBeInTheDocument();
  });

  it("hides the band when nothing is waiting", () => {
    renderOverview("owner");
    expect(screen.queryByText("Requests")).not.toBeInTheDocument();
  });
});
