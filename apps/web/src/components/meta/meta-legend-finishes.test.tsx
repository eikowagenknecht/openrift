import type { MetaLegendFinish } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@tanstack/react-router", () => {
  function Anchor({
    to,
    params,
    children,
    className,
  }: {
    to?: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  }) {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "#",
    );
    return (
      <a href={href} className={className}>
        {children ?? "link"}
      </a>
    );
  }
  return { Link: Anchor, createLink: () => Anchor };
});

vi.mock("@/lib/auth-session", () => ({ useUserId: () => captured.userId }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendFinishes } from "./meta-legend-finishes";

type FinishOverrides = Partial<Omit<MetaLegendFinish, "event">> & {
  event?: Partial<MetaLegendFinish["event"]>;
};

function finish({ event, ...overrides }: FinishOverrides = {}): MetaLegendFinish {
  return {
    playerId: "p1",
    rank: 1,
    rankIsTier: false,
    playerName: "P. Lefebvre",
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    ...overrides,
    event: {
      slug: "city-challenge-lyon",
      name: "City Challenge Lyon",
      eventDate: "2026-08-09",
      format: "constructed",
      tier: "competitive",
      country: "FR",
      playerCount: 186,
      ...event,
    },
  };
}

/** Enough finishes to push the list past the "Best" cut. */
function manyFinishes(count: number): MetaLegendFinish[] {
  return Array.from({ length: count }, (_, index) =>
    finish({
      playerId: `p${String(index)}`,
      rank: index + 1,
      playerName: `Pilot ${String(index)}`,
      event: { name: `Event ${String(index)}`, eventDate: `2026-08-${String(index + 10)}` },
    }),
  );
}

beforeEach(() => {
  captured.userId = null;
});

describe("MetaLegendFinishes", () => {
  it("says nothing has been archived rather than showing an empty table", () => {
    render(<MetaLegendFinishes finishes={[]} />);
    expect(
      screen.getByText("No archived event has this legend on its standings yet."),
    ).toBeInTheDocument();
  });

  it("prints the record in full and the event's own facts", () => {
    render(<MetaLegendFinishes finishes={[finish()]} />);
    expect(screen.getAllByText("12-1-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-09 · 186 players").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Competitive").length).toBeGreaterThan(0);
  });

  it("opens on the best placings and names the whole record on the toggle", async () => {
    render(<MetaLegendFinishes finishes={manyFinishes(9)} />);

    expect(screen.getByRole("button", { name: "All 9" })).toBeInTheDocument();
    expect(screen.getAllByText("Pilot 0").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pilot 6")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All 9" }));
    expect(screen.getAllByText("Pilot 6").length).toBeGreaterThan(0);
  });

  it("switches to the whole record from the footer", async () => {
    render(<MetaLegendFinishes finishes={manyFinishes(9)} />);

    await userEvent.click(screen.getByRole("button", { name: "Show all 9 finishes" }));
    expect(screen.getAllByText("Pilot 6").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("grows the whole record a page at a time", async () => {
    render(<MetaLegendFinishes finishes={manyFinishes(30)} />);

    await userEvent.click(screen.getByRole("button", { name: "All 30" }));
    expect(screen.getByRole("button", { name: "5 more finishes" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "5 more finishes" }));
    expect(screen.queryByRole("button", { name: /more finishes/u })).not.toBeInTheDocument();
  });

  it("leads a finish with a list at the archived deck", () => {
    render(<MetaLegendFinishes finishes={[finish({ shareToken: "tok-1", listStatus: "full" })]} />);
    expect(screen.getAllByRole("link", { name: "Decklist" }).length).toBeGreaterThan(0);
  });

  it("labels a partial list as partial", () => {
    render(
      <MetaLegendFinishes finishes={[finish({ shareToken: "tok-1", listStatus: "partial" })]} />,
    );
    expect(screen.getAllByRole("link", { name: "Partial" }).length).toBeGreaterThan(0);
  });

  it("offers no submission link to a signed-out reader", () => {
    render(<MetaLegendFinishes finishes={[finish()]} />);
    expect(screen.queryByText("+ Add")).not.toBeInTheDocument();
  });

  it("offers a signed-in reader the way to fill a listless finish", () => {
    captured.userId = "user-1";
    render(<MetaLegendFinishes finishes={[finish()]} />);
    expect(screen.getAllByRole("link", { name: "+ Add" }).length).toBeGreaterThan(0);
  });

  it("shows no footer when the whole record already fits the best view", () => {
    render(<MetaLegendFinishes finishes={manyFinishes(3)} />);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("leaves the record out for a finish the source published none for", () => {
    render(
      <MetaLegendFinishes
        finishes={[finish({ wins: null, losses: null, draws: null, event: { playerCount: null } })]}
      />,
    );
    expect(screen.queryByText("12-1-0")).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-08-09").length).toBeGreaterThan(0);
  });
});
