import type { FriendGroupDetailResponse, TournamentSummaryResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutated per test before rendering; read lazily inside the mock factories.
let currentTournaments: TournamentSummaryResponse[] = [];

vi.mock("@/hooks/use-card-trades", () => ({
  useGroupTrades: () => ({ data: { items: [] } }),
  useTradeActionCounts: () => ({ data: { byGroup: [] } }),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ cardsById: {}, printingsById: {} }),
}));

vi.mock("@/hooks/use-collections", () => ({
  useCollections: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupMatches: () => ({
    data: { othersHaveYourWants: [], othersWantYourHaves: [] },
  }),
}));

vi.mock("@/hooks/use-tournaments", () => ({
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

const { OverviewContent } = await import("./friend-group-overview");

function makeDetail(
  viewerRole: FriendGroupDetailResponse["viewerRole"],
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
  };
}

function renderOverview(viewerRole: FriendGroupDetailResponse["viewerRole"]) {
  return render(<OverviewContent slug="bothfeld" data={makeDetail(viewerRole)} />);
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
    deckSubmission: "none",
    deckFormat: null,
    // Far future so partitionTournaments keeps it in the current bucket.
    startsAt: "2099-01-01T18:00:00Z",
    endsAt: null,
    modules: { pairing: true, deckSubmission: false },
    participantCount: 0,
    pendingRequestCount: 0,
    myRoles: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("OverviewContent tournaments tile", () => {
  beforeEach(() => {
    currentTournaments = [];
  });

  // Regression: the tile used to hide for plain members with no entries,
  // leaving no UI path to the group's tournaments page at all.
  it("shows the tournaments tile to a plain member with no tournaments", () => {
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Open tournaments/u });
    expect(tile).toHaveAttribute("href", "/groups/bothfeld/events");
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

  // Regression: the hint used to count deck-check entries across all of the
  // group's tournaments, so a finished event kept inflating it forever.
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
    expect(screen.getByRole("link", { name: /Open tournaments/u })).toBeInTheDocument();
  });
});
