import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { metaPlayer } from "@/test/meta-event-fixtures";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

const { MetaEventPodium } = await import("./meta-event-podium");

const top3 = [
  metaPlayer({ id: "p-1", rank: 1, playerName: "Ana", wins: 14, losses: 1, draws: 0 }),
  metaPlayer({ id: "p-2", rank: 2, playerName: "Bo", wins: 13, losses: 2, draws: 0 }),
  metaPlayer({ id: "p-3", rank: 3, playerName: "Cy", wins: 13, losses: 2, draws: 0 }),
];

/** One seat per rendered player, in the order they sit. */
function seats(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-slot="meta-podium-seat"]')];
}

describe("MetaEventPodium", () => {
  it("renders nothing when the standings have not arrived", () => {
    const { container } = render(<MetaEventPodium players={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("seats the winner between the runners-up, and raises only that seat", () => {
    const { container } = render(<MetaEventPodium players={top3} />);
    const rendered = seats(container);
    expect(rendered.map((seat) => within(seat).getByText(/^(?:Ana|Bo|Cy)$/u).textContent)).toEqual([
      "Bo",
      "Ana",
      "Cy",
    ]);
    expect(rendered.map((seat) => seat.dataset.raised)).toEqual(["false", "true", "false"]);
  });

  it("leads each seat with the record, as all three parts", () => {
    render(<MetaEventPodium players={top3} />);
    expect(screen.getByText("14-1-0")).toBeInTheDocument();
    expect(screen.getAllByText("13-2-0")).toHaveLength(2);
  });

  it("names the legend by champion and card title, with its runes", () => {
    render(<MetaEventPodium players={[top3[0]]} />);
    expect(screen.getByText("Yasuo")).toBeInTheDocument();
    expect(screen.getByText("the Unforgiven")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fury" })).toBeInTheDocument();
  });

  it("medals each seat by its own rank, so a tie wears the same medal twice", () => {
    render(
      <MetaEventPodium
        players={[
          metaPlayer({ id: "p-1", rank: 1, playerName: "Ana" }),
          metaPlayer({ id: "p-2", rank: 1, playerName: "Bo" }),
        ]}
      />,
    );
    expect(screen.getAllByText("1")).toHaveLength(2);
  });

  it("seats a field of two without leaving a hole where third would be", () => {
    const { container } = render(<MetaEventPodium players={top3.slice(0, 2)} />);
    const rendered = seats(container);
    expect(rendered).toHaveLength(2);
    expect(rendered.map((seat) => within(seat).getByText(/^(?:Ana|Bo)$/u).textContent)).toEqual([
      "Bo",
      "Ana",
    ]);
  });

  it("omits the record for a player the source published none for", () => {
    render(
      <MetaEventPodium
        players={[metaPlayer({ playerName: "Ana", wins: null, losses: null, draws: null })]}
      />,
    );
    expect(screen.queryByText(/^\d+-\d+-\d+$/u)).toBeNull();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("seats only the top three of a longer field", () => {
    render(
      <MetaEventPodium
        players={[...top3, metaPlayer({ id: "p-4", rank: 4, playerName: "Dee" })]}
      />,
    );
    expect(screen.queryByText("Dee")).toBeNull();
  });
});
