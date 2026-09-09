import type { MetaEventSource } from "@openrift/shared/types/api/meta";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { metaEvent, metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "freeform", label: "Freeform" }],
    labels: { freeform: "Freeform" },
  }),
  useEnumOrders: () => ({
    orders: { domains: ["fury"] },
    labels: { domains: { fury: "Fury" } },
  }),
}));

vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));

const { MetaEventHeader } = await import("./meta-event-header");

function source(overrides: Partial<MetaEventSource> = {}): MetaEventSource {
  return {
    id: "src-1",
    provider: "uvsgames",
    externalId: "evt-1",
    label: "uvsgames",
    sourceUrl: "https://example.invalid/uvs",
    ...overrides,
  };
}

const swiss = metaPhase({
  phaseOrder: 1,
  name: "Phase 1",
  roundType: "SWISS",
  roundCount: 6,
  rankRequired: null,
});

function renderHeader({
  event = metaEvent(),
  players = [],
  matches = [],
  phases = [],
}: {
  event?: ReturnType<typeof metaEvent>;
  players?: ReturnType<typeof metaPlayer>[];
  matches?: ReturnType<typeof metaMatch>[];
  phases?: ReturnType<typeof metaPhase>[];
} = {}) {
  return render(
    <MetaEventHeader
      event={event}
      players={players}
      matches={matches}
      phases={phases}
      slug="summoner-skirmish"
    />,
  );
}

function sourcesText(): string | null {
  return screen.queryByText(/^Sources?:/u)?.textContent ?? null;
}

function cardArt(container: HTMLElement): string[] {
  return [...container.querySelectorAll("img")]
    .map((img) => img.getAttribute("src") ?? "")
    .filter((src) => src.startsWith("/media/cards/"));
}

function counterValue(label: string): string {
  const counter = screen.getByText(label).parentElement as HTMLElement;
  return counter.firstChild?.textContent ?? "";
}

describe("MetaEventHeader facts", () => {
  it("leads with the date as a calendar leaf", () => {
    renderHeader();
    expect(screen.getByText("AUG")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("flies the flag beside the venue the source named", () => {
    renderHeader({ event: metaEvent({ country: "ES", location: "Barcelona" }) });
    expect(screen.getByText("Barcelona")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spain" })).toBeInTheDocument();
  });

  it("shows the country code when the venue itself is unknown", () => {
    renderHeader({ event: metaEvent({ country: "ES", location: null }) });
    expect(screen.getByText("ES")).toBeInTheDocument();
  });

  it("still prints the venue when the country could not be read off the address", () => {
    renderHeader({ event: metaEvent({ country: null, location: "Fira, Barcelona" }) });
    expect(screen.getByText("Fira, Barcelona")).toBeInTheDocument();
  });

  it("bylines the organizer, the format and how the event was run", () => {
    renderHeader({ phases: [swiss, metaPhase()] });
    expect(
      screen.getByText(
        "Organized by LGS Berlin · Freeform · 6 Swiss rounds, best of 3, then a top 8 cut",
      ),
    ).toBeInTheDocument();
  });

  it("drops the organizer from the byline when no source named one", () => {
    renderHeader({ event: metaEvent({ organizer: null }) });
    expect(screen.getByText("Freeform")).toBeInTheDocument();
  });
});

describe("MetaEventHeader counters", () => {
  it("counts the field, the archived rows and the lists on file", () => {
    renderHeader({ event: metaEvent({ playerRowCount: 32, deckCount: 7 }) });
    expect(counterValue("players in the field")).toBe("64");
    expect(counterValue("results archived")).toBe("32");
    expect(counterValue("decklists on file")).toBe("7");
  });

  it("leaves out the field size no source published", () => {
    renderHeader({ event: metaEvent({ playerCount: null }) });
    expect(screen.queryByText("players in the field")).toBeNull();
  });

  it("counts the record of the last standing that made the cut", () => {
    renderHeader({
      players: [
        metaPlayer({ id: "p-1", rank: 1, wins: 13, losses: 0, draws: 1 }),
        metaPlayer({ id: "p-8", rank: 8, wins: 11, losses: 2, draws: 1 }),
      ],
      phases: [swiss, metaPhase()],
    });
    expect(counterValue("record at the cut line")).toBe("11-2-1");
  });

  it("leaves out the cut line for an event that ran no cut", () => {
    renderHeader({
      players: [metaPlayer({ id: "p-8", rank: 8, wins: 11, losses: 2, draws: 1 })],
      phases: [swiss],
    });
    expect(screen.queryByText("record at the cut line")).toBeNull();
  });

  it("leaves out the cut line when the standings bucket the last cut place", () => {
    renderHeader({
      players: [metaPlayer({ id: "p-8", rank: 8, rankIsTier: true, wins: 11, losses: 2 })],
      phases: [swiss, metaPhase()],
    });
    expect(screen.queryByText("record at the cut line")).toBeNull();
  });

  it("counts nothing against the cut", () => {
    renderHeader({
      players: [metaPlayer({ id: "p-1", rank: 1, shareToken: "tok-1" })],
      phases: [swiss, metaPhase()],
    });
    expect(screen.queryByText(/with lists/u)).toBeNull();
  });
});

describe("MetaEventHeader champion plate", () => {
  const winner = metaPlayer({
    playerName: "Ana",
    rank: 1,
    wins: 6,
    losses: 1,
    draws: 0,
    legend: {
      cardId: "card-yasuo",
      name: "Yasuo, the Unforgiven",
      slug: "yasuo-the-unforgiven",
      imageId: "img-yasuo",
      domains: ["fury"],
      archiveSlug: "yasuo-yasuo-the-unforgiven",
    },
  });

  it("names the winner, their legend and their record", () => {
    renderHeader({ players: [winner] });
    expect(screen.getByText("Champion")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yasuo" })).toBeInTheDocument();
    expect(screen.getByText("the Unforgiven")).toBeInTheDocument();
    expect(screen.getByText("6-1-0")).toBeInTheDocument();
  });

  it("leaves out a record the source never published", () => {
    renderHeader({ players: [metaPlayer({ rank: 1, wins: null, losses: null })] });
    expect(screen.queryByText(/^\d+-\d+-\d+$/u)).toBeNull();
  });

  it("sends the champion to their player page", () => {
    renderHeader({ players: [winner] });
    expect(screen.getByRole("link", { name: "Ana" })).toHaveAttribute(
      "href",
      "/meta/players/u1001",
    );
  });

  it("leads the champion to their run through the event", () => {
    renderHeader({
      players: [winner],
      matches: [metaMatch({ player1Id: "p-1", player2Id: "p-2" })],
    });

    const link = screen.getByRole("link", { name: /Road to the title/u });
    expect(link).toHaveAttribute("href", "/meta/summoner-skirmish/players/u1001");
  });

  it("offers no run for a champion whose event filed no round-by-round results", () => {
    renderHeader({ players: [winner] });
    expect(screen.queryByRole("link", { name: /Road to the title/u })).toBeNull();
  });

  it("offers no run for a champion the source filed under no identity", () => {
    renderHeader({
      players: [metaPlayer({ id: "p-1", rank: 1, playerKey: null })],
      matches: [metaMatch({ player1Id: "p-1", player2Id: "p-2" })],
    });
    expect(screen.queryByRole("link", { name: /Road to the title/u })).toBeNull();
  });

  it("prints a champion the source filed under no identity as plain text", () => {
    renderHeader({ players: [metaPlayer({ playerName: "Ana", rank: 1, playerKey: null })] });
    expect(screen.queryByRole("link", { name: "Ana" })).toBeNull();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("stands the winner's legend card beside the plate and blurs it behind the band", () => {
    const { container } = renderHeader({ players: [winner] });
    expect(cardArt(container)).toEqual([
      "/media/cards/uo/img-yasuo-400w.webp",
      "/media/cards/uo/img-yasuo-240w.webp",
    ]);
  });

  it("paints no art for a winner whose legend has no image", () => {
    const { container } = renderHeader({ players: [metaPlayer({ rank: 1 })] });
    expect(cardArt(container)).toEqual([]);
  });

  it("shows no plate at all for an event whose standings nobody has archived", () => {
    renderHeader({ players: [metaPlayer({ rank: 4 })] });
    expect(screen.queryByText("Champion")).toBeNull();
  });
});

describe("MetaEventHeader attribution", () => {
  it("renders nothing at all when the event has no citations", () => {
    renderHeader();
    expect(sourcesText()).toBeNull();
  });

  it("links a citation that carries a URL", () => {
    renderHeader({ event: metaEvent({ sources: [source()] }) });

    const link = screen.getByRole("link", { name: /uvsgames/u });
    expect(link.getAttribute("href")).toBe("https://example.invalid/uvs");
    // noreferrer implies noopener, so the repo never writes both.
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("prints a hand-entered citation as plain text, not a dead link", () => {
    renderHeader({
      event: metaEvent({
        sources: [
          source({ provider: null, externalId: null, label: "Twitch VOD", sourceUrl: null }),
        ],
      }),
    });

    expect(sourcesText()).toContain("Twitch VOD");
    expect(screen.queryByRole("link", { name: /Twitch VOD/u })).toBeNull();
  });

  it("labels a single citation in the singular", () => {
    renderHeader({ event: metaEvent({ sources: [source()] }) });
    expect(sourcesText()?.startsWith("Source:")).toBe(true);
  });

  it("lists every citation when several sources fed the event", () => {
    renderHeader({
      event: metaEvent({
        sources: [
          source(),
          source({ id: "src-2", provider: "playriftbound", label: "playriftbound" }),
          source({
            id: "src-3",
            provider: null,
            externalId: null,
            label: "Twitch VOD",
            sourceUrl: null,
          }),
        ],
      }),
    });

    const text = sourcesText();
    expect(text?.startsWith("Sources:")).toBe(true);
    expect(text).toContain("uvsgames");
    expect(text).toContain("playriftbound");
    expect(text).toContain("Twitch VOD");
    expect(screen.getAllByRole("link", { name: /uvsgames|playriftbound/u })).toHaveLength(2);
  });

  it("credits the contributors the payload carries", () => {
    renderHeader({ event: metaEvent({ sources: [source()], contributors: ["Alice", "Bob"] }) });
    expect(screen.getByText("Contributed by Alice and Bob")).toBeInTheDocument();
  });

  it("renders no credit line when nobody is named", () => {
    renderHeader({ event: metaEvent({ contributors: [] }) });
    expect(screen.queryByText(/^Contributed by/u)).toBeNull();
  });
});

describe("a running event", () => {
  it("wears an in-progress badge and says how far the rounds have got", () => {
    renderHeader({
      event: metaEvent({ status: "in_progress", sourceCheckedAt: null }),
      matches: [metaMatch({ phaseOrder: 1, roundNumber: 4 })],
      phases: [swiss],
    });

    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("After round 4 of 6")).toBeInTheDocument();
  });

  it("says when the source was last read", () => {
    const checked = new Date(Date.now() - 12 * 60 * 1000).toISOString();
    renderHeader({ event: metaEvent({ status: "in_progress", sourceCheckedAt: checked }) });

    expect(screen.getByText("Round 1 under way · checked 12m ago")).toBeInTheDocument();
  });

  it("wears no badge once the event is complete", () => {
    renderHeader({ event: metaEvent({ status: "complete" }) });

    expect(screen.queryByText("In progress")).toBeNull();
  });
});
