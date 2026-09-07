import type { MetaLegendFinish } from "@openrift/shared/types/api/meta";
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
    playerKey: "u4001",
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

function manyFinishes(count: number, from = 0): MetaLegendFinish[] {
  return Array.from({ length: count }, (_, index) =>
    finish({
      playerId: `p${String(from + index)}`,
      rank: from + index + 1,
      playerName: `Pilot ${String(from + index)}`,
      event: { name: `Event ${String(from + index)}` },
    }),
  );
}

function renderFinishes(
  rows: MetaLegendFinish[],
  overrides: {
    best?: MetaLegendFinish[];
    total?: number;
    loadingMore?: boolean;
    onShowMore?: () => void;
    narrowed?: boolean;
  } = {},
) {
  const onShowMore = overrides.onShowMore ?? vi.fn();
  render(
    <MetaLegendFinishes
      best={overrides.best ?? rows.slice(0, 5)}
      finishes={rows}
      total={overrides.total ?? rows.length}
      loadingMore={overrides.loadingMore}
      onShowMore={onShowMore}
      narrowed={overrides.narrowed}
    />,
  );
  return onShowMore;
}

beforeEach(() => {
  captured.userId = null;
});

describe("MetaLegendFinishes", () => {
  it("says nothing has been archived rather than showing an empty table", () => {
    renderFinishes([]);
    expect(
      screen.getByText("No archived event has this legend on its standings yet."),
    ).toBeInTheDocument();
  });

  it("says the scope holds nothing when it is the scope that emptied the record", () => {
    renderFinishes([], { narrowed: true });
    expect(
      screen.getByText("No finish on this legend's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("prints the record in full and the event's own facts", () => {
    renderFinishes([finish()]);
    expect(screen.getAllByText("12-1-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-09 · 186 players").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Competitive").length).toBeGreaterThan(0);
  });

  it("opens on the placings the API picked and names the whole record on the toggle", async () => {
    const rows = manyFinishes(9);
    renderFinishes(rows, { best: rows.slice(0, 5) });

    expect(screen.getByRole("button", { name: "All 9" })).toBeInTheDocument();
    expect(screen.getAllByText("Pilot 0").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pilot 6")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All 9" }));
    expect(screen.getAllByText("Pilot 6").length).toBeGreaterThan(0);
  });

  it("switches to the whole record from the footer", async () => {
    renderFinishes(manyFinishes(9));

    await userEvent.click(screen.getByRole("button", { name: "Show all 9 finishes" }));
    expect(screen.getAllByText("Pilot 6").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("asks the page for the next server page rather than slicing what it holds", async () => {
    const onShowMore = renderFinishes(manyFinishes(25), { total: 30 });

    await userEvent.click(screen.getByRole("button", { name: "Show all 30 finishes" }));
    await userEvent.click(screen.getByRole("button", { name: "5 more finishes" }));

    expect(onShowMore).toHaveBeenCalledTimes(1);
  });

  it("counts the rows still to come off the scope's total, not the page it holds", async () => {
    renderFinishes(manyFinishes(25), { total: 26 });

    await userEvent.click(screen.getByRole("button", { name: "All 26" }));
    expect(screen.getByRole("button", { name: "1 more finish" })).toBeInTheDocument();
  });

  it("takes no second click while a page is on the way", async () => {
    const onShowMore = renderFinishes(manyFinishes(25), { total: 30, loadingMore: true });

    await userEvent.click(screen.getByRole("button", { name: "All 30" }));
    await userEvent.click(screen.getByRole("button", { name: "5 more finishes" }));

    expect(onShowMore).not.toHaveBeenCalled();
  });

  it("leads a finish with a list at the archived deck", () => {
    renderFinishes([finish({ shareToken: "tok-1", listStatus: "full" })]);
    expect(screen.getAllByRole("link", { name: "Decklist" }).length).toBeGreaterThan(0);
  });

  it("labels a partial list as partial", () => {
    renderFinishes([finish({ shareToken: "tok-1", listStatus: "partial" })]);
    expect(screen.getAllByRole("link", { name: "Partial" }).length).toBeGreaterThan(0);
  });

  it("offers no submission link to a signed-out reader", () => {
    renderFinishes([finish()]);
    expect(screen.queryByText("+ Add")).not.toBeInTheDocument();
  });

  it("offers a signed-in reader the way to fill a listless finish", () => {
    captured.userId = "user-1";
    renderFinishes([finish()]);
    expect(screen.getAllByRole("link", { name: "+ Add" }).length).toBeGreaterThan(0);
  });

  it("shows no footer when the whole record already fits the best view", () => {
    renderFinishes(manyFinishes(3));
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("leaves the record out for a finish the source published none for", () => {
    renderFinishes([
      finish({ wins: null, losses: null, draws: null, event: { playerCount: null } }),
    ]);
    expect(screen.queryByText("12-1-0")).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-08-09").length).toBeGreaterThan(0);
  });

  it("sends a player the archive has a page for to it", () => {
    renderFinishes([finish({ playerKey: "u4001" })]);

    const links = screen.getAllByRole("link", { name: "P. Lefebvre" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/meta/players/u4001");
    }
  });

  it("prints a player the source filed under no identity as plain text", () => {
    renderFinishes([finish({ playerKey: null })]);

    expect(screen.queryByRole("link", { name: "P. Lefebvre" })).not.toBeInTheDocument();
    expect(screen.getAllByText("P. Lefebvre").length).toBeGreaterThan(0);
  });
});
