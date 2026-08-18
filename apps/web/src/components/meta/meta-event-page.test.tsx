import type { MetaEventDetail, MetaEventSource } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  event: null as MetaEventDetail | null,
  userId: null as string | null,
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvent: () => ({ data: { event: captured.event, decks: [] } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({ labels: { freeform: "Freeform" } }),
}));

// The page's chrome and its deck rows pull the router and the catalog; neither
// is what these tests are about.
vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarBack: () => null,
  PageTopBarSticky: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => captured.userId,
}));

vi.mock("@/components/meta/meta-deck-row", () => ({ MetaDeckRow: () => null }));
vi.mock("@/components/markdown-text", () => ({ MarkdownText: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { slug?: string };
  }) => <a href={(to ?? "/meta/decks").replace("$slug", params?.slug ?? "")}>{children}</a>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventPage } from "./meta-event-page";

/** @returns One citation, a provider row with a URL unless overridden. */
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

/** Renders the page for one event's sources and contributors. */
function renderEvent(overrides: Partial<MetaEventDetail> = {}): void {
  captured.event = {
    id: "evt",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "freeform",
    playerCount: 64,
    organizer: "LGS Berlin",
    deckCount: 0,
    notes: null,
    sources: [],
    contributors: [],
    ...overrides,
  };
  render(<MetaEventPage slug="summoner-skirmish" />);
}

/** @returns The citation paragraph's full text, or null when there is none. */
function sourcesText(): string | null {
  return screen.queryByText(/^Sources?:/u)?.textContent ?? null;
}

describe("MetaEventPage sources", () => {
  beforeEach(() => {
    captured.event = null;
    captured.userId = null;
  });

  it("renders nothing at all when the event has no citations", () => {
    renderEvent();
    expect(sourcesText()).toBeNull();
  });

  it("links a citation that carries a URL", () => {
    renderEvent({ sources: [source()] });

    const link = screen.getByRole("link", { name: /uvsgames/u });
    expect(link.getAttribute("href")).toBe("https://example.invalid/uvs");
    // noreferrer implies noopener, so the repo never writes both.
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("prints a hand-entered citation as plain text, not a dead link", () => {
    renderEvent({
      sources: [source({ provider: null, externalId: null, label: "Twitch VOD", sourceUrl: null })],
    });

    expect(sourcesText()).toContain("Twitch VOD");
    expect(screen.queryByRole("link", { name: /Twitch VOD/u })).toBeNull();
  });

  it("labels a single citation in the singular", () => {
    renderEvent({ sources: [source()] });
    expect(sourcesText()?.startsWith("Source:")).toBe(true);
  });

  it("lists every citation when several sources fed the event", () => {
    renderEvent({
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
    });

    const text = sourcesText();
    expect(text?.startsWith("Sources:")).toBe(true);
    // Attribution: none of the three is collapsed behind a "more" toggle.
    expect(text).toContain("uvsgames");
    expect(text).toContain("playriftbound");
    expect(text).toContain("Twitch VOD");
    expect(screen.getAllByRole("link", { name: /uvsgames|playriftbound/u })).toHaveLength(2);
  });
});

describe("MetaEventPage contributors", () => {
  beforeEach(() => {
    captured.event = null;
    captured.userId = null;
  });

  /** @returns The contributor line's text, or null when there is none. */
  function line(): string | null {
    return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
  }

  it("renders nothing when nobody is credited", () => {
    renderEvent({ contributors: [] });
    expect(line()).toBeNull();
  });

  // The truncation rule itself lives with the shared component that owns it —
  // see meta-contributors.test.tsx. These two pin the page's wiring: that the
  // line is fed from `contributors`, and that it renders in both regimes.
  it("names the contributors the payload carries", () => {
    renderEvent({ contributors: ["Alice", "Bob"] });
    expect(line()).toBe("Contributed by Alice and Bob");
  });

  it("collapses a long list rather than printing all of it", () => {
    renderEvent({ contributors: ["Alice", "Bob", "Carol", "Dan", "Erin"] });
    expect(line()).toBe("Contributed by Alice, Bob, Carol and 2 others");
  });

  it("credits nobody with a profile link", () => {
    renderEvent({ contributors: ["Alice", "Bob"] });
    expect(screen.queryByRole("link", { name: /Alice|Bob/u })).toBeNull();
  });
});

describe("MetaEventPage add-a-decklist", () => {
  beforeEach(() => {
    captured.event = null;
    captured.userId = null;
  });

  it("offers a signed-in reader the submission form for this event", () => {
    captured.userId = "user-1";
    renderEvent();

    const cta = screen.getByRole("link", { name: /Add a decklist/u });
    expect(cta.getAttribute("href")).toBe("/meta/summoner-skirmish/submit");
  });

  it("tells a logged-out reader that signing in is what stands in the way", () => {
    renderEvent();

    // Not a bare CTA that dead-ends at a login screen with no reason given.
    expect(screen.queryByRole("link", { name: /Add a decklist/u })).toBeNull();
    expect(screen.getByText(/Know a list from this event\?/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in to send it/u })).toBeInTheDocument();
  });

  it("offers the form even on an event with no decks yet", () => {
    captured.userId = "user-1";
    renderEvent({ deckCount: 0 });

    expect(screen.getByRole("link", { name: /Add a decklist/u })).toBeInTheDocument();
    expect(screen.getByText(/haven|t archived any decks/u)).toBeInTheDocument();
  });
});
