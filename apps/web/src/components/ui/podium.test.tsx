import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PodiumSeat } from "@/components/ui/podium";
import { Medal, Podium } from "@/components/ui/podium";

function seat(rank: number, name: string, score: number, hint?: string): PodiumSeat {
  return { key: name, rank, name, score, hint };
}

/** @returns The seat names in DOM order, which is the rendered display order. */
function seatNames(): string[] {
  const podium = screen.getByTestId("podium-host").firstElementChild as HTMLElement;
  return [...podium.querySelectorAll("span.truncate")].map((el) => el.textContent ?? "");
}

function renderPodium(seats: PodiumSeat[], emptyLabel?: string) {
  return render(
    <div data-testid="podium-host">
      <Podium seats={seats} emptyLabel={emptyLabel} />
    </div>,
  );
}

describe("Podium", () => {
  it("centers the winner between the runners-up", () => {
    renderPodium([seat(1, "DerVuk", 12), seat(2, "Poppy", 10), seat(3, "Fenix", 9)]);
    expect(seatNames()).toEqual(["Poppy", "DerVuk", "Fenix"]);
  });

  it("raises only the leader's seat", () => {
    renderPodium([seat(1, "DerVuk", 12), seat(2, "Poppy", 10), seat(3, "Fenix", 9)]);
    const raised = document.querySelectorAll(String.raw`.ring-border-accent\/40`);
    expect(raised).toHaveLength(1);
    expect(raised[0].textContent).toContain("DerVuk");
  });

  it("drops seats past the third", () => {
    renderPodium([
      seat(1, "DerVuk", 12),
      seat(2, "Poppy", 10),
      seat(3, "Fenix", 9),
      seat(4, "Mira", 8),
    ]);
    expect(screen.queryByText("Mira")).not.toBeInTheDocument();
    expect(seatNames()).toHaveLength(3);
  });

  it("seats a two-player field without leaving a gap", () => {
    renderPodium([seat(1, "DerVuk", 6), seat(2, "Poppy", 3)]);
    expect(seatNames()).toEqual(["Poppy", "DerVuk"]);
    expect(screen.getByTestId("podium-host").querySelector("[data-slot=podium]")).toHaveClass(
      "grid-cols-2",
    );
  });

  it("seats a one-player field", () => {
    renderPodium([seat(1, "DerVuk", 3)]);
    expect(seatNames()).toEqual(["DerVuk"]);
    expect(screen.getByTestId("podium-host").querySelector("[data-slot=podium]")).toHaveClass(
      "grid-cols-1",
    );
  });

  it("renders ghost seats and the empty label with no results", () => {
    renderPodium([], "The throne fills after round 1 is finalized.");
    expect(screen.getByText("The throne fills after round 1 is finalized.")).toBeInTheDocument();
    // Three medals, no names, and no scores.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(seatNames()).toEqual([]);
  });

  it("gives both sides of a tie the same medal and still raises the tie-break winner", () => {
    renderPodium([
      seat(1, "DerVuk", 9, "opp 1.75"),
      seat(1, "Poppy", 9, "opp 1.71"),
      seat(3, "Fenix", 7),
    ]);
    const medals = [...document.querySelectorAll("[data-slot=podium] [data-slot=medal]")];
    expect(medals.map((el) => el.textContent)).toEqual(["1", "1", "3"]);
    const raised = document.querySelector(String.raw`.ring-border-accent\/40`) as HTMLElement;
    expect(within(raised).getByText("DerVuk")).toBeInTheDocument();
    expect(within(raised).getByText("opp 1.75")).toBeInTheDocument();
  });
});

describe("Medal", () => {
  it("prints the rank", () => {
    render(<Medal rank={2} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("keeps the themed tints flat by default", () => {
    render(<Medal rank={2} />);
    const medal = screen.getByText("2");
    expect(medal).toHaveClass("bg-muted-foreground/40");
    expect(medal).not.toHaveClass("shadow-md");
  });

  it("plates and shadows the on-art variant so it holds over card art", () => {
    render(<Medal rank={2} variant="onArt" />);
    const medal = screen.getByText("2");
    expect(medal).toHaveClass("bg-zinc-300", "shadow-md", "ring-1");
    expect(medal).not.toHaveClass("bg-muted-foreground/40");
  });

  it("plates ranks past the podium too", () => {
    render(<Medal rank={9} variant="onArt" />);
    expect(screen.getByText("9")).toHaveClass("bg-zinc-800");
  });
});
