import type { PodResponse, PodRoundResponse } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PairingsView } from "./pairings-view";

function makePod(overrides: Partial<PodResponse> = {}): PodResponse {
  return {
    id: "pod-1",
    podNumber: 1,
    size: 4,
    resultStatus: "pending",
    members: [
      {
        playerId: "p1",
        displayName: "Ashe",
        teamId: null,
        gamePoints: null,
        placement: null,
        points: null,
      },
      {
        playerId: "p2",
        displayName: "Braum",
        teamId: null,
        gamePoints: null,
        placement: null,
        points: null,
      },
      {
        playerId: "p3",
        displayName: "Caitlyn",
        teamId: null,
        gamePoints: null,
        placement: null,
        points: null,
      },
      {
        playerId: "p4",
        displayName: "Darius",
        teamId: null,
        gamePoints: null,
        placement: null,
        points: null,
      },
    ],
    penalty: null,
    ...overrides,
  };
}

function makeRound(overrides: Partial<PodRoundResponse> = {}): PodRoundResponse {
  return {
    id: "round-1",
    roundNumber: 1,
    status: "reporting",
    pairingStrategy: "pod",
    penaltyTotal: 12,
    createdAt: "2026-07-01T10:00:00Z",
    finalizedAt: null,
    pods: [makePod()],
    byes: [],
    ...overrides,
  };
}

function renderView(props: Partial<Parameters<typeof PairingsView>[0]> = {}) {
  return render(
    <PairingsView
      rounds={[makeRound()]}
      playMode="1v1"
      scoresByPlayer={new Map()}
      scheme="standard"
      byePoints={3}
      matchFormat="bo3"
      winPoints={3}
      drawPoints={1}
      showPenalty
      canEnterResult={() => true}
      onSubmitResult={vi.fn()}
      emptyMessage="No rounds yet"
      {...props}
    />,
  );
}

describe("PairingsView", () => {
  it("renders the empty state when there are no rounds", () => {
    renderView({
      rounds: [],
      emptyMessage: "No rounds yet",
      emptyDescription: "Generate the first round to begin.",
    });

    expect(screen.getByText("No rounds yet")).toBeInTheDocument();
    expect(screen.getByText("Generate the first round to begin.")).toBeInTheDocument();
  });

  it("renders nothing when the empty message is blank (the editor owns the surface)", () => {
    const { container } = renderView({ rounds: [], emptyMessage: "" });

    expect(container).toBeEmptyDOMElement();
  });

  it("heads the round with its pod and bye counts", () => {
    renderView({
      rounds: [
        makeRound({
          byes: [{ playerId: "p9", displayName: "Ekko" }],
        }),
      ],
    });

    expect(screen.getByRole("heading", { name: "Round 1" })).toBeInTheDocument();
    expect(screen.getByText("1 pod · 1 bye")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
  });

  it("shows the round's pairing quality as stats, toning zero rematches as a win", () => {
    renderView({
      rounds: [
        makeRound({
          penaltyTotal: 12,
          pods: [
            makePod({
              penalty: {
                total: 12,
                rematchPairs: 0,
                spread: 4,
                scoreSpread: 4,
                imbalance: 0,
                float: 0,
                threePodRepeat: 0,
                sameRegion: 0,
                repeatedRegion: 0,
              },
            }),
          ],
        }),
      ],
    });

    const strip = document.querySelector("[data-slot='stat-strip']");
    expect(strip).not.toBeNull();
    expect(within(strip as HTMLElement).getByText("penalty").previousSibling).toHaveTextContent(
      "12",
    );

    const rematchValue = within(strip as HTMLElement).getByText("rematches")
      .previousSibling as HTMLElement;
    expect(rematchValue).toHaveTextContent("0");
    expect(rematchValue.className).toContain("text-emerald-600");
    expect(within(strip as HTMLElement).getByText("largest spread")).toBeInTheDocument();
  });

  it("badges a pod as reported, part-way, or untouched", () => {
    renderView({
      rounds: [
        makeRound({
          pods: [
            makePod({ id: "pod-1", podNumber: 1, resultStatus: "reported" }),
            makePod({
              id: "pod-2",
              podNumber: 2,
              members: [
                {
                  playerId: "p5",
                  displayName: "Ezreal",
                  teamId: null,
                  gamePoints: 3,
                  placement: null,
                  points: null,
                },
                {
                  playerId: "p6",
                  displayName: "Fiora",
                  teamId: null,
                  gamePoints: 1,
                  placement: null,
                  points: null,
                },
                {
                  playerId: "p7",
                  displayName: "Garen",
                  teamId: null,
                  gamePoints: null,
                  placement: null,
                  points: null,
                },
                {
                  playerId: "p8",
                  displayName: "Hecarim",
                  teamId: null,
                  gamePoints: null,
                  placement: null,
                  points: null,
                },
              ],
            }),
            makePod({ id: "pod-3", podNumber: 3 }),
          ],
        }),
      ],
    });

    expect(screen.getByText("Reported")).toBeInTheDocument();
    expect(screen.getByText("2 of 4 in")).toBeInTheDocument();
    expect(screen.getByText("0 of 4 in")).toBeInTheDocument();
  });

  it("lists the byes with their points and flags a repeat bye", () => {
    renderView({
      rounds: [
        makeRound({
          byes: [
            { playerId: "p9", displayName: "Ekko" },
            { playerId: "p10", displayName: "Fiora" },
          ],
        }),
      ],
      snapshot: [
        {
          playerId: "p9",
          teamId: null,
          score: 3,
          pods3: 0,
          pods4: 1,
          byes: 2,
          opponents: {},
          regionHistory: {},
          region: null,
          fixedTable: null,
        },
        {
          playerId: "p10",
          teamId: null,
          score: 3,
          pods3: 0,
          pods4: 1,
          byes: 0,
          opponents: {},
          regionHistory: {},
          region: null,
          fixedTable: null,
        },
      ],
    });

    expect(screen.getByRole("heading", { name: /Byes/u })).toBeInTheDocument();
    expect(screen.getByText("Ekko")).toBeInTheDocument();
    expect(screen.getAllByText("+3 bye")).toHaveLength(2);
    expect(screen.getByText("2 earlier byes")).toBeInTheDocument();
  });

  it("warns when a fixed-seat player's pod plays at another table", () => {
    const snapshotDefaults = {
      score: 0,
      pods3: 0,
      pods4: 0,
      byes: 0,
      opponents: {},
      regionHistory: {},
      region: null,
    };
    renderView({
      rounds: [makeRound({ pods: [makePod({ podNumber: 3 })] })],
      snapshot: [
        { playerId: "p1", teamId: null, ...snapshotDefaults, fixedTable: 7 },
        { playerId: "p2", teamId: null, ...snapshotDefaults, fixedTable: null },
        { playerId: "p3", teamId: null, ...snapshotDefaults, fixedTable: 3 },
        { playerId: "p4", teamId: null, ...snapshotDefaults, fixedTable: null },
      ],
    });

    // Ashe (fixed table 7) is displaced to table 3; Caitlyn already sits at 3.
    expect(screen.getByText("Ashe moves from table 7 to table 3 this round")).toBeInTheDocument();
    expect(screen.queryByText(/Caitlyn moves/u)).not.toBeInTheDocument();
  });

  it("seats a member with one badge and keeps the two point figures at the end", () => {
    renderView({
      rounds: [
        makeRound({
          pods: [
            makePod({
              resultStatus: "reported",
              members: [
                {
                  playerId: "p1",
                  displayName: "Ashe",
                  teamId: null,
                  gamePoints: 8,
                  placement: 1,
                  points: 3,
                },
                {
                  playerId: "p2",
                  displayName: "PinkelGelbeZaehne",
                  teamId: null,
                  gamePoints: 5,
                  placement: 2,
                  points: 2,
                },
              ],
            }),
          ],
        }),
      ],
      scoresByPlayer: new Map([
        ["p1", 12],
        ["p2", 10],
      ]),
    });

    // Placement and the game points that produced it read as one badge, so the
    // row's end carries only the two point totals.
    const ashe = screen.getByText("Ashe").closest("li") as HTMLElement;
    expect(within(ashe).getByTitle("Finished 1st in the pod")).toHaveTextContent("1");
    expect(within(ashe).getByTitle("8 game points")).toHaveTextContent("8g");
    expect(within(ashe).getByTitle("12 points in the standings")).toHaveTextContent("12");
    expect(within(ashe).getByTitle("3 points from this round")).toHaveTextContent("+3");
    // The old free-standing "N game" figure is gone from the row's end.
    expect(within(ashe).queryByText(/game$/u)).not.toBeInTheDocument();
  });

  it("seeds a badge from game points before anyone has placed", () => {
    renderView({
      rounds: [
        makeRound({
          pods: [
            makePod({
              members: [
                {
                  playerId: "p1",
                  displayName: "Ashe",
                  teamId: null,
                  gamePoints: 6,
                  placement: null,
                  points: null,
                },
                {
                  playerId: "p2",
                  displayName: "Braum",
                  teamId: null,
                  gamePoints: null,
                  placement: null,
                  points: null,
                },
              ],
            }),
          ],
        }),
      ],
    });

    const ashe = screen.getByText("Ashe").closest("li") as HTMLElement;
    expect(within(ashe).getByTitle("6 game points")).toHaveTextContent("6g");
    // Nothing to seed Braum with yet, so he carries no badge at all.
    const braum = screen.getByText("Braum").closest("li") as HTMLElement;
    expect(within(braum).queryByTitle(/game points/u)).not.toBeInTheDocument();
  });

  it("submits a player's own score from their member row", async () => {
    const user = userEvent.setup();
    const onSubmitPlayerResult = vi.fn().mockResolvedValue(undefined);
    renderView({ onSubmitPlayerResult });

    await user.click(screen.getAllByRole("button", { name: "Add score" })[0]);
    await user.type(screen.getByLabelText("Game points for Ashe"), "7");
    await user.click(screen.getByRole("button", { name: "Save score for Ashe" }));

    expect(onSubmitPlayerResult).toHaveBeenCalledWith("pod-1", "p1", 7);
  });
});

describe("PairingsView 2v2 team matches", () => {
  function makeTeamPod(overrides: Partial<PodResponse> = {}): PodResponse {
    return makePod({
      members: [
        {
          playerId: "p1",
          displayName: "Ashe",
          teamId: "team-a",
          gamePoints: null,
          placement: null,
          points: null,
        },
        {
          playerId: "p2",
          displayName: "Braum",
          teamId: "team-a",
          gamePoints: null,
          placement: null,
          points: null,
        },
        {
          playerId: "p3",
          displayName: "Caitlyn",
          teamId: "team-b",
          gamePoints: null,
          placement: null,
          points: null,
        },
        {
          playerId: "p4",
          displayName: "Darius",
          teamId: "team-b",
          gamePoints: null,
          placement: null,
          points: null,
        },
      ],
      ...overrides,
    });
  }

  it("renders a size-4 pod as a match with the sides divided", () => {
    renderView({
      playMode: "2v2",
      rounds: [makeRound({ pods: [makeTeamPod()] })],
    });

    // Team rounds count matches, and the card is named a match, not a pod.
    expect(screen.getByText("1 match")).toBeInTheDocument();
    expect(screen.getByText("Match 1")).toBeInTheDocument();
    expect(screen.getByText("vs")).toBeInTheDocument();
    // Reporting progress counts sides, not the four players.
    expect(screen.getByText("0 of 2 in")).toBeInTheDocument();
  });

  it("offers the Swiss scoreline form for a team match with joined side names", async () => {
    const user = userEvent.setup();
    renderView({
      playMode: "2v2",
      rounds: [makeRound({ pods: [makeTeamPod()] })],
    });

    await user.click(screen.getByRole("button", { name: "Enter result" }));
    expect(screen.getByText("Ashe & Braum")).toBeInTheDocument();
    expect(screen.getByText("Caitlyn & Darius")).toBeInTheDocument();
  });

  it("submits the chosen scoreline mirrored across each side's players", async () => {
    const user = userEvent.setup();
    const onSubmitResult = vi.fn(() => Promise.resolve());
    renderView({
      playMode: "2v2",
      matchFormat: "bo1",
      rounds: [makeRound({ pods: [makeTeamPod()] })],
      onSubmitResult,
    });

    await user.click(screen.getByRole("button", { name: "Enter result" }));
    await user.click(screen.getByRole("button", { name: "1–0" }));
    await user.click(screen.getByRole("button", { name: "Save result" }));

    expect(onSubmitResult).toHaveBeenCalledWith("pod-1", [
      { playerId: "p1", gamePoints: 1 },
      { playerId: "p2", gamePoints: 1 },
      { playerId: "p3", gamePoints: 0 },
      { playerId: "p4", gamePoints: 0 },
    ]);
  });
});
