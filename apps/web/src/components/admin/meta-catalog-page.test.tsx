import type {
  MetaCatalogListResponse,
  MetaCatalogRow,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaCatalogQueryParams } from "@/hooks/use-admin-meta-catalog";

const captured = vi.hoisted(() => ({
  params: null as unknown,
  response: null as unknown,
  settings: null as unknown,
  accept: vi.fn(),
  dismiss: vi.fn(),
  undismiss: vi.fn(),
  fetchEvent: vi.fn(),
  runSync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: captured.toastSuccess, error: captured.toastError },
}));

/**
 * The route's search params, which the page now reads its whole filter set
 * from. Interactions go out through `navigate` and only reach the page when
 * they come back around through here, which is the loop the real router closes.
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
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate:
    () => (options: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
      if (options.search) {
        searchStore.set(options.search(searchStore.get()));
      }
    },
  // `page-top-bar` builds its back button with createLink at module scope.
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

vi.mock("@/hooks/use-admin-meta-catalog", () => ({
  META_CATALOG_PAGE_SIZE: 50,
  useAdminMetaCatalog: (params: MetaCatalogQueryParams) => {
    captured.params = params;
    return { data: captured.response };
  },
  useAcceptCatalogEvent: () => ({ mutateAsync: captured.accept, isPending: false }),
  useDismissCatalogEvent: () => ({ mutateAsync: captured.dismiss, isPending: false }),
  useUndismissCatalogEvent: () => ({ mutate: captured.undismiss, isPending: false }),
  useFetchCatalogEvent: () => ({ mutateAsync: captured.fetchEvent, isPending: false }),
  useRunMetaSync: () => ({ mutateAsync: captured.runSync, isPending: false }),
  useMetaSyncSettings: () => ({ data: captured.settings }),
  useUpdateMetaSyncSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useMetaSourceTemplates: () => ({ data: { templates: [] } }),
  useMetaSourceFormats: () => ({ data: { formats: [] } }),
  useUpdateMetaSourceTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMetaSourceFormat: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaCatalogPage } from "./meta-catalog-page";

function makeRow(overrides: Partial<MetaCatalogRow> = {}): MetaCatalogRow {
  return {
    externalId: "evt-1",
    name: "Summoner Skirmish 2026",
    startAt: "2026-08-15T18:00:00.000Z",
    endAtEstimate: null,
    displayStatus: "complete",
    decklistStatus: "PUBLISHED",
    playerCount: 64,
    eventType: "Regional Qualifier",
    eventFormat: "Standard Constructed",
    mappedFormat: "standard",
    officialLabel: null,
    storeName: "Piltover Games",
    location: "Zaun",
    timezone: "UTC",
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-08-16T00:00:00.000Z",
    missingSince: null,
    nextCheckAt: null,
    checkStage: 0,
    triage: "new",
    candidateEventId: null,
    metaEventId: null,
    metaEventSlug: null,
    fetchedAt: null,
    stagedPlayerCount: null,
    stagedLegendCount: null,
    stagedDeckCount: null,
    sourceUrl: "https://example.test/events/evt-1",
    ...overrides,
  };
}

function setResponse(rows: MetaCatalogRow[], overrides: Partial<MetaCatalogListResponse> = {}) {
  captured.response = {
    rows,
    total: rows.length,
    page: 1,
    limit: 50,
    counts: { new: 3, accepted: 1, dismissed: 2 },
    ...overrides,
  } satisfies MetaCatalogListResponse;
}

function rowActions(name: string) {
  return within(screen.getByRole("row", { name: new RegExp(name, "u") }));
}

describe("MetaCatalogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.params = null;
    searchStore.seed({});
    captured.settings = {
      autoAcceptMinPlayers: 64,
      autoAcceptNotable: true,
      autoAcceptOfficial: true,
      updatedAt: "2026-08-20T10:00:00.000Z",
    };
    setResponse([makeRow()]);
    captured.accept.mockResolvedValue({
      metaEventId: "event-1",
      slug: "summoner-skirmish-2026",
      candidateEventId: "cand-1",
      created: true,
    });
    captured.fetchEvent.mockResolvedValue({
      status: "succeeded",
      runId: null,
      message: null,
      result: { players: 64 },
    });
    captured.runSync.mockResolvedValue({
      status: "running",
      runId: "run-9",
      message: null,
      result: null,
    });
  });

  it("asks for the untriaged rows first, since that is the queue being worked", () => {
    render(<MetaCatalogPage />);
    expect(captured.params).toMatchObject({ page: 1, triage: "new" });
  });

  it("shows what the source published about an event, chips included", () => {
    render(<MetaCatalogPage />);
    expect(screen.getByText("Summoner Skirmish 2026")).toBeInTheDocument();
    expect(screen.getByText("2026-08-15")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Decklists")).toBeInTheDocument();
    expect(screen.getByText("Piltover Games, Zaun")).toBeInTheDocument();
  });

  it("links the event name out to the source's own page", () => {
    render(<MetaCatalogPage />);
    const link = screen.getByRole("link", { name: "Summoner Skirmish 2026" });
    expect(link).toHaveAttribute("href", "https://example.test/events/evt-1");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("names the official template an event runs on", () => {
    setResponse([makeRow({ officialLabel: "Regional Qualifier" })]);
    render(<MetaCatalogPage />);
    expect(screen.getByText("Regional Qualifier")).toBeInTheDocument();
  });

  it("says nothing about a template for an event that runs on none", () => {
    render(<MetaCatalogPage />);
    expect(screen.queryByText("Regional Qualifier")).not.toBeInTheDocument();
  });

  it("flags a row a covering crawl stopped returning", () => {
    setResponse([makeRow({ missingSince: "2026-08-20T00:00:00.000Z" })]);
    render(<MetaCatalogPage />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("accepts a row whose format maps, and says where it landed", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.accept).toHaveBeenCalledWith({ externalId: "evt-1" });
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      'Accepted "Summoner Skirmish 2026"',
      expect.objectContaining({ description: expect.stringContaining("summoner-skirmish-2026") }),
    );
  });

  it("pulls a finished event's standings inline, so it is not left empty", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ displayStatus: "complete", decklistStatus: null })]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.fetchEvent).toHaveBeenCalledWith({ externalId: "evt-1" });
    expect(captured.runSync).not.toHaveBeenCalled();
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      "Fetch finished",
      expect.objectContaining({ description: "64 players" }),
    );
  });

  it("leaves a published event's decklists to a background recheck", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ displayStatus: "complete", decklistStatus: "PUBLISHED" })]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.runSync).toHaveBeenCalledWith({ trigger: "runRecheck" });
    expect(captured.fetchEvent).not.toHaveBeenCalled();
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      'Accepted "Summoner Skirmish 2026"',
      expect.objectContaining({ description: expect.stringContaining("in the background") }),
    );
  });

  it("says nothing about a recheck that was already under way", async () => {
    const user = userEvent.setup();
    captured.runSync.mockResolvedValue({
      status: "already_running",
      runId: "run-8",
      message: null,
      result: null,
    });
    setResponse([makeRow({ displayStatus: "complete", decklistStatus: "PUBLISHED" })]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.toastError).not.toHaveBeenCalled();
  });

  it("fetches nothing for an event that has not run yet", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ displayStatus: "upcoming", decklistStatus: null })]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.fetchEvent).not.toHaveBeenCalled();
    expect(captured.runSync).not.toHaveBeenCalled();
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      'Accepted "Summoner Skirmish 2026"',
      expect.objectContaining({
        description: expect.stringContaining("once the event has run"),
      }),
    );
  });

  it("runs the same follow-up when the format had to be picked in the dialog", async () => {
    const user = userEvent.setup();
    setResponse([
      makeRow({ mappedFormat: null, eventFormat: "Draft Cup", displayStatus: "complete" }),
    ]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Accept/u }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Standard" }));
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));

    expect(captured.accept).toHaveBeenCalledWith({ externalId: "evt-1", format: "standard" });
    expect(captured.runSync).toHaveBeenCalledWith({ trigger: "runRecheck" });
  });

  it("asks for a format instead of accepting when the source's maps to nothing", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ mappedFormat: null, eventFormat: "Draft Cup" })]);
    render(<MetaCatalogPage />);

    expect(screen.getByText("Unmapped")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Accept/u }));

    expect(captured.accept).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent('The source calls this "Draft Cup"');
  });

  it("asks before dismissing, and dismisses only once confirmed", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Dismiss/u }));
    expect(captured.dismiss).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(captured.dismiss).toHaveBeenCalledWith({ externalId: "evt-1" });
  });

  it("offers an undismiss on a dismissed row, and nothing to accept", () => {
    setResponse([makeRow({ triage: "dismissed" })]);
    render(<MetaCatalogPage />);
    expect(
      rowActions("Summoner Skirmish").getByRole("button", { name: /Undismiss/u }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept/u })).not.toBeInTheDocument();
  });

  it("fetches an accepted event's results on demand and reports what came back", async () => {
    const user = userEvent.setup();
    setResponse([
      makeRow({ triage: "accepted", metaEventId: "event-1", metaEventSlug: "summoner-skirmish" }),
    ]);
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Fetch now/u }));

    expect(captured.fetchEvent).toHaveBeenCalledWith({ externalId: "evt-1" });
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      "Fetch finished",
      expect.objectContaining({ description: "64 players" }),
    );
  });

  it("opens the auto-accept rules from the top bar, beside the queue they skip", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    expect(screen.queryByLabelText("Minimum field size")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Auto-accept rules" }));

    expect(await screen.findByLabelText("Minimum field size")).toHaveValue(64);
  });

  it("opens on the triage bucket the overview's funnel named", () => {
    searchStore.seed({ triage: "accepted" });
    render(<MetaCatalogPage />);
    expect(captured.params).toMatchObject({ triage: "accepted" });
  });

  it("opens narrowed to the vanished rows when an alert sent it there", () => {
    searchStore.seed({ triage: "accepted", missing: true });
    render(<MetaCatalogPage />);
    expect(captured.params).toMatchObject({ triage: "accepted", missing: true });
    expect(screen.getByRole("switch", { name: "Gone from the listing" })).toBeChecked();
  });

  it("opens narrowed to the unfetched rows when the funnel sent it there", () => {
    searchStore.seed({ triage: "accepted", awaitingResults: true });
    render(<MetaCatalogPage />);
    expect(captured.params).toMatchObject({ triage: "accepted", awaitingResults: true });
    expect(screen.getByRole("switch", { name: "Awaiting results" })).toBeChecked();
  });

  it("keeps the listing filter off when nothing asked for it", () => {
    render(<MetaCatalogPage />);
    expect(captured.params).toMatchObject({ missing: undefined, awaitingResults: undefined });
  });

  it("drops a filter into the URL rather than keeping it to itself", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("switch", { name: "Gone from the listing" }));

    expect(searchStore.get()).toMatchObject({ missing: true });
    expect(captured.params).toMatchObject({ missing: true });
  });

  it("leaves the default triage bucket out of the URL, and spells out any other", async () => {
    const user = userEvent.setup();
    searchStore.seed({ triage: "accepted" });
    render(<MetaCatalogPage />);

    await user.click(screen.getByLabelText("Triage state"));
    await user.click(await screen.findByRole("option", { name: /^New/u }));

    expect(searchStore.get().triage).toBeUndefined();
    expect(captured.params).toMatchObject({ triage: "new" });
  });

  it("asks for every bucket when the reader picks any state", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    await user.click(screen.getByLabelText("Triage state"));
    await user.click(await screen.findByRole("option", { name: "Any state" }));

    expect(searchStore.get()).toMatchObject({ triage: "any" });
    expect(captured.params).toMatchObject({ triage: undefined });
  });

  it("waits for a pause before filtering on field size, so one threshold is one query", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    await user.type(screen.getByLabelText("Minimum players"), "64");
    expect(searchStore.get().minPlayers).toBeUndefined();

    await waitFor(() => {
      expect(captured.params).toMatchObject({ minPlayers: 64 });
    });
  });

  it("goes back to the first page whenever a filter reframes the result set", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(captured.params).toMatchObject({ page: 2 });

    await user.click(screen.getByRole("switch", { name: "Decklists published" }));

    expect(searchStore.get().page).toBeUndefined();
    expect(captured.params).toMatchObject({ page: 1, decklistPublished: true });
  });

  it("shows what an accepted row's last fetch staged", () => {
    setResponse([
      makeRow({
        triage: "accepted",
        metaEventId: "event-1",
        fetchedAt: "2026-08-16T02:00:00.000Z",
        stagedPlayerCount: 64,
        stagedLegendCount: 60,
        stagedDeckCount: 12,
      }),
    ]);
    render(<MetaCatalogPage />);

    expect(screen.getByText("64 standings")).toBeInTheDocument();
    expect(screen.getByText("60 legends")).toBeInTheDocument();
    expect(screen.getByText("12 decks")).toBeInTheDocument();
    expect(screen.getByText("ladder done")).toBeInTheDocument();
  });

  it("leaves an untriaged row's coverage blank, since nothing has been fetched", () => {
    render(<MetaCatalogPage />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("Standings pending")).not.toBeInTheDocument();
  });

  it("opens the source vocabulary beside the rules it feeds", async () => {
    const user = userEvent.setup();
    render(<MetaCatalogPage />);

    expect(screen.queryByRole("heading", { name: "Templates" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Templates & formats" }));

    expect(await screen.findByRole("heading", { name: "Templates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Formats" })).toBeInTheDocument();
  });

  it("pages on the server, and asks for the page that was clicked", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    expect(screen.getByText("120 matching events.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(captured.params).toMatchObject({ page: 2 });
  });

  it("filters on one end of the date range without needing the other", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    await user.type(screen.getByPlaceholderText("From"), "2026-08-01");

    expect(captured.params).toMatchObject({
      dateFrom: "2026-08-01T00:00:00.000Z",
      dateTo: undefined,
    });
  });

  it("opens on the newest events, and sorts on the server when a header is clicked", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    expect(captured.params).toMatchObject({ sort: "startAt", direction: "desc" });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByText("Players"));

    expect(captured.params).toMatchObject({ sort: "playerCount", direction: "desc", page: 1 });

    await user.click(screen.getByText("Players"));

    expect(captured.params).toMatchObject({ sort: "playerCount", direction: "asc" });
  });

  it("falls back to newest first when the sort is taken off a column", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    await user.click(screen.getByText("Players"));
    await user.click(screen.getByText("Players"));
    await user.click(screen.getByText("Players"));

    expect(captured.params).toMatchObject({ sort: "startAt", direction: "desc" });
  });

  it("leaves the sort params off the URL rather than spelling the fallback out", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<MetaCatalogPage />);

    await user.click(screen.getByText("Players"));
    expect(searchStore.get()).toMatchObject({ eventSort: "playerCount", eventDir: "desc" });

    await user.click(screen.getByText("Players"));
    await user.click(screen.getByText("Players"));

    expect(searchStore.get().eventSort).toBeUndefined();
    expect(searchStore.get().eventDir).toBeUndefined();
  });
});
