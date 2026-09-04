import type { AdminMetaEvent } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as adminMeta from "@/hooks/use-admin-meta";

const captured = vi.hoisted(() => ({
  events: [] as unknown[],
  total: 0,
  params: null as unknown,
}));

/**
 * The route's search params, which the page reads its whole filter set from.
 * Interactions go out through `navigate` and only reach the page when they come
 * back around through here, which is the loop the real router closes.
 */
const searchStore = vi.hoisted(() => {
  let value: Record<string, unknown> = {};
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: Record<string, unknown>) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    seed: (next: Record<string, unknown>) => {
      value = next;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children?: ReactNode; params?: Record<string, string> }) => (
    <a href="/admin/meta/candidates" data-params={JSON.stringify(params)}>
      {children}
    </a>
  ),
  useNavigate:
    () => (options: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
      if (options.search) {
        searchStore.set(options.search(searchStore.get()));
      }
    },
  createLink: (component: unknown) => component,
}));

vi.mock("@/routes/_app/_authenticated/admin/meta", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    Route: {
      fullPath: "/admin/meta",
      useSearch: () =>
        useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get),
    },
  };
});

vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/hooks/use-admin-meta", async (importOriginal) => ({
  ...(await importOriginal<typeof adminMeta>()),
  ADMIN_META_EVENT_PAGE_SIZE: 50,
  useAdminMetaEvents: (params: unknown) => {
    captured.params = params;
    return { data: { events: captured.events, total: captured.total, page: 1, limit: 50 } };
  },
  useDeleteMetaEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReclassifyMetaEvents: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventsPage } from "./meta-events-page";

function event(overrides: Partial<AdminMetaEvent> = {}): AdminMetaEvent {
  return {
    id: "event-1",
    slug: "summoner-skirmish-2026",
    name: "Summoner Skirmish 2026",
    eventDate: "2026-08-15",
    format: "standard",
    playerCount: 64,
    organizer: "Piltover Games",
    notes: null,
    tier: "local",
    country: null,
    location: null,
    playerRowCount: 64,
    deckCount: 12,
    sources: [{ id: "src-1", provider: "uvsgames", externalId: "source-1", priority: 0 }],
    ...overrides,
  };
}

describe("MetaEventsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.events = [event()];
    captured.total = 1;
    captured.params = null;
    searchStore.seed({});
  });

  it("names each live row's sources, since the link is the citation now", () => {
    render(<MetaEventsPage />);

    // A badge rather than a link: there is no candidate page to open, and
    // drift lives on the event's own dialog.
    expect(screen.getByText("uvsgames")).toBeInTheDocument();
  });

  it("offers each live row a way out to its public archive page", () => {
    render(<MetaEventsPage />);
    expect(
      screen.getByLabelText("Open Summoner Skirmish 2026 in the public archive"),
    ).toHaveAttribute("href", "/meta/summoner-skirmish-2026");
  });

  it("reads the rows held against the field the source reported", () => {
    captured.events = [event({ playerRowCount: 94, playerCount: 128 })];
    render(<MetaEventsPage />);
    expect(screen.getByText("94").parentElement).toHaveTextContent("94 / 128");
  });

  it("shows the rows alone when no field size was reported", () => {
    captured.events = [event({ playerRowCount: 94, playerCount: null })];
    render(<MetaEventsPage />);
    expect(screen.getByText("94").parentElement).toHaveTextContent(/^94$/u);
  });

  it("lists one chip per feeding source", () => {
    captured.events = [
      event({
        sources: [
          { id: "src-1", provider: "uvsgames", externalId: "source-1", priority: 0 },
          { id: "src-2", provider: "usersubmission", externalId: "source-2", priority: 0 },
        ],
      }),
    ];
    render(<MetaEventsPage />);
    expect(screen.getByText("uvsgames")).toBeInTheDocument();
    expect(screen.getByText("User submission")).toBeInTheDocument();
  });

  it("marks a hand-entered event as having no source at all", () => {
    captured.events = [event({ sources: [] })];
    render(<MetaEventsPage />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("MetaEventsPage filters, as the query they travel to the server in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.events = [event()];
    captured.total = 1;
    captured.params = null;
    searchStore.seed({});
  });

  it("opens on the newest events, unfiltered", () => {
    render(<MetaEventsPage />);
    expect(captured.params).toMatchObject({ page: 1, sort: "eventDate", direction: "desc" });
  });

  it("carries the URL's filters into the query", () => {
    searchStore.seed({
      page: 3,
      q: "skirmish",
      liveFormat: "standard",
      liveSource: "playloltcg",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      noDecks: true,
    });
    render(<MetaEventsPage />);
    expect(captured.params).toMatchObject({
      page: 3,
      search: "skirmish",
      format: "standard",
      source: "playloltcg",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      noDecks: true,
    });
  });

  it("starts a filter change over at the first page", async () => {
    const user = userEvent.setup();
    searchStore.seed({ page: 4 });
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("switch", { name: "No decklists" }));

    expect(searchStore.get()).toMatchObject({ noDecks: true, page: undefined });
  });

  it("leaves an off switch out of the URL rather than spelling it false", async () => {
    const user = userEvent.setup();
    searchStore.seed({ noDecks: true });
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("switch", { name: "No decklists" }));

    expect(searchStore.get().noDecks).toBeUndefined();
  });

  it("reports a header click to the endpoint instead of reordering the page", async () => {
    const user = userEvent.setup();
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("button", { name: "Standings" }));

    expect(searchStore.get()).toMatchObject({ liveSort: "playerRowCount", liveDir: "desc" });
  });

  it("falls back to the default order when the sort is taken off, leaving the URL clean", async () => {
    const user = userEvent.setup();
    searchStore.seed({ liveSort: "name", liveDir: "desc" });
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("button", { name: "Name" }));

    expect(searchStore.get().liveSort).toBeUndefined();
    expect(searchStore.get().liveDir).toBeUndefined();
    expect(captured.params).toMatchObject({ sort: "eventDate", direction: "desc" });
  });

  it("keeps the format filter out of the URL when it is set back to any", async () => {
    const user = userEvent.setup();
    searchStore.seed({ liveFormat: "standard" });
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(await screen.findByRole("option", { name: "Any format" }));

    expect(searchStore.get().liveFormat).toBeUndefined();
  });

  it("narrows to one source and clears the URL when it is set back to any", async () => {
    const user = userEvent.setup();
    render(<MetaEventsPage />);

    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Play LoL TCG" }));
    expect(searchStore.get().liveSource).toBe("playloltcg");

    await user.click(screen.getByRole("combobox", { name: "Source" }));
    await user.click(await screen.findByRole("option", { name: "Any source" }));
    expect(searchStore.get().liveSource).toBeUndefined();
  });
});
