import type {
  PodTournamentDetailResponse,
  TournamentDetailResponse,
  TournamentParticipantResponse,
} from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantActionMutate = vi.fn();
let participants: TournamentParticipantResponse[] = [];
let runState: PodTournamentDetailResponse | undefined;

vi.mock("@/hooks/use-tournaments", () => ({
  tournamentRunStateQueryOptions: (userId: string, id: string) => ({
    queryKey: ["run-state", userId, id],
  }),
  useParticipantAction: () => ({ mutateAsync: participantActionMutate, isPending: false }),
  useTournamentParticipants: () => ({ data: { items: participants } }),
}));

// The run-state query is the only `useQuery` the tab makes; the tab reads
// nothing but `data`, so the options object above is inert.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: runState }),
}));

vi.mock("@/hooks/use-tournament-deck-check", () => ({
  useTournamentDeckCheckEntries: () => ({
    data: { event: { entryCount: 6, approvedCount: 4, checkedCount: 2 } },
  }),
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

const { TournamentOverviewTab } = await import("./tournament-overview-tab");
const { TournamentHero } = await import("./tournament-hero");

function makeParticipant(
  id: string,
  overrides: Partial<TournamentParticipantResponse> = {},
): TournamentParticipantResponse {
  return {
    id,
    userId: null,
    userName: null,
    displayName: `Player ${id}`,
    riotId: null,
    status: "active",
    seed: null,
    region: "ionia",
    fixedTable: null,
    droppedAfterRound: null,
    claimToken: null,
    claimBlocked: false,
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function makeStanding(
  playerId: string,
  score: number,
  overrides: Partial<PodTournamentDetailResponse["standings"][number]> = {},
): PodTournamentDetailResponse["standings"][number] {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    droppedAfterRound: null,
    score,
    gamePoints: score,
    roundsPlayed: 2,
    pods3Count: 0,
    pods4Count: 2,
    byeCount: 0,
    podWins: 1,
    wins: 0,
    draws: 0,
    losses: 0,
    region: "ionia",
    avgOpponentScore: 3,
    avgOpponentGamePoints: 3,
    ...overrides,
  };
}

function makeRunState(
  overrides: Partial<PodTournamentDetailResponse> = {},
): PodTournamentDetailResponse {
  return {
    tournament: {
      id: "t-1",
      name: "Summoner Skirmish",
      status: "running",
      currentRound: 2,
      pairingStyle: "pod",
      scoringScheme: "standard",
      byePoints: 3,
      matchFormat: "bo1",
      winPoints: 3,
      drawPoints: 1,
      regionsEnabled: false,
      reportToken: null,
      createdAt: "2026-07-01T10:00:00Z",
      updatedAt: "2026-07-01T10:00:00Z",
    },
    players: [],
    standings: [
      makeStanding("p1", 9),
      makeStanding("p2", 6),
      makeStanding("p3", 4),
      makeStanding("p4", 3),
      makeStanding("p5", 1),
    ],
    rounds: [
      {
        id: "r-1",
        roundNumber: 1,
        status: "finalized",
        pairingStrategy: null,
        penaltyTotal: null,
        createdAt: "2026-07-01T10:00:00Z",
        finalizedAt: "2026-07-01T11:00:00Z",
        pods: [],
        byes: [],
      },
      {
        id: "r-2",
        roundNumber: 2,
        status: "reporting",
        pairingStrategy: null,
        penaltyTotal: null,
        createdAt: "2026-07-01T11:00:00Z",
        finalizedAt: null,
        pods: [
          {
            id: "pod-1",
            podNumber: 1,
            size: 4,
            resultStatus: "reported",
            members: [],
            penalty: null,
          },
          {
            id: "pod-2",
            podNumber: 2,
            size: 4,
            resultStatus: "reported",
            members: [],
            penalty: null,
          },
          {
            id: "pod-3",
            podNumber: 3,
            size: 4,
            resultStatus: "pending",
            members: [
              { playerId: "p1", displayName: "Player p1", gamePoints: 3, placement: 1, points: 3 },
              { playerId: "p2", displayName: "Player p2", gamePoints: 1, placement: 2, points: 1 },
              {
                playerId: "p3",
                displayName: "Player p3",
                gamePoints: null,
                placement: null,
                points: null,
              },
              {
                playerId: "p4",
                displayName: "Player p4",
                gamePoints: null,
                placement: null,
                points: null,
              },
            ],
            penalty: null,
          },
        ],
        byes: [],
      },
    ],
    openRoundSnapshot: null,
    ...overrides,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * A tournament that is genuinely live right now. The effective state is derived
 * from the clock (a start with no end auto-completes after a grace period), so
 * the window is anchored to `Date.now()` rather than to a fixed date that would
 * silently age into "completed".
 *
 * @returns The detail fixture.
 */
function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "t-1",
    name: "Summoner Skirmish",
    status: "running",
    host: { type: "user", displayName: "Ari", orgId: null, orgSlug: null },
    groupId: null,
    groupSlug: null,
    groupName: null,
    pairingStyle: "pod",
    deckSubmission: "required",
    deckFormat: null,
    startsAt: new Date(Date.now() - HOUR_MS).toISOString(),
    endsAt: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
    modules: { pairing: true, deckSubmission: true, deckCheck: true, staff: true },
    participantCount: 8,
    pendingRequestCount: 0,
    myRoles: ["host"],
    participantPreview: [],
    winner: null,
    coverLegends: [],
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-01T10:00:00Z",
    currentRound: 2,
    scoringScheme: "standard",
    byePoints: 3,
    matchFormat: "bo1",
    winPoints: 3,
    drawPoints: 1,
    regionsEnabled: false,
    deckPhase: "open",
    submissionsCloseAt: null,
    listLockMode: "on_submit",
    allowedSets: null,
    selfRegistration: true,
    reportToken: null,
    followToken: null,
    submissionToken: null,
    organizerInviteToken: null,
    judgeInviteToken: null,
    staff: [],
    hasRounds: true,
    ...overrides,
  } as TournamentDetailResponse;
}

beforeEach(() => {
  vi.clearAllMocks();
  participants = [makeParticipant("a"), makeParticipant("b")];
  runState = makeRunState();
});

describe("TournamentHero", () => {
  it("renders the policy chips and the state next to the round", () => {
    render(<TournamentHero detail={makeDetail()} />);

    expect(screen.getByText("Decklist required")).toBeInTheDocument();
    expect(screen.getByText("Registration open")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Summoner Skirmish" })).toBeInTheDocument();
  });

  it("marks a closed self-registration", () => {
    render(<TournamentHero detail={makeDetail({ selfRegistration: false })} />);

    expect(screen.getByText("Registration closed")).toBeInTheDocument();
  });
});

describe("TournamentOverviewTab", () => {
  it("shows the leader on the throne with the trailing ranks", () => {
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    const throne = screen.getByRole("link", { name: /Standings/u });
    expect(within(throne).getByText("Player p1")).toBeInTheDocument();
    expect(within(throne).getByText("after round 1")).toBeInTheDocument();
    // Ranks 4-5 trail the podium as plain rows.
    expect(within(throne).getByText("Player p4")).toBeInTheDocument();
    expect(within(throne).getByText("Player p5")).toBeInTheDocument();
  });

  it("shares a rank between players level on points, as the Standings page does", () => {
    runState = makeRunState({
      standings: [
        makeStanding("p1", 9, { avgOpponentScore: 1.75 }),
        makeStanding("p2", 9, { avgOpponentScore: 1.5 }),
        makeStanding("p3", 4),
      ],
    });
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    const throne = screen.getByRole("link", { name: /Standings/u });
    // Competition ranks: the tie-break orders the seats but doesn't settle the
    // claim to the place, so both level players wear 1 and the next skips to 3.
    // Positional ranks here would tell a different story to the Standings page.
    expect(within(throne).getAllByText("1")).toHaveLength(2);
    expect(within(throne).getByText("3")).toBeInTheDocument();
    expect(within(throne).queryByText("2")).not.toBeInTheDocument();
  });

  it("counts pod wins rather than a match record on a pod event", () => {
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    const throne = screen.getByRole("link", { name: /Standings/u });
    // Wins/draws/losses stay 0 for pod play, so a W-L-D here would read 0-0-0.
    expect(within(throne).getAllByText("1 pod win").length).toBeGreaterThan(0);
    expect(within(throne).queryByText("0-0-0")).not.toBeInTheDocument();
  });

  it("keeps the throne in place before any round is finalized", () => {
    runState = makeRunState({
      standings: [makeStanding("p1", 0, { roundsPlayed: 0 })],
      rounds: [],
    });
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    expect(screen.getByText("The throne fills after round 1 is finalized.")).toBeInTheDocument();
  });

  it("reflects reported pods and names the ones still open", () => {
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("pods reported")).toBeInTheDocument();
    expect(screen.getByText(/2 of 4 scores in/u)).toBeInTheDocument();
    expect(screen.getByText("Pod 3")).toBeInTheDocument();
  });

  it("names 1v1 pairings matches rather than pods", () => {
    const base = makeRunState();
    const round = base.rounds[1];
    runState = makeRunState({
      rounds: [
        base.rounds[0],
        {
          ...round,
          pods: round.pods.map((pod) => ({
            ...pod,
            size: 2 as const,
            members: pod.members.slice(0, 2),
          })),
        },
      ],
    });
    render(<TournamentOverviewTab id="t-1" detail={makeDetail({ pairingStyle: "swiss" })} />);

    expect(screen.getByText("matches reported")).toBeInTheDocument();
    expect(screen.getByText("Match 3")).toBeInTheDocument();
    expect(screen.queryByText("Pod 3")).not.toBeInTheDocument();
  });

  it("nudges to generate the first round before one exists", () => {
    runState = makeRunState({ rounds: [] });
    render(<TournamentOverviewTab id="t-1" detail={makeDetail({ currentRound: 0 })} />);

    expect(screen.getByText("Generate round 1")).toBeInTheDocument();
  });

  it("reads as finished rather than as an open action once the event is over", () => {
    render(<TournamentOverviewTab id="t-1" detail={makeDetail({ status: "completed" })} />);

    expect(screen.getByText("View pairings")).toBeInTheDocument();
    expect(screen.queryByText("Report results")).not.toBeInTheDocument();
  });

  it("lists every round in the rail, plus the next one while it can be generated", () => {
    runState = makeRunState({
      rounds: [
        {
          id: "r-1",
          roundNumber: 1,
          status: "finalized",
          pairingStrategy: null,
          penaltyTotal: null,
          createdAt: "2026-07-01T10:00:00Z",
          finalizedAt: "2026-07-01T11:00:00Z",
          pods: [],
          byes: [],
        },
      ],
    });
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    expect(screen.getByText("Finalized")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText("Not generated")).toBeInTheDocument();
  });

  it("approves and denies a pending join request", async () => {
    const user = userEvent.setup();
    participants = [
      makeParticipant("a"),
      makeParticipant("req-1", { status: "requested", displayName: "Ekko" }),
    ];
    render(<TournamentOverviewTab id="t-1" detail={makeDetail()} />);

    expect(screen.getByText("Ekko")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(participantActionMutate).toHaveBeenCalledWith({
      id: "t-1",
      participantId: "req-1",
      action: "approve",
    });

    await user.click(screen.getByRole("button", { name: "Deny" }));
    expect(participantActionMutate).toHaveBeenCalledWith({
      id: "t-1",
      participantId: "req-1",
      action: "deny",
    });
  });

  it("hides the join-requests band from viewers who cannot manage", () => {
    participants = [makeParticipant("req-1", { status: "requested", displayName: "Ekko" })];
    render(<TournamentOverviewTab id="t-1" detail={makeDetail({ myRoles: ["participant"] })} />);

    expect(screen.queryByText("Join requests")).not.toBeInTheDocument();
  });

  it("hints at dropped players and missing regions for a manager", () => {
    participants = [
      makeParticipant("a"),
      makeParticipant("b", { status: "dropped" }),
      makeParticipant("c", { region: null }),
    ];
    render(<TournamentOverviewTab id="t-1" detail={makeDetail({ regionsEnabled: true })} />);

    expect(screen.getByText("1 dropped · 1 without a region")).toBeInTheDocument();
  });
});
