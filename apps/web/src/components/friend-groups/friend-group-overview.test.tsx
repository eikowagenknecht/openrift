import type { FriendGroupDetailResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockDeckEntry {
  groupSlug: string | null;
}

// Mutated per test before rendering; read lazily inside the mock factories.
let currentOwnDecks: MockDeckEntry[] = [];

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

vi.mock("@/hooks/use-deck-check-player", () => ({
  useMyTournamentDecks: () => ({ data: { items: currentOwnDecks } }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupMatches: () => ({
    data: { othersHaveYourWants: [], othersWantYourHaves: [] },
  }),
}));

vi.mock("@/hooks/use-tournaments", () => ({
  useGroupTournaments: () => ({ data: { items: [] } }),
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

describe("OverviewContent tournaments tile", () => {
  beforeEach(() => {
    currentOwnDecks = [];
  });

  // Regression: the tile used to hide for plain members with no entries,
  // leaving no UI path to the group's tournaments page at all.
  it("shows the tournaments tile to a plain member with no entries", () => {
    renderOverview("member");
    const tile = screen.getByRole("link", { name: /Open tournaments/u });
    expect(tile).toHaveAttribute("href", "/groups/bothfeld/events");
    expect(tile).toHaveTextContent("no tournaments yet");
  });

  it("counts only the viewer's entries in this group in the hint", () => {
    currentOwnDecks = [{ groupSlug: "bothfeld" }, { groupSlug: "elsewhere" }, { groupSlug: null }];
    renderOverview("member");
    expect(screen.getByRole("link", { name: /Open tournaments/u })).toHaveTextContent(
      "1 of your entry",
    );
  });

  it("still shows the tile for admins", () => {
    renderOverview("admin");
    expect(screen.getByRole("link", { name: /Open tournaments/u })).toBeInTheDocument();
  });
});
