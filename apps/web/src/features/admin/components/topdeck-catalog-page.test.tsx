import type {
  TopdeckCatalogListResponse,
  TopdeckCatalogRow,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TopdeckCatalogParams } from "@/features/admin/hooks/use-admin-topdeck-catalog";

const captured = vi.hoisted(() => ({
  params: null as unknown,
  response: null as unknown,
  accept: vi.fn(),
  dismiss: vi.fn(),
  undismiss: vi.fn(),
}));

/** Stands in for the router: navigate() writes here, useSearch() reads it back. */
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

vi.mock("@tanstack/react-router", async () => {
  const { useSyncExternalStore } = await import("react");
  const navigate =
    () => (options: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
      if (options.search) {
        searchStore.set(options.search(searchStore.get()));
      }
    };
  return {
    Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    useNavigate: navigate,
    getRouteApi: () => ({
      useNavigate: navigate,
      useSearch: () =>
        useSyncExternalStore(searchStore.subscribe, searchStore.get, searchStore.get),
    }),
    // `page-top-bar` builds its back button with createLink at module scope.
    createLink: (component: unknown) => component,
  };
});

vi.mock("@/features/admin/components/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/features/admin/hooks/use-admin-topdeck-catalog", () => ({
  TOPDECK_CATALOG_PAGE_SIZE: 50,
  useAdminTopdeckCatalog: (params: TopdeckCatalogParams) => {
    captured.params = params;
    return { data: captured.response };
  },
  useAcceptTopdeckEvent: () => ({ mutate: captured.accept, isPending: false }),
  useDismissTopdeckEvent: () => ({
    mutate: captured.dismiss,
    mutateAsync: captured.dismiss,
    isPending: false,
  }),
  useUndismissTopdeckEvent: () => ({ mutate: captured.undismiss, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { TopdeckCatalogPage } from "./topdeck-catalog-page";

function makeRow(overrides: Partial<TopdeckCatalogRow> = {}): TopdeckCatalogRow {
  return {
    tid: "summoner-skirmish-2026",
    name: "Summoner Skirmish 2026",
    format: "Constructed",
    city: "Kissimmee",
    country: "US",
    playerCount: 32,
    topCut: 8,
    isTeamEvent: false,
    startAt: "2026-08-15T18:00:00.000Z",
    triage: "new",
    metaEventId: null,
    metaEventSlug: null,
    fetchedAt: null,
    missingSince: null,
    stagedPlayerCount: 0,
    stagedLegendCount: 0,
    stagedDeckCount: 0,
    rivalProvider: null,
    sourceUrl: "https://topdeck.gg/event/summoner-skirmish-2026",
    ...overrides,
  };
}

function setResponse(
  rows: TopdeckCatalogRow[],
  overrides: Partial<TopdeckCatalogListResponse> = {},
) {
  captured.response = {
    rows,
    total: rows.length,
    page: 1,
    limit: 50,
    counts: { new: 7, accepted: 2, dismissed: 1 },
    ...overrides,
  } satisfies TopdeckCatalogListResponse;
}

function rowActions(name: string) {
  return within(screen.getByRole("row", { name: new RegExp(name, "u") }));
}

describe("TopdeckCatalogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.params = null;
    searchStore.seed({});
    setResponse([makeRow()]);
  });

  it("asks for the untriaged rows first, since that is the queue being worked", () => {
    render(<TopdeckCatalogPage />);
    expect(captured.params).toMatchObject({ page: 1, triage: "new" });
  });

  it("shows what the source published about an event", () => {
    render(<TopdeckCatalogPage />);
    expect(screen.getByText("Summoner Skirmish 2026")).toBeInTheDocument();
    expect(screen.getByText("Kissimmee, US")).toBeInTheDocument();
    expect(screen.getByText("Constructed")).toBeInTheDocument();
    expect(screen.getByText("Top 8")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("links the event's name at the source's own page", () => {
    render(<TopdeckCatalogPage />);
    expect(screen.getByRole("link", { name: "Summoner Skirmish 2026" })).toHaveAttribute(
      "href",
      "https://topdeck.gg/event/summoner-skirmish-2026",
    );
  });

  it("marks a team event, whose flat field is not a list of individual results", () => {
    setResponse([makeRow({ isTeamEvent: true })]);
    render(<TopdeckCatalogPage />);
    expect(screen.getByText("Teams")).toBeInTheDocument();
  });

  it("flags a row the source stopped listing", () => {
    setResponse([makeRow({ missingSince: "2026-09-01T00:00:00.000Z" })]);
    render(<TopdeckCatalogPage />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("says when an accepted row is cited without being read, and which source won", () => {
    setResponse([
      makeRow({ triage: "accepted", metaEventId: "live-1", rivalProvider: "uvsgames" }),
    ]);
    render(<TopdeckCatalogPage />);
    expect(screen.getByText(/Cited only, UVS Games wins/u)).toBeInTheDocument();
  });

  it("says nothing about a rival for the ordinary single-source row", () => {
    setResponse([makeRow({ triage: "accepted", metaEventId: "live-1" })]);
    render(<TopdeckCatalogPage />);
    expect(screen.queryByText(/Cited only/u)).not.toBeInTheDocument();
  });

  it("offers no results fetch, since a catalogued row already has its standings", () => {
    setResponse([makeRow({ triage: "accepted", metaEventId: "live-1" })]);
    render(<TopdeckCatalogPage />);
    expect(screen.queryByRole("button", { name: /Fetch/u })).not.toBeInTheDocument();
    expect(rowActions("Summoner Skirmish").getByText("Standings")).toBeInTheDocument();
  });

  it("accepts a row by its source key", async () => {
    render(<TopdeckCatalogPage />);
    await userEvent.click(rowActions("Summoner Skirmish").getByRole("button", { name: "Accept" }));
    expect(captured.accept).toHaveBeenCalledWith({ tid: "summoner-skirmish-2026" });
  });

  it("offers an undismiss, and nothing else, for a dismissed row", () => {
    setResponse([makeRow({ triage: "dismissed" })]);
    render(<TopdeckCatalogPage />);
    const actions = rowActions("Summoner Skirmish");
    expect(actions.getByRole("button", { name: "Undismiss" })).toBeInTheDocument();
    expect(actions.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("carries the source's own format word into the query when one is filtered on", () => {
    searchStore.seed({ tdFormat: "Sealed" });
    render(<TopdeckCatalogPage />);
    expect(captured.params).toMatchObject({ format: "Sealed" });
  });

  it("drops the format filter when the reader clears it", async () => {
    searchStore.seed({ tdFormat: "Sealed" });
    render(<TopdeckCatalogPage />);
    await userEvent.click(screen.getByRole("combobox", { name: "Source format" }));
    await userEvent.click(screen.getByRole("option", { name: "Any format" }));
    expect(captured.params).toMatchObject({ format: undefined });
  });

  it("says how many events match", () => {
    setResponse([makeRow(), makeRow({ tid: "other", name: "Rift Open" })]);
    render(<TopdeckCatalogPage />);
    expect(screen.getByText("2 matching events.")).toBeInTheDocument();
  });
});
