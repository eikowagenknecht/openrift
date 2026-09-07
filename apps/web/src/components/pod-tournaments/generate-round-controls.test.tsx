import type { PodPlayerResponse, PodStandingRow } from "@openrift/shared/types/api/pod-tournament";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateMutate = vi.fn();
const participantMutate = vi.fn();

vi.mock("@/hooks/use-tournaments", () => ({
  useGenerateTournamentRound: () => ({ mutateAsync: generateMutate, isPending: false }),
  useParticipantAction: () => ({ mutateAsync: participantMutate, isPending: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const { GenerateRoundControls } = await import("./generate-round-controls");

function makePlayer(id: string, displayName: string): PodPlayerResponse {
  return {
    id,
    displayName,
    status: "active",
    droppedAfterRound: null,
    teamId: null,
    createdAt: "2026-07-01T10:00:00Z",
  };
}

function makeStanding(playerId: string, byeCount: number): PodStandingRow {
  return {
    playerId,
    displayName: playerId,
    status: "active",
    droppedAfterRound: null,
    teamId: null,
    score: 0,
    gamePoints: 0,
    roundsPlayed: 0,
    pods3Count: 0,
    pods4Count: 0,
    byeCount,
    podWins: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    region: null,
    avgOpponentScore: 0,
    avgOpponentGamePoints: 0,
  };
}

const players = [
  makePlayer("p1", "Ashe"),
  makePlayer("p2", "Braum"),
  makePlayer("p3", "Caitlyn"),
  makePlayer("p4", "Darius"),
];

function renderControls(props: Partial<Parameters<typeof GenerateRoundControls>[0]> = {}) {
  return render(
    <GenerateRoundControls
      id="t1"
      players={players}
      standings={players.map((player) => makeStanding(player.id, 0))}
      isFirstRound={false}
      nextRoundNumber={3}
      reachedSuggestion={false}
      suggested={4}
      {...props}
    />,
  );
}

describe("GenerateRoundControls", () => {
  beforeEach(() => {
    generateMutate.mockReset();
    generateMutate.mockResolvedValue(undefined);
    participantMutate.mockReset();
    participantMutate.mockResolvedValue(undefined);
  });

  it("leads with the round it will generate and how many players it seats", () => {
    renderControls();

    expect(screen.getByText("Round 3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("players to pair · round 3 of ~4")).toBeInTheDocument();
  });

  it("picks byes from a searchable list and echoes the choice as a removable chip", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "Sit players out" }));
    await user.type(screen.getByPlaceholderText("Search players..."), "Cait");
    await user.click(await screen.findByRole("option", { name: /Caitlyn/u }));

    expect(screen.getByRole("button", { name: "Sitting out 1" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Don't sit Caitlyn out" }));
    expect(screen.getByRole("button", { name: "Sit players out" })).toBeInTheDocument();
  });

  it("generates the round with the chosen byes", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "Sit players out" }));
    await user.click(await screen.findByRole("option", { name: /Ashe/u }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Generate next round" }));

    expect(generateMutate).toHaveBeenCalledWith({ id: "t1", byes: ["p1"] });
  });

  it("warns when a picked bye has already had one", async () => {
    const user = userEvent.setup();
    renderControls({
      standings: [
        makeStanding("p1", 1),
        makeStanding("p2", 0),
        makeStanding("p3", 0),
        makeStanding("p4", 0),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Sit players out" }));
    await user.click(await screen.findByRole("option", { name: /Ashe/u }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ashe has already had a bye.");
  });

  it("blocks generating while a seated player has no region, and unblocks once they are byed", async () => {
    const user = userEvent.setup();
    renderControls({ missingRegionIds: ["p2"] });

    expect(screen.getByRole("alert")).toHaveTextContent("Braum has no region yet.");
    expect(screen.getByRole("button", { name: "Generate next round" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Sit players out" }));
    await user.click(await screen.findByRole("option", { name: /Braum/u }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate next round" })).toBeEnabled();
  });

  it("drops a player from the same row as the bye picker, without staging it", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "Drop players" }));
    await user.click(await screen.findByRole("option", { name: /Caitlyn/u }));

    expect(participantMutate).toHaveBeenCalledWith({
      id: "t1",
      participantId: "p3",
      action: "drop",
    });
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("gives up a player's bye when they are dropped", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.click(screen.getByRole("button", { name: "Sit players out" }));
    await user.click(await screen.findByRole("option", { name: /Ashe/u }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Sitting out 1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Drop players" }));
    await user.click(await screen.findByRole("option", { name: /Ashe/u }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Sit players out" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate next round" }));
    expect(generateMutate).toHaveBeenCalledWith({ id: "t1", byes: [] });
  });

  it("lists dropped players so a mis-tap is undone in place", async () => {
    const user = userEvent.setup();
    renderControls({
      players: [players[0]!, players[1]!, { ...players[2]!, status: "dropped" }],
    });

    await user.click(screen.getByRole("button", { name: "Drop players" }));
    await user.click(await screen.findByRole("option", { name: /Caitlyn/u }));

    expect(participantMutate).toHaveBeenCalledWith({
      id: "t1",
      participantId: "p3",
      action: "reactivate",
    });
  });

  it("keeps the drop picker reachable when every player has dropped", async () => {
    const user = userEvent.setup();
    renderControls({
      players: players.map((player) => ({ ...player, status: "dropped" as const })),
    });

    expect(screen.queryByRole("button", { name: "Sit players out" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Drop players" }));
    expect(await screen.findByRole("option", { name: /Ashe/u })).toBeInTheDocument();
  });
});
