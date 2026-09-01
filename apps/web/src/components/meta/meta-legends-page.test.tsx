import type { MetaEventSummary, MetaLegendEventRecord, MetaLegendSummary } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  legends: [] as MetaLegendSummary[],
  events: [] as MetaEventSummary[],
  search: {} as Record<string, unknown>,
  navigated: [] as Record<string, unknown>[],
}));

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
  return {
    getRouteApi: () => ({
      useSearch: () => captured.search,
      useNavigate:
        () =>
        ({ search }: { search: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
          captured.navigated.push(search(captured.search));
        },
    }),
    Link: Anchor,
    createLink: () => Anchor,
  };
});

vi.mock("@/hooks/use-meta", () => ({
  useMetaLegends: () => ({ data: { legends: captured.legends } }),
  useMetaEvents: () => ({ data: { events: captured.events } }),
}));
vi.mock("@/hooks/use-meta-eras", () => ({ useMetaEras: () => [] }));
// Stubbed away: the bar's own controls have their own tests, and this page adds
// nothing inside it.
vi.mock("@/components/meta/meta-scope-bar", () => ({
  MetaScopeBar: () => <div />,
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: { domains: ["fury", "calm"] },
    labels: { domains: { fury: "Fury", calm: "Calm" } },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaLegendsPage } from "./meta-legends-page";

function record(
  eventSlug: string,
  overrides: Partial<MetaLegendEventRecord> = {},
): MetaLegendEventRecord {
  return {
    eventSlug,
    bestRank: 8,
    rankIsTier: false,
    finishes: 1,
    decklists: 0,
    won: false,
    ...overrides,
  };
}

function legend(
  name: string,
  slug: string,
  records: MetaLegendEventRecord[] = [record("summoner-skirmish")],
): MetaLegendSummary {
  return {
    slug,
    legend: { cardId: slug, name, slug, imageId: null, domains: ["fury"], archiveSlug: slug },
    records,
  };
}

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "e1",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish at Cardhouse Vienna",
    eventDate: "2026-08-29",
    format: "constructed",
    tier: "store",
    country: "AT",
    location: "Vienna",
    playerCount: 18,
    organizer: "Cardhouse",
    playerRowCount: 18,
    deckCount: 4,
    winners: [],
    ...overrides,
  };
}

function renderPage(
  legends: MetaLegendSummary[],
  search: Record<string, unknown> = {},
  events: MetaEventSummary[] = [event()],
) {
  captured.legends = legends;
  captured.events = events;
  captured.search = search;
  captured.navigated = [];
  render(<MetaLegendsPage />);
}

/** @returns One legend-page href per row, in the order the list renders them. */
function rowLinks(): (string | null)[] {
  return screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/meta/legends/") === true);
}

describe("MetaLegendsPage", () => {
  beforeEach(() => {
    captured.navigated = [];
  });

  it("files legends under the name a reader sees by default", () => {
    renderPage([
      legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest"),
      legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands"),
    ]);
    expect(rowLinks()).toEqual([
      "/meta/legends/azir-emperor-of-the-sands",
      "/meta/legends/kennen-heart-of-the-tempest",
    ]);
  });

  it("shows each legend's best finish and its on-file counts", () => {
    renderPage(
      [
        legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", [
          record("summoner-skirmish", { bestRank: 2, finishes: 7, decklists: 3 }),
        ]),
      ],
      {},
      [event({ name: "Regional Lyon", playerCount: 512 })],
    );
    const row = screen.getByRole("link", { name: /kennen/iu });
    expect(within(row).getAllByText("Regional Lyon").length).toBeGreaterThan(0);
    expect(within(row).getAllByText("2")).not.toHaveLength(0);
    expect(within(row).getByText("2026-08-29 · 512 players")).toBeInTheDocument();
    expect(within(row).getByText("7")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("chips the events a legend has won", () => {
    renderPage([
      legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", [
        record("summoner-skirmish", { bestRank: 1, won: true }),
      ]),
    ]);
    expect(screen.getAllByText("1 event win").length).toBeGreaterThan(0);
  });

  it("reorders by best finish from the column header", async () => {
    const user = userEvent.setup();
    renderPage([
      legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", [
        record("summoner-skirmish", { bestRank: 5 }),
      ]),
      legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", [
        record("summoner-skirmish", { bestRank: 1, won: true }),
      ]),
    ]);
    await user.click(screen.getByRole("button", { name: "Sort by best finish in this scope" }));
    expect(captured.navigated).toEqual([expect.objectContaining({ by: "best", dir: "asc" })]);
  });

  it("renders the reader's chosen order from the URL", () => {
    renderPage(
      [
        legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", [
          record("summoner-skirmish", { bestRank: 5 }),
        ]),
        legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", [
          record("summoner-skirmish", { bestRank: 1, won: true }),
        ]),
      ],
      { by: "best", dir: "asc" },
    );
    expect(rowLinks()).toEqual([
      "/meta/legends/kennen-heart-of-the-tempest",
      "/meta/legends/azir-emperor-of-the-sands",
    ]);
  });

  it("drops a legend with no finish inside the scope", () => {
    renderPage(
      [
        legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", [
          record("competitive-event"),
        ]),
        legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", [record("store-event")]),
      ],
      { tiers: ["competitive"] },
      [
        event({ id: "e1", slug: "competitive-event", tier: "competitive" }),
        event({ id: "e2", slug: "store-event", tier: "store" }),
      ],
    );
    expect(rowLinks()).toEqual(["/meta/legends/kennen-heart-of-the-tempest"]);
    expect(screen.getByText("1 of 2 legends")).toBeInTheDocument();
  });

  it("narrows to the legends whose name matches the query", () => {
    renderPage(
      [
        legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest"),
        legend("Azir, Emperor of the Sands", "azir-emperor-of-the-sands"),
      ],
      { q: "kennen" },
    );
    expect(screen.getAllByText("Kennen").length).toBeGreaterThan(0);
    expect(screen.queryByText("Azir")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 legends")).toBeInTheDocument();
  });

  it("says so when nothing matches instead of showing an empty table", () => {
    renderPage([legend("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest")], {
      q: "teemo",
    });
    expect(screen.getByText("No legend matches these filters.")).toBeInTheDocument();
  });

  it("explains an archive with no standings yet", () => {
    renderPage([]);
    expect(screen.getByText("No legends on record yet")).toBeInTheDocument();
  });
});
