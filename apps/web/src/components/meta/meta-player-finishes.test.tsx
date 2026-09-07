import type { MetaPlayerFinish } from "@openrift/shared/types/api/meta";
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

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["calm"] },
    labels: { domains: { calm: "Calm" } },
  }),
}));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => captured.userId }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { makeMetaPlayerFinish, resetIdCounter } from "@/test/factories";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerFinishes } from "./meta-player-finishes";

function finish(overrides: Parameters<typeof makeMetaPlayerFinish>[0] = {}): MetaPlayerFinish {
  return makeMetaPlayerFinish({
    rank: 1,
    wins: 12,
    losses: 1,
    draws: 0,
    ...overrides,
    event: {
      slug: "city-challenge-lyon",
      name: "City Challenge Lyon",
      eventDate: "2026-08-09",
      tier: "competitive",
      country: "FR",
      playerCount: 186,
      ...overrides.event,
    },
  });
}

function manyFinishes(count: number): MetaPlayerFinish[] {
  return Array.from({ length: count }, (_, index) =>
    finish({
      rank: index + 1,
      event: { name: `Event ${String(index)}`, eventDate: `2026-08-${String(index + 10)}` },
    }),
  );
}

beforeEach(() => {
  captured.userId = null;
  resetIdCounter();
});

describe("MetaPlayerFinishes", () => {
  it("says nothing has been archived rather than showing an empty table", () => {
    render(<MetaPlayerFinishes finishes={[]} playerName="Renata" />);
    expect(
      screen.getByText("No archived event has this player on its standings yet."),
    ).toBeInTheDocument();
  });

  it("blames the scope when the reader narrowed the record away", () => {
    render(<MetaPlayerFinishes finishes={[]} playerName="Renata" narrowed />);
    expect(
      screen.getByText("No finish on this player's record falls in this scope."),
    ).toBeInTheDocument();
  });

  it("prints the record in full and the event's own facts", () => {
    render(<MetaPlayerFinishes finishes={[finish()]} playerName="Renata" />);
    expect(screen.getAllByText("12-1-0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-09 · 186 players").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Competitive").length).toBeGreaterThan(0);
  });

  it("names the legend the entry was played on and links its archive page", () => {
    render(<MetaPlayerFinishes finishes={[finish()]} playerName="Renata" />);

    const links = screen.getAllByRole("link", { name: "Lux" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/meta/legends/lux-lady-of-luminosity");
    }
  });

  it("says so for an entry whose legend no source published", () => {
    render(<MetaPlayerFinishes finishes={[finish({ legend: null })]} playerName="Renata" />);
    expect(screen.getAllByText("No legend on file").length).toBeGreaterThan(0);
  });

  it("opens on the best placings and names the whole record on the toggle", async () => {
    render(<MetaPlayerFinishes finishes={manyFinishes(9)} playerName="Renata" />);

    expect(screen.getByRole("button", { name: "All 9" })).toBeInTheDocument();
    expect(screen.getAllByText("Event 0").length).toBeGreaterThan(0);
    expect(screen.queryByText("Event 6")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All 9" }));
    expect(screen.getAllByText("Event 6").length).toBeGreaterThan(0);
  });

  it("switches to the whole record from the footer", async () => {
    render(<MetaPlayerFinishes finishes={manyFinishes(9)} playerName="Renata" />);

    await userEvent.click(screen.getByRole("button", { name: "Show all 9 finishes" }));
    expect(screen.getAllByText("Event 6").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("grows the whole record a page at a time", async () => {
    render(<MetaPlayerFinishes finishes={manyFinishes(30)} playerName="Renata" />);

    await userEvent.click(screen.getByRole("button", { name: "All 30" }));
    expect(screen.getByRole("button", { name: "5 more finishes" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "5 more finishes" }));
    expect(screen.queryByRole("button", { name: /more finishes/u })).not.toBeInTheDocument();
  });

  it("leads a finish with a list at the archived deck", () => {
    render(
      <MetaPlayerFinishes
        finishes={[finish({ shareToken: "tok-1", listStatus: "full" })]}
        playerName="Renata"
      />,
    );
    expect(screen.getAllByRole("link", { name: "Decklist" }).length).toBeGreaterThan(0);
  });

  it("labels a partial list as partial", () => {
    render(
      <MetaPlayerFinishes
        finishes={[finish({ shareToken: "tok-1", listStatus: "partial" })]}
        playerName="Renata"
      />,
    );
    expect(screen.getAllByRole("link", { name: "Partial" }).length).toBeGreaterThan(0);
  });

  it("offers no submission link to a signed-out reader", () => {
    render(<MetaPlayerFinishes finishes={[finish()]} playerName="Renata" />);
    expect(screen.queryByText("+ Add")).not.toBeInTheDocument();
  });

  it("offers a signed-in reader the way to fill a listless finish", () => {
    captured.userId = "user-1";
    render(<MetaPlayerFinishes finishes={[finish()]} playerName="Renata" />);
    expect(screen.getAllByRole("link", { name: "+ Add" }).length).toBeGreaterThan(0);
  });

  it("shows no footer when the whole record already fits the best view", () => {
    render(<MetaPlayerFinishes finishes={manyFinishes(3)} playerName="Renata" />);
    expect(screen.queryByRole("button", { name: /Show all/u })).not.toBeInTheDocument();
  });

  it("leaves the record out for a finish the source published none for", () => {
    render(
      <MetaPlayerFinishes
        finishes={[finish({ wins: null, losses: null, draws: null, event: { playerCount: null } })]}
        playerName="Renata"
      />,
    );
    expect(screen.queryByText("12-1-0")).not.toBeInTheDocument();
    expect(screen.getAllByText("2026-08-09").length).toBeGreaterThan(0);
  });

  it("shows no percentage, share or rate anywhere", () => {
    const { container } = render(
      <MetaPlayerFinishes finishes={manyFinishes(4)} playerName="Renata" />,
    );
    expect(container.textContent).not.toMatch(/%|\brate\b|\bshare\b/iu);
  });
});
