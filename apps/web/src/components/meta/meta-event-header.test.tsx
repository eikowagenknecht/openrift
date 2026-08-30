import type { MetaEventSource } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { metaEvent } from "@/test/meta-event-fixtures";

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

function sourcesText(): string | null {
  return screen.queryByText(/^Sources?:/u)?.textContent ?? null;
}

describe("MetaEventHeader facts", () => {
  it("prints when, where, how big, and who ran it, in that order", () => {
    render(<MetaEventHeader event={metaEvent({ country: "ES", location: "Barcelona" })} />);
    const row = screen.getByText("2026-08-01").parentElement as HTMLElement;
    expect(row.textContent).toBe("2026-08-01·Barcelona·64 players·Organized by LGS Berlin");
  });

  it("leaves out the facts no source published", () => {
    render(<MetaEventHeader event={metaEvent({ playerCount: null, organizer: null })} />);
    expect(screen.queryByText(/players/u)).toBeNull();
    expect(screen.queryByText(/Organized by/u)).toBeNull();
  });

  it("counts a one-player field in the singular", () => {
    render(<MetaEventHeader event={metaEvent({ playerCount: 1 })} />);
    expect(screen.getByText("1 player")).toBeInTheDocument();
  });

  it("flies the flag beside the venue the source named", () => {
    render(<MetaEventHeader event={metaEvent({ country: "ES", location: "Barcelona" })} />);
    expect(screen.getByText("Barcelona")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Spain" })).toBeInTheDocument();
  });

  it("shows the country code when the venue itself is unknown", () => {
    render(<MetaEventHeader event={metaEvent({ country: "ES", location: null })} />);
    expect(screen.getByText("ES")).toBeInTheDocument();
  });

  // The country is guessed from the address, and the guess fails on formats it
  // does not know — the venue must not vanish along with it.
  it("still prints the venue when the country could not be read off the address", () => {
    render(<MetaEventHeader event={metaEvent({ country: null, location: "Fira, Barcelona" })} />);
    expect(screen.getByText("Fira, Barcelona")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows no place at all for an event no source located", () => {
    render(<MetaEventHeader event={metaEvent()} />);
    expect(screen.queryByRole("img")).toBeNull();
    const row = screen.getByText("2026-08-01").parentElement as HTMLElement;
    expect(row.textContent).toBe("2026-08-01·64 players·Organized by LGS Berlin");
  });
});

describe("MetaEventHeader sources", () => {
  it("renders nothing at all when the event has no citations", () => {
    render(<MetaEventHeader event={metaEvent()} />);
    expect(sourcesText()).toBeNull();
  });

  it("links a citation that carries a URL", () => {
    render(<MetaEventHeader event={metaEvent({ sources: [source()] })} />);

    const link = screen.getByRole("link", { name: /uvsgames/u });
    expect(link.getAttribute("href")).toBe("https://example.invalid/uvs");
    // noreferrer implies noopener, so the repo never writes both.
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("prints a hand-entered citation as plain text, not a dead link", () => {
    render(
      <MetaEventHeader
        event={metaEvent({
          sources: [
            source({ provider: null, externalId: null, label: "Twitch VOD", sourceUrl: null }),
          ],
        })}
      />,
    );

    expect(sourcesText()).toContain("Twitch VOD");
    expect(screen.queryByRole("link", { name: /Twitch VOD/u })).toBeNull();
  });

  it("labels a single citation in the singular", () => {
    render(<MetaEventHeader event={metaEvent({ sources: [source()] })} />);
    expect(sourcesText()?.startsWith("Source:")).toBe(true);
  });

  it("lists every citation when several sources fed the event", () => {
    render(
      <MetaEventHeader
        event={metaEvent({
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
        })}
      />,
    );

    const text = sourcesText();
    expect(text?.startsWith("Sources:")).toBe(true);
    // Attribution: none of the three is collapsed behind a "more" toggle.
    expect(text).toContain("uvsgames");
    expect(text).toContain("playriftbound");
    expect(text).toContain("Twitch VOD");
    expect(screen.getAllByRole("link", { name: /uvsgames|playriftbound/u })).toHaveLength(2);
  });
});

describe("MetaEventHeader contributors", () => {
  function line(): string | null {
    return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
  }

  it("renders nothing when nobody is credited", () => {
    render(<MetaEventHeader event={metaEvent({ contributors: [] })} />);
    expect(line()).toBeNull();
  });

  // The truncation rule itself lives with the shared component that owns it —
  // see meta-contributors.test.tsx. These pin the header's wiring: that the
  // line is fed from `contributors`, and that it renders in both regimes.
  it("names the contributors the payload carries", () => {
    render(<MetaEventHeader event={metaEvent({ contributors: ["Alice", "Bob"] })} />);
    expect(line()).toBe("Contributed by Alice and Bob");
  });

  it("collapses a long list rather than printing all of it", () => {
    render(
      <MetaEventHeader
        event={metaEvent({ contributors: ["Alice", "Bob", "Carol", "Dan", "Erin"] })}
      />,
    );
    expect(line()).toBe("Contributed by Alice, Bob, Carol and 2 others");
  });

  it("credits nobody with a profile link", () => {
    render(<MetaEventHeader event={metaEvent({ contributors: ["Alice", "Bob"] })} />);
    expect(screen.queryByRole("link", { name: /Alice|Bob/u })).toBeNull();
  });

  it("shares one attribution line with the citations", () => {
    render(<MetaEventHeader event={metaEvent({ sources: [source()], contributors: ["Alice"] })} />);
    const row = screen.getByText(/^Contributed by/u).parentElement as HTMLElement;
    expect(row.textContent).toBe("Source: uvsgames·Contributed by Alice");
  });
});
