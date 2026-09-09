import type {
  TournamentDetailResponse,
  TournamentParticipantResponse,
} from "@openrift/shared/types/api/tournament";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const participantActionMutateAsync = vi.fn();
const updateParticipantMutateAsync = vi.fn();
let participants: TournamentParticipantResponse[] = [];

vi.mock("@/features/tournaments/hooks/use-tournaments", () => ({
  useTournamentParticipants: () => ({ data: { items: participants } }),
}));

vi.mock("@/features/tournaments/hooks/use-tournament-mutations", () => ({
  useAddParticipant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useParticipantAction: () => ({ mutateAsync: participantActionMutateAsync, isPending: false }),
  useUpdateParticipant: () => ({ mutateAsync: updateParticipantMutateAsync, isPending: false }),
}));

const useTournamentDeckCheckEntries = vi.fn((_id: string, _enabled?: boolean) => ({
  data: undefined,
}));
vi.mock("@/features/tournaments/hooks/use-tournament-deck-check", () => ({
  useTournamentDeckCheckEntries,
}));

vi.mock("@/hooks/use-enums", () => ({
  useCustomTagList: () => ({
    byCategory: new Map([
      [
        "region",
        [
          { slug: "demacia", label: "Demacia" },
          { slug: "noxus", label: "Noxus" },
        ],
      ],
    ]),
  }),
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://preview.example.test",
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const { TournamentParticipantsTab } = await import("./tournament-participants-tab");

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
    teamId: null,
    region: "demacia",
    legendCardId: null,
    legendName: null,
    groupLabel: null,
    fixedTable: null,
    droppedAfterRound: null,
    claimToken: null,
    claimBlocked: false,
    createdAt: "2026-03-01T12:00:00Z",
    updatedAt: "2026-03-01T12:00:00Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "tournament-1",
    name: "Summoner Skirmish",
    myRoles: ["host"],
    regionsEnabled: true,
    ...overrides,
  } as unknown as TournamentDetailResponse;
}

function renderTab(detail: TournamentDetailResponse = makeDetail()) {
  return render(<TournamentParticipantsTab id="tournament-1" detail={detail} />);
}

function missingRegionsBand(): HTMLElement {
  const band = screen.getByText("Missing regions").closest("[data-slot='action-band']");
  if (!(band instanceof HTMLElement)) {
    throw new Error("missing-regions band not found");
  }
  return band;
}

beforeEach(() => {
  vi.clearAllMocks();
  participants = [];
});

describe("TournamentParticipantsTab missing-regions band", () => {
  it("lists the offending players and opens the set-region dialog from the band", async () => {
    const user = userEvent.setup();
    participants = [
      makeParticipant("p1", { displayName: "Ashe", region: null }),
      makeParticipant("p2", { displayName: "Braum", region: null }),
      makeParticipant("p3", { displayName: "Caitlyn" }),
    ];
    renderTab();

    const band = missingRegionsBand();
    expect(within(band).getByText("2")).toBeInTheDocument();
    expect(within(band).getByText("Ashe")).toBeInTheDocument();
    expect(within(band).getByText("Braum")).toBeInTheDocument();
    expect(within(band).queryByText("Caitlyn")).not.toBeInTheDocument();

    await user.click(within(band).getAllByRole("button", { name: "Set region" })[0]!);
    expect(await screen.findByText("Set region for Ashe")).toBeInTheDocument();
  });

  it("stays hidden when every active player has a region", () => {
    participants = [makeParticipant("p1"), makeParticipant("p2", { status: "dropped" })];
    renderTab();
    expect(screen.queryByText("Missing regions")).not.toBeInTheDocument();
  });

  it("does not count dropped players as blockers", () => {
    participants = [
      makeParticipant("p1", { displayName: "Ashe", region: null }),
      makeParticipant("p2", { displayName: "Braum", region: null, status: "dropped" }),
    ];
    renderTab();

    const band = missingRegionsBand();
    expect(within(band).getByText("1")).toBeInTheDocument();
    expect(within(band).queryByText("Braum")).not.toBeInTheDocument();
  });
});

describe("TournamentParticipantsTab stat strip", () => {
  it("counts the active and dropped field instead of a bare player total", () => {
    participants = [
      makeParticipant("p1"),
      makeParticipant("p2"),
      makeParticipant("p3", { status: "dropped" }),
      makeParticipant("p4", { status: "no_show" }),
      makeParticipant("p5", { status: "requested" }),
    ];
    const { container } = renderTab();

    const strip = container.querySelector("[data-slot='stat-strip']");
    expect(strip).not.toBeNull();
    const active = within(strip as HTMLElement)
      .getByText("active")
      .closest("div");
    expect(within(active as HTMLElement).getByText("2")).toBeInTheDocument();
    const dropped = within(strip as HTMLElement)
      .getByText("dropped")
      .closest("div");
    expect(within(dropped as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText("2/2")).toBeInTheDocument();
  });

  it("omits the region stat when the tournament is not region-aware", () => {
    participants = [makeParticipant("p1")];
    const { container } = renderTab(makeDetail({ regionsEnabled: false }));

    const strip = container.querySelector("[data-slot='stat-strip']");
    expect(within(strip as HTMLElement).queryByText("with region")).not.toBeInTheDocument();
  });
});

describe("TournamentParticipantsTab roster groups", () => {
  it("hoists join requests into their own group with working approve and deny", async () => {
    const user = userEvent.setup();
    participants = [
      makeParticipant("p1", { displayName: "Ashe" }),
      makeParticipant("p2", { displayName: "Braum", status: "requested" }),
    ];
    renderTab();

    const heading = screen.getByRole("heading", { name: /Join requests/u });
    const group = heading.parentElement as HTMLElement;
    expect(within(group).getByText("1")).toBeInTheDocument();
    expect(within(group).getByText("Braum")).toBeInTheDocument();
    expect(within(group).queryByText("Ashe")).not.toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: "Approve" }));
    expect(participantActionMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      participantId: "p2",
      action: "approve",
    });

    await user.click(within(group).getByRole("button", { name: "Deny" }));
    expect(participantActionMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      participantId: "p2",
      action: "deny",
    });
  });

  it("groups dropped players below the active field and dims them", () => {
    participants = [
      makeParticipant("p1", { displayName: "Ashe" }),
      makeParticipant("p2", { displayName: "Braum", status: "dropped" }),
      makeParticipant("p3", { displayName: "Caitlyn", status: "no_show" }),
    ];
    renderTab();

    const headings = screen.getAllByRole("heading").map((node) => node.textContent);
    expect(headings).toEqual(["Active1", "Dropped2"]);

    const droppedGroup = screen.getByRole("heading", { name: /Dropped/u })
      .parentElement as HTMLElement;
    expect(within(droppedGroup).getByText("Braum")).toBeInTheDocument();
    expect(within(droppedGroup).getByText("Caitlyn")).toBeInTheDocument();
    expect(within(droppedGroup).getByText("Braum").closest("[data-slot='card']")).toHaveClass(
      "opacity-50",
    );
  });

  it("filters the groups by the search box", async () => {
    const user = userEvent.setup();
    participants = [
      makeParticipant("p1", { displayName: "Ashe" }),
      makeParticipant("p2", { displayName: "Braum", status: "dropped" }),
    ];
    renderTab();

    await user.type(screen.getByRole("textbox", { name: "Search players" }), "ash");
    expect(screen.getByText("Ashe")).toBeInTheDocument();
    expect(screen.queryByText("Braum")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Dropped/u })).not.toBeInTheDocument();
  });
});

describe("TournamentParticipantsTab fixed tables", () => {
  it("shows a table badge for a fixed-seat player", () => {
    participants = [makeParticipant("p1", { displayName: "Ashe", fixedTable: 7 })];
    renderTab();
    expect(screen.getByText("Table 7")).toBeInTheDocument();
  });

  it("sets a fixed table from the row menu", async () => {
    const user = userEvent.setup();
    participants = [makeParticipant("p1", { displayName: "Ashe" })];
    renderTab();

    await user.click(screen.getByRole("button", { name: "Participant actions" }));
    await user.click(await screen.findByText("Set fixed table"));
    expect(await screen.findByText("Set fixed table for Ashe")).toBeInTheDocument();

    await user.type(screen.getByRole("spinbutton", { name: "Fixed table number" }), "7");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateParticipantMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      participantId: "p1",
      fixedTable: 7,
    });
  });

  it("clears the fixed table when the field is emptied", async () => {
    const user = userEvent.setup();
    participants = [makeParticipant("p1", { displayName: "Ashe", fixedTable: 7 })];
    renderTab();

    await user.click(screen.getByRole("button", { name: "Participant actions" }));
    await user.click(await screen.findByText("Set fixed table"));
    await user.clear(screen.getByRole("spinbutton", { name: "Fixed table number" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateParticipantMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      participantId: "p1",
      fixedTable: null,
    });
  });

  it("refuses to save an out-of-range table number", async () => {
    const user = userEvent.setup();
    participants = [makeParticipant("p1", { displayName: "Ashe" })];
    renderTab();

    await user.click(screen.getByRole("button", { name: "Participant actions" }));
    await user.click(await screen.findByText("Set fixed table"));
    await user.type(screen.getByRole("spinbutton", { name: "Fixed table number" }), "1000");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(updateParticipantMutateAsync).not.toHaveBeenCalled();
  });
});

describe("TournamentParticipantsTab deck-check query gating", () => {
  it("disables the entries query when deck submission is off", () => {
    renderTab(makeDetail({ deckSubmission: "none" }));
    expect(useTournamentDeckCheckEntries).toHaveBeenCalledWith("tournament-1", false);
  });

  it("enables the entries query for managers of deck-submission tournaments", () => {
    renderTab(makeDetail({ deckSubmission: "required" }));
    expect(useTournamentDeckCheckEntries).toHaveBeenCalledWith("tournament-1", true);
  });

  it("disables the entries query for viewers without manage rights", () => {
    renderTab(makeDetail({ deckSubmission: "required", myRoles: [] }));
    expect(useTournamentDeckCheckEntries).toHaveBeenCalledWith("tournament-1", false);
  });
});
