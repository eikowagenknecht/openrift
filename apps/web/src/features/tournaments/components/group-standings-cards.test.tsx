import type {
  GroupStageGroupView,
  GroupStageView,
  GroupStandingRowView,
} from "@openrift/shared/types/api/pod-tournament";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CutSeedsCard, GroupStandingsCard } from "./group-standings-cards";

function makeRow(
  playerId: string,
  place: number,
  overrides: Partial<GroupStandingRowView> = {},
): GroupStandingRowView {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    legendCardId: null,
    legendName: null,
    place,
    points: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    gamesWon: 0,
    gamesPlayed: 0,
    gameWinRate: null,
    decidedBy: null,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GroupStageGroupView> = {}): GroupStageGroupView {
  return {
    id: "g-A",
    label: "A",
    pairedGroupId: null,
    pairedGroupLabel: null,
    playerIds: ["p1", "p2", "p3", "p4"],
    roundsStarted: 3,
    currentRoundReported: true,
    canStartNextRound: false,
    done: true,
    standings: [makeRow("p1", 1), makeRow("p2", 2)],
    ...overrides,
  };
}

function makeStage(overrides: Partial<GroupStageView> = {}): GroupStageView {
  return {
    groups: [makeGroup()],
    ranking: [],
    pendingMetaShares: [],
    stageComplete: true,
    cutGenerated: false,
    seedsDiverged: false,
    ...overrides,
  };
}

function bodyRows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

describe("GroupStandingsCard", () => {
  it("names the group and counts its players", () => {
    render(<GroupStandingsCard group={makeGroup()} />);
    expect(screen.getByText("Group A")).toBeInTheDocument();
    expect(screen.getByText("4 players")).toBeInTheDocument();
  });

  it("explains the cross-group match on a paired 3-player group", () => {
    render(
      <GroupStandingsCard
        group={makeGroup({
          playerIds: ["p1", "p2", "p3"],
          pairedGroupId: "g-E",
          pairedGroupLabel: "E",
        })}
      />,
    );
    expect(screen.getByText("Paired with Group E")).toBeInTheDocument();
    expect(
      screen.getByText("3 players · one cross-group match each, counted for the cut only"),
    ).toBeInTheDocument();
  });

  it("shows the Legend and the game win rate for each row", () => {
    render(
      <GroupStandingsCard
        group={makeGroup({
          standings: [
            makeRow("p1", 1, {
              displayName: "Ashe",
              legendName: "Ashe, Frost Archer",
              points: 6,
              wins: 2,
              losses: 1,
              gameWinRate: 0.75,
            }),
          ],
        })}
      />,
    );
    const [row] = bodyRows();
    expect(within(row!).getByText("Ashe")).toBeInTheDocument();
    expect(within(row!).getByText("Ashe, Frost Archer")).toBeInTheDocument();
    expect(within(row!).getByText("2-1-0")).toBeInTheDocument();
    expect(within(row!).getByText("75%")).toBeInTheDocument();
  });

  it("names the tier that put a row below the one above it", () => {
    render(
      <GroupStandingsCard
        group={makeGroup({
          standings: [makeRow("p1", 1), makeRow("p2", 2, { decidedBy: "h2h" })],
        })}
      />,
    );
    expect(screen.getByText("Below the row above by")).toBeInTheDocument();
    expect(screen.getByText("H2H")).toBeInTheDocument();
  });

  it("leaves the tier column blank when the points differ", () => {
    render(<GroupStandingsCard group={makeGroup()} />);
    expect(screen.queryByText("H2H")).not.toBeInTheDocument();
    expect(screen.queryByText("Draw")).not.toBeInTheDocument();
  });

  it("flags a tie that still needs a meta share", () => {
    render(
      <GroupStandingsCard
        group={makeGroup({
          standings: [makeRow("p1", 1), makeRow("p2", 1, { decidedBy: "meta_pending" })],
        })}
      />,
    );
    expect(screen.getByText("Needs meta share")).toBeInTheDocument();
  });
});

describe("CutSeedsCard", () => {
  const ranking = [
    {
      playerId: "p1",
      displayName: "Ashe",
      groupLabel: "C",
      place: 1,
      matchWinRate: 1,
      gameWinRate: 0.8,
      decidedBy: null,
      seed: 1,
      qualified: true,
    },
    {
      playerId: "p2",
      displayName: "Braum",
      groupLabel: "B",
      place: 1,
      matchWinRate: 0.667,
      gameWinRate: 0.6,
      decidedBy: "mw" as const,
      seed: 2,
      qualified: true,
    },
    {
      playerId: "p3",
      displayName: "Caitlyn",
      groupLabel: "A",
      place: 2,
      matchWinRate: 0.5,
      gameWinRate: 0.5,
      decidedBy: null,
      seed: null,
      qualified: false,
    },
  ];

  it("lists the qualifiers with their seed, group and rates", () => {
    render(<CutSeedsCard groupStage={makeStage({ ranking })} cutSize={4} />);
    expect(screen.getByText("Top 4 seeds")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
    const [first] = bodyRows();
    expect(within(first!).getByText("#1")).toBeInTheDocument();
    expect(within(first!).getByText("Ashe")).toBeInTheDocument();
    expect(within(first!).getByText("C")).toBeInTheDocument();
    expect(within(first!).getByText("100%")).toBeInTheDocument();
  });

  it("names match win rate as the tier that split two group winners", () => {
    render(<CutSeedsCard groupStage={makeStage({ ranking })} cutSize={4} />);
    const [, second] = bodyRows();
    expect(within(second!).getByText("MW%")).toBeInTheDocument();
  });

  it("names the players who just missed out", () => {
    render(<CutSeedsCard groupStage={makeStage({ ranking })} cutSize={4} />);
    expect(screen.getByText("Did not qualify: Caitlyn.")).toBeInTheDocument();
  });

  it("marks the seeds locked once the cut exists", () => {
    render(<CutSeedsCard groupStage={makeStage({ ranking, cutGenerated: true })} cutSize={4} />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("warns when a corrected group result no longer agrees with the locked seeds", () => {
    render(
      <CutSeedsCard
        groupStage={makeStage({ ranking, cutGenerated: true, seedsDiverged: true })}
        cutSize={4}
      />,
    );
    expect(
      screen.getByText(
        "A group result was corrected after the cut. Group standings now differ from the locked seeds.",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing before anyone has qualified", () => {
    const { container } = render(<CutSeedsCard groupStage={makeStage()} cutSize={8} />);
    expect(container).toBeEmptyDOMElement();
  });
});
