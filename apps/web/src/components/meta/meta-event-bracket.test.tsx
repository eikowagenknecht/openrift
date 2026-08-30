import type { MetaEventMatch } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

const { MetaEventBracket } = await import("./meta-event-bracket");

const players = ["Ana", "Bo", "Cy", "Dee"].map((playerName, index) =>
  metaPlayer({ id: `p-${index + 1}`, playerName, rank: index + 1 }),
);

/** A top 4: two semifinals into a final Ana takes. */
const topFour: MetaEventMatch[] = [
  metaMatch({ roundNumber: 1, tableNumber: 1, player1Id: "p-1", player2Id: "p-4" }),
  metaMatch({ roundNumber: 1, tableNumber: 2, player1Id: "p-2", player2Id: "p-3" }),
  metaMatch({
    roundNumber: 2,
    tableNumber: 1,
    player1Id: "p-1",
    player2Id: "p-2",
    winnerId: "p-1",
    gamesWonP1: 2,
    gamesWonP2: 1,
  }),
];

const topFourPhases = [metaPhase({ rankRequired: 4 })];

describe("MetaEventBracket", () => {
  it("renders nothing for an event whose source published no pairings", () => {
    const { container } = render(
      <MetaEventBracket matches={[]} phases={topFourPhases} players={players} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the matches hold no single-elimination cut", () => {
    const swiss = [
      metaMatch({ phaseOrder: 1, roundNumber: 1, tableNumber: 1 }),
      metaMatch({ phaseOrder: 1, roundNumber: 1, tableNumber: 2 }),
      metaMatch({ phaseOrder: 1, roundNumber: 2, tableNumber: 1 }),
      metaMatch({ phaseOrder: 1, roundNumber: 2, tableNumber: 2 }),
    ];
    const { container } = render(
      <MetaEventBracket
        matches={swiss}
        phases={[metaPhase({ phaseOrder: 1, roundType: "SWISS", rankRequired: null })]}
        players={players}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("titles the section from the cut's own size and names each round", () => {
    render(<MetaEventBracket matches={topFour} phases={topFourPhases} players={players} />);
    expect(screen.getByRole("heading", { name: "Top 4" })).toBeInTheDocument();
    expect(screen.getByText("Semifinals")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  it("names each seat's player and their champion", () => {
    render(<MetaEventBracket matches={topFour} phases={topFourPhases} players={players} />);
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yasuo").length).toBeGreaterThan(0);
  });

  it("keeps the champion alone in a bracket cell, without the legend card title", () => {
    render(<MetaEventBracket matches={topFour} phases={topFourPhases} players={players} />);
    expect(screen.queryByText("the Unforgiven")).toBeNull();
  });

  it("prints the games each side took", () => {
    render(<MetaEventBracket matches={topFour} phases={topFourPhases} players={players} />);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("medals the winner of the final, and only the final", () => {
    const { container } = render(
      <MetaEventBracket matches={topFour} phases={topFourPhases} players={players} />,
    );
    expect(container.querySelectorAll('[data-slot="medal"]')).toHaveLength(1);
  });

  it("medals nobody when a third-place match shares the last round with the final", () => {
    const withBronze = [
      ...topFour,
      metaMatch({ roundNumber: 2, tableNumber: 2, player1Id: "p-3", player2Id: "p-4" }),
    ];
    const { container } = render(
      <MetaEventBracket matches={withBronze} phases={topFourPhases} players={players} />,
    );

    expect(screen.getByRole("heading", { name: "Top 4" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="medal"]')).toHaveLength(0);
  });

  it("prints a dash where the source reported no games", () => {
    const unreported = [
      ...topFour.slice(0, 2),
      metaMatch({
        roundNumber: 2,
        player1Id: "p-1",
        player2Id: "p-2",
        winnerId: null,
        gamesWonP1: null,
        gamesWonP2: null,
      }),
    ];
    render(<MetaEventBracket matches={unreported} phases={topFourPhases} players={players} />);
    expect(screen.getAllByText("–").length).toBe(2);
  });

  it("calls the empty side of a bye what it is", () => {
    const withBye = [
      metaMatch({ roundNumber: 1, tableNumber: 1, player1Id: "p-1", player2Id: "p-4" }),
      metaMatch({
        roundNumber: 1,
        tableNumber: null,
        isBye: true,
        player1Id: "p-2",
        player2Id: null,
        winnerId: "p-2",
        gamesWonP2: null,
      }),
      metaMatch({ roundNumber: 2, player1Id: "p-1", player2Id: "p-2", winnerId: "p-1" }),
    ];
    render(<MetaEventBracket matches={withBye} phases={topFourPhases} players={players} />);
    expect(screen.getByText("Bye")).toBeInTheDocument();
  });

  it("calls a seat with no standings row unknown, not a bye", () => {
    const orphan = [
      ...topFour.slice(0, 2),
      metaMatch({ roundNumber: 2, player1Id: "p-1", player2Id: "gone", winnerId: "p-1" }),
    ];
    render(<MetaEventBracket matches={orphan} phases={topFourPhases} players={players} />);
    const finalColumn = screen.getByText("Final").parentElement as HTMLElement;
    expect(within(finalColumn).getByText("Unknown")).toBeInTheDocument();
    expect(within(finalColumn).queryByText("Bye")).toBeNull();
  });
});
