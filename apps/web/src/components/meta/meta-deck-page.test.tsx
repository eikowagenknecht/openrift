import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  meta: null as {
    listStatus: string;
    contributors: string[];
  } | null,
}));

// The surface itself is the public share renderer; these tests are about what
// the archive hands it, so it renders only the slot under test.
vi.mock("@/components/deck/public-deck-surface", () => ({
  PublicDeckSurface: ({ notice }: { notice?: React.ReactNode }) => <div>{notice}</div>,
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaDeck: () => ({
    data: {
      deck: { format: "freeform", name: "Azir Control", formatConfig: null, links: [] },
      cards: [],
      meta: {
        event: { slug: "summoner-skirmish", name: "Summoner Skirmish", eventDate: "2026-08-01" },
        playerName: "Nova",
        finishTier: 1,
        record: "5-1",
        ...captured.meta,
      },
    },
  }),
}));

vi.mock("@/hooks/use-decks", () => ({ useCloneSharedDeck: () => ({ isPending: false }) }));
vi.mock("@/lib/auth-session", () => ({ useUserId: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/meta">{children}</a>,
  useNavigate: () => vi.fn(),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaDeckPage } from "./meta-deck-page";

/** Renders the page for one archived deck's contributors and list status. */
function renderDeck(meta: { listStatus?: string; contributors?: string[] } = {}): void {
  captured.meta = { listStatus: "full", contributors: [], ...meta };
  render(<MetaDeckPage token="aB3dE5gH7jK9" />);
}

/** @returns The contributor line's text, or null when there is none. */
function line(): string | null {
  return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
}

describe("MetaDeckPage contributors", () => {
  beforeEach(() => {
    captured.meta = null;
  });

  it("renders nothing when nobody is credited", () => {
    renderDeck();
    expect(line()).toBeNull();
  });

  it("names a single contributor", () => {
    renderDeck({ contributors: ["Alice"] });
    expect(line()).toBe("Contributed by Alice");
  });

  it("names several", () => {
    renderDeck({ contributors: ["Alice", "Bob", "Carol"] });
    expect(line()).toBe("Contributed by Alice, Bob and Carol");
  });

  it("collapses past the threshold, exactly as the event page does", () => {
    renderDeck({ contributors: ["Alice", "Bob", "Carol", "Dan", "Erin"] });
    expect(line()).toBe("Contributed by Alice, Bob, Carol and 2 others");
  });

  it("credits nobody with a profile link", () => {
    renderDeck({ contributors: ["Alice", "Bob"] });
    expect(screen.queryByRole("link", { name: /Alice|Bob/u })).toBeNull();
  });

  it("sits alongside the incomplete-list callout rather than replacing it", () => {
    renderDeck({ listStatus: "partial", contributors: ["Alice"] });
    expect(screen.getByText("This list is incomplete")).toBeDefined();
    expect(line()).toBe("Contributed by Alice");
  });

  it("leaves the slot empty when there is neither a callout nor a credit", () => {
    renderDeck();
    expect(screen.queryByText("This list is incomplete")).toBeNull();
    expect(line()).toBeNull();
  });
});
