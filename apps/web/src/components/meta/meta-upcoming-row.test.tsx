import type { MetaEventSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { slug?: string };
  }) => (
    <a {...rest} href={(to ?? "/").replace("$slug", params?.slug ?? "")}>
      {children}
    </a>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaUpcomingRow } from "./meta-upcoming-row";

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "evt-1",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-09-19",
    format: "constructed",
    tier: "premier",
    country: "DE",
    location: "Rift Games, Berlin",
    playerCount: 1234,
    organizer: "Rift Games Berlin",
    playerRowCount: 0,
    deckCount: 0,
    topFinishes: [],
    ...overrides,
  };
}

describe("MetaUpcomingRow", () => {
  it("names the event and links it at its own page", () => {
    render(<MetaUpcomingRow event={event()} />);

    expect(screen.getByRole("link", { name: /Summoner Skirmish/u })).toHaveAttribute(
      "href",
      "/meta/summoner-skirmish",
    );
  });

  it("prints the date, the tier and how many players are registered", () => {
    render(<MetaUpcomingRow event={event()} />);

    expect(screen.getByText("SEP")).toBeInTheDocument();
    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("Premier")).toBeInTheDocument();
    expect(screen.getByText("1,234 registered")).toBeInTheDocument();
  });

  it("says nothing about registration when no source published a field size", () => {
    render(<MetaUpcomingRow event={event({ playerCount: null })} />);

    expect(screen.queryByText(/registered/u)).not.toBeInTheDocument();
    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
  });
});
