import type { MetaEventSource } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { metaEvent, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

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

/** A provider citation with a URL unless overridden. */
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
  phases = [],
}: {
  event?: ReturnType<typeof metaEvent>;
  players?: ReturnType<typeof metaPlayer>[];
  phases?: ReturnType<typeof metaPhase>[];
} = {}) {
  return render(<MetaEventHeader event={event} players={players} phases={phases} />);
}

function sourcesText(): string | null {
  return screen.queryByText(/^Sources?:/u)?.textContent ?? null;
}

/** The card artwork on the band, which the domain runes and the flag are not. */
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

  // The country is guessed from the address, and the guess fails on formats it
  // does not know — the venue must not vanish along with it.
  it("still prints the venue when the country could not be read off the address", () => {
    renderHeader({ event: metaEvent({ country: null, location: "Fira, Barcelona" }) });
    expect(screen.getByText("Fira, Barcelona")).toBeInTheDocument();
  });

  it("bylines the organizer, the format and how the event was run", () => {
    renderHeader({ phases: [swiss, metaPhase()] });
    expect(
      screen.getByText("Organized by LGS Berlin · Freeform · 6 Swiss rounds, then a top 8 cut"),
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
