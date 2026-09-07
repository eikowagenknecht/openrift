import type { MetaOverlayQueueRow } from "@openrift/shared";
import type { MetaSyncStatus } from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  status: null as unknown,
  playloltcgStatus: null as unknown,
  topdeckStatus: null as unknown,
  overlays: [] as unknown[],
  prevSearch: {} as Record<string, unknown>,
  run: vi.fn(),
  cancelRun: vi.fn(),
  archiveRuns: [] as unknown[],
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: captured.toastSuccess, error: captured.toastError },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search, to }: { children?: ReactNode; search?: unknown; to?: string }) => (
    <a
      href={to ?? "/admin/meta"}
      data-search={JSON.stringify(
        typeof search === "function"
          ? (search as (prev: Record<string, unknown>) => unknown)(captured.prevSearch)
          : search,
      )}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  createLink: (component: unknown) => component,
}));

vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/hooks/use-admin-meta-catalog", () => ({
  SYNC_STATUS_POLL_MS: 15_000,
  useMetaSyncStatus: (source: string) => ({
    data:
      { playloltcg: captured.playloltcgStatus, topdeck: captured.topdeckStatus }[source] ??
      (source === "uvsgames" ? captured.status : undefined),
    refetch: vi.fn(),
    isFetching: false,
    dataUpdatedAt: 0,
  }),
  useRunMetaSync: () => ({ mutateAsync: captured.run, isPending: false, variables: undefined }),
  useMetaArchiveJobs: () => ({ data: { runs: captured.archiveRuns } }),
  useCancelMetaRun: () => ({
    mutateAsync: captured.cancelRun,
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/hooks/use-admin-meta-overlays", () => ({
  useAdminMetaOverlays: () => ({ data: { overlays: captured.overlays } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({ formats: [], labels: {} }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaAdminOverviewPage, MetaSourceSyncSection } from "./meta-admin-overview-page";

const NOW = new Date("2026-08-29T12:00:00.000Z");

const status: MetaSyncStatus = {
  catalog: {
    total: 266_000,
    completed: 190_000,
    decklistPublished: 1200,
    missing: 12,
    queued: 40,
    dueRecheck: 3,
    acceptedAwaitingResults: 17,
    acceptedMissing: 0,
    lastSeenAt: "2026-08-29T09:00:00.000Z",
  },
  archive: { events: 480, eventsWithStandings: 420, eventsWithDecklists: 310, decks: 2600 },
  counts: { new: 30, accepted: 8, dismissed: 4 },
  runs: [
    {
      id: "run-1",
      kind: "meta.uvsgames_sync",
      trigger: "cron",
      status: "succeeded",
      startedAt: "2026-08-29T08:00:00.000Z",
      finishedAt: "2026-08-29T08:04:00.000Z",
      durationMs: 240_000,
      errorMessage: null,
      result: { pages: 250, upserted: 1200 },
    },
    {
      id: "run-2",
      kind: "meta.uvsgames_recheck",
      trigger: "admin",
      status: "failed",
      startedAt: "2026-08-28T08:00:00.000Z",
      finishedAt: "2026-08-28T08:00:02.000Z",
      durationMs: 2000,
      errorMessage: "Upstream returned 503",
      result: null,
    },
  ],
  schedules: {
    "meta.uvsgames_sync": false,
    "meta.uvsgames_recheck": true,
    "meta.playloltcg_sync": true,
    "meta.playloltcg_recheck": true,
  },
};

function runningRun(kind: string): MetaSyncStatus["runs"][number] {
  return {
    id: "run-7",
    kind,
    trigger: "admin",
    status: "running",
    startedAt: "2026-08-29T11:00:00.000Z",
    finishedAt: null,
    durationMs: null,
    errorMessage: null,
    result: null,
  };
}

function overlay(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return {
    id: "overlay-1",
    kind: "player",
    status: "pending",
    provider: "uvsgames",
    sourceEventExternalId: "evt-1",
    sourcePlayerExternalId: "evt-1-p1",
    metaEventPlayerId: "row-1",
    metaEventId: "event-1",
    metaEventName: "Summoner Skirmish",
    eventOverlayId: null,
    metaEventSlug: null,
    eventDate: null,
    eventFormat: null,
    rank: null,
    rankIsTier: null,
    match: null,
    proposedName: null,
    playerName: "Ashe Main",
    submittedBy: "user-1",
    submissionNote: null,
    changes: [],
    cards: [],
    unresolvedNames: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function stage(label: string) {
  return screen.getByRole("link", { name: new RegExp(label, "u") });
}

function statusWith(overrides: Partial<MetaSyncStatus["catalog"]>): MetaSyncStatus {
  return { ...status, catalog: { ...status.catalog, ...overrides } };
}

describe("MetaSourceSyncSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    captured.prevSearch = {};
    captured.status = status;
    captured.playloltcgStatus = status;
    captured.topdeckStatus = status;
    captured.overlays = [overlay(), overlay({ id: "overlay-2" })];
    captured.run.mockResolvedValue({
      status: "running",
      runId: "run-9",
      message: null,
      result: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts each pipeline stage, review from the queue rather than the status", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(stage("Untriaged")).toHaveTextContent("30");
    expect(stage("Untriaged")).toHaveTextContent("of 266,000 catalogued");
    expect(stage("Awaiting results")).toHaveTextContent("17");
    expect(stage("Needs review")).toHaveTextContent("2");
    expect(stage("Needs review")).toHaveTextContent("0 unmatched card names");
    expect(stage("Published")).toHaveTextContent("480");
    expect(stage("Published")).toHaveTextContent("2,600 decks · 310 of 1,200 events with lists");
  });

  it("counts only the overlays the open source's tab is about", () => {
    captured.overlays = [
      overlay(),
      overlay({ id: "overlay-2", provider: "playloltcg", unresolvedNames: ["A"] }),
      overlay({ id: "overlay-3", provider: null }),
    ];

    render(<MetaSourceSyncSection source="uvsgames" />);

    // The playloltcg-provider overlay belongs to the other tab; the null-provider one shows on both.
    expect(stage("Needs review")).toHaveTextContent("2");
    expect(stage("Needs review")).toHaveTextContent("0 unmatched card names");
  });

  it("sends a stage straight to the rows it counted", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(stage("Untriaged")).toHaveAttribute("data-search", JSON.stringify({ tab: "catalogue" }));
    expect(stage("Awaiting results")).toHaveAttribute(
      "data-search",
      JSON.stringify({ tab: "catalogue", triage: "accepted", awaitingResults: true }),
    );
    expect(stage("Needs review")).toHaveAttribute("data-search", JSON.stringify({ tab: "review" }));
  });

  it("names its own source on every catalogue link, whatever the URL carries", () => {
    render(<MetaSourceSyncSection source="playloltcg" />);

    expect(stage("Untriaged")).toHaveAttribute(
      "data-search",
      JSON.stringify({ source: "playloltcg", tab: "catalogue" }),
    );
  });

  it("keeps one quiet mirror line instead of a comparison row", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);
    expect(
      screen.getByText(/Mirror: 266,000 events, 190,000 ran, last crawl/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/at uvsgames/u)).not.toBeInTheDocument();
  });

  it("keeps finding events and fetching their results on separate buttons", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MetaSourceSyncSection source="uvsgames" />);

    await user.click(screen.getByRole("button", { name: /Sync the catalogue/u }));
    expect(captured.run.mock.calls).toEqual([[{ trigger: "runSync" }]]);

    await user.click(screen.getByRole("button", { name: /^Fetch results/u }));
    expect(captured.run.mock.calls).toEqual([
      [{ trigger: "runSync" }],
      [{ trigger: "runRecheck" }],
    ]);
  });

  it("runs the playloltcg source on its own buttons", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MetaSourceSyncSection source="playloltcg" />);

    await user.click(screen.getByRole("button", { name: /Sync the catalogue/u }));
    expect(captured.run).toHaveBeenCalledWith({ trigger: "runPlayloltcgSync" });

    await user.click(screen.getByRole("button", { name: /^Fetch results/u }));
    expect(captured.run).toHaveBeenCalledWith({ trigger: "runPlayloltcgRecheck" });
  });

  it("sweeps the backlog from each source's own auto-accept button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<MetaSourceSyncSection source="uvsgames" />);

    await user.click(screen.getByRole("button", { name: /Auto-accept backlog/u }));
    await user.click(screen.getByRole("button", { name: /Run the sweep/u }));
    expect(captured.run).toHaveBeenCalledWith({ trigger: "runAutoAccept" });

    view.rerender(<MetaSourceSyncSection source="playloltcg" />);
    await user.click(screen.getByRole("button", { name: /Auto-accept backlog/u }));
    await user.click(screen.getByRole("button", { name: /Run the sweep/u }));
    expect(captured.run).toHaveBeenCalledWith({ trigger: "runPlayloltcgAutoAccept" });
  });

  it("says how many events a backlog sweep would run over before it starts one", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MetaSourceSyncSection source="uvsgames" />);

    await user.click(screen.getByRole("button", { name: /Auto-accept backlog/u }));

    expect(screen.getByText(/all 30 events awaiting triage/u)).toBeInTheDocument();
    expect(captured.run).not.toHaveBeenCalled();
  });

  it("says a crawl started rather than claiming it finished", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MetaSourceSyncSection source="uvsgames" />);

    await user.click(screen.getByRole("button", { name: /Sync the catalogue/u }));

    expect(captured.run).toHaveBeenCalledWith({ trigger: "runSync" });
    expect(captured.toastSuccess).toHaveBeenCalledWith(
      "Sync the catalogue started",
      expect.objectContaining({ description: expect.stringContaining("background") }),
    );
    expect(screen.getByText("Sync the catalogue: running")).toBeInTheDocument();
  });

  it("shows the backfill inline, no accordion", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.getByRole("button", { name: /Sync the catalogue/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Full backfill/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Maintenance" })).not.toBeInTheDocument();
  });

  it("offers to stop a backfill only while one is running", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.queryByRole("button", { name: /Stop the backfill/u })).not.toBeInTheDocument();
  });

  it("stops a running backfill and says which run it flagged", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    captured.status = {
      ...status,
      runs: [
        {
          id: "run-9",
          kind: "meta.uvsgames_backfill",
          trigger: "admin",
          status: "running",
          startedAt: "2026-08-29T11:00:00.000Z",
          finishedAt: null,
          durationMs: null,
          errorMessage: null,
          result: null,
        },
      ],
    };
    captured.cancelRun.mockResolvedValue({ runId: "run-9", cancelRequested: true });
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.queryByRole("button", { name: /Full backfill/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue backfill/u })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Stop the backfill/u }));

    expect(captured.cancelRun).toHaveBeenCalledWith({ job: "backfill" });
    expect(screen.getByText("Full backfill: stopping at run run-9")).toBeInTheDocument();
  });

  it("stops a running recheck from the button that started it", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    captured.status = { ...status, runs: [runningRun("meta.uvsgames_recheck")] };
    captured.cancelRun.mockResolvedValue({ runId: "run-7", cancelRequested: true });
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.queryByRole("button", { name: /^Fetch results/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Stop fetching results/u }));

    expect(captured.cancelRun).toHaveBeenCalledWith({ job: "recheck" });
    expect(screen.getByText("Fetch results: stopping at run run-7")).toBeInTheDocument();
  });

  it("offers no Stop for a playloltcg recheck, which never reads the flag", () => {
    captured.playloltcgStatus = { ...status, runs: [runningRun("meta.playloltcg_recheck")] };
    render(<MetaSourceSyncSection source="playloltcg" />);

    expect(screen.getByRole("button", { name: /^Fetch results/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop fetching/u })).not.toBeInTheDocument();
  });

  it("offers continue and start-over once a backfill stopped partway", () => {
    captured.status = {
      ...status,
      runs: [
        {
          id: "run-9",
          kind: "meta.uvsgames_backfill",
          trigger: "admin",
          status: "succeeded",
          startedAt: "2026-08-29T11:00:00.000Z",
          finishedAt: "2026-08-29T11:20:00.000Z",
          durationMs: 1_200_000,
          errorMessage: null,
          result: {
            complete: false,
            cancelRequested: true,
            rows: 120_000,
            coveredThrough: "2026-04-06T13:00:00.000Z",
          },
        },
      ],
    };
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(
      screen.getByText(/was stopped and covered events through 2026-04-06 13:00/u),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue backfill/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Backfill from scratch/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Full backfill/u })).not.toBeInTheDocument();
  });

  it("answers a trigger that is already in flight instead of looking like it worked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    captured.run.mockResolvedValue({
      status: "already_running",
      runId: "run-8",
      message: null,
      result: null,
    });
    render(<MetaSourceSyncSection source="uvsgames" />);

    await user.click(screen.getByRole("button", { name: /Full backfill/u }));

    expect(captured.toastError).toHaveBeenCalledWith(
      "Full backfill is already running",
      expect.anything(),
    );
    expect(screen.getByText("Full backfill: already running")).toBeInTheDocument();
  });

  it("marks the crawls this deployment has no cron for", () => {
    captured.status = {
      ...status,
      schedules: { ...status.schedules, "meta.uvsgames_recheck": false },
    };
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.getAllByText("cron disabled")).toHaveLength(2);
  });

  it("says what the last run did instead of repeating the run history", () => {
    render(<MetaSourceSyncSection source="uvsgames" />);

    expect(screen.getByText("meta.uvsgames_sync")).toBeInTheDocument();
    expect(screen.getByText("250 pages · 1,200 upserted")).toBeInTheDocument();
    expect(screen.queryByText("Upstream returned 503")).not.toBeInTheDocument();
  });

  it("sends the reader to this source's runs on the central table", () => {
    render(<MetaSourceSyncSection source="playloltcg" />);

    const link = screen.getByRole("link", { name: "All runs" });
    expect(link).toHaveAttribute("href", "/admin/job-runs");
    expect(link).toHaveAttribute("data-search", JSON.stringify({ runPrefix: "meta.playloltcg_" }));
  });
});

describe("MetaAdminOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    captured.prevSearch = {};
    captured.status = status;
    // Only uvsgames answers by default, so one source's alerts are unambiguous.
    captured.playloltcgStatus = undefined;
    captured.topdeckStatus = undefined;
    captured.overlays = [];
    captured.archiveRuns = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says so plainly when neither source is in trouble", () => {
    captured.status = statusWith({ acceptedMissing: 0, dueRecheck: 3 });
    captured.playloltcgStatus = captured.status;
    render(<MetaAdminOverviewPage />);

    expect(screen.getByText("Every source looks healthy.")).toBeInTheDocument();
  });

  it("raises the events that vanished from the source and the unmatched card names", () => {
    captured.status = statusWith({ acceptedMissing: 2 });
    captured.overlays = [overlay({ unresolvedNames: ["A", "B", "C", "D", "E"] })];
    render(<MetaAdminOverviewPage />);

    expect(
      screen.getByText("2 events live on /meta have disappeared from the source listing."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("5 card names across staged decks match no live card."),
    ).toBeInTheDocument();
  });

  it("lands the missing-event alert on the missing rows, not every accepted one", () => {
    captured.status = statusWith({ acceptedMissing: 2, dueRecheck: 60 });
    render(<MetaAdminOverviewPage />);

    expect(screen.getByRole("link", { name: "The missing events" })).toHaveAttribute(
      "data-search",
      JSON.stringify({ tab: "catalogue", triage: "accepted", missing: true }),
    );
    expect(screen.getByRole("link", { name: "Accepted events" })).toHaveAttribute(
      "data-search",
      JSON.stringify({ tab: "catalogue", triage: "accepted" }),
    );
  });

  it("raises a mirror that has stopped being crawled", () => {
    captured.status = statusWith({ lastSeenAt: "2026-08-01T00:00:00.000Z" });
    render(<MetaAdminOverviewPage />);

    expect(screen.getByText(/The last crawl activity was 4w ago/u)).toBeInTheDocument();
  });

  it("says which source each alert is about, and sends it to that source's rows", () => {
    captured.status = statusWith({ acceptedMissing: 2 });
    captured.playloltcgStatus = statusWith({ acceptedMissing: 3 });
    render(<MetaAdminOverviewPage />);

    const rows = screen
      .getAllByText(/have disappeared from the source listing/u)
      .map((message) => message.parentElement!);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("UVS Games")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Play LoL TCG")).toBeInTheDocument();

    const [uvsgames, playloltcg] = screen.getAllByRole("link", { name: "The missing events" });
    expect(uvsgames).toHaveAttribute(
      "data-search",
      JSON.stringify({ tab: "catalogue", triage: "accepted", missing: true }),
    );
    expect(playloltcg).toHaveAttribute(
      "data-search",
      JSON.stringify({
        source: "playloltcg",
        tab: "catalogue",
        triage: "accepted",
        missing: true,
      }),
    );
  });

  it("lands the stale-crawl alert on every run of the source", () => {
    captured.status = statusWith({ lastSeenAt: null });
    render(<MetaAdminOverviewPage />);

    expect(screen.getByRole("link", { name: "Recent runs" })).toHaveAttribute(
      "data-search",
      JSON.stringify({ runPrefix: "meta.uvsgames_" }),
    );
  });

  it("lands the failure alert on the failed runs alone", () => {
    captured.status = {
      ...status,
      runs: [{ ...status.runs[1]!, startedAt: "2026-08-29T11:00:00.000Z" }],
    };
    render(<MetaAdminOverviewPage />);

    expect(screen.getByRole("link", { name: "The failed runs" })).toHaveAttribute(
      "data-search",
      JSON.stringify({ runPrefix: "meta.uvsgames_", runStatus: "failed" }),
    );
  });

  it("holds a section for each source, whichever one is having a bad day", () => {
    render(<MetaAdminOverviewPage />);

    expect(screen.getByRole("region", { name: "UVS Games" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Play LoL TCG" })).toBeInTheDocument();
  });

  it("gives the archive its own section, because neither pass belongs to a source", () => {
    render(<MetaAdminOverviewPage />);

    expect(screen.getByRole("region", { name: "The archive" })).toBeInTheDocument();
  });

  it("starts the tier pass as a job rather than waiting on it", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    captured.run.mockResolvedValue({ status: "running", runId: "run-9" });
    render(<MetaAdminOverviewPage />);

    await user.click(screen.getByRole("button", { name: "Reapply tier rules" }));

    expect(captured.run).toHaveBeenCalledWith({ trigger: "runRetier" });
  });

  it("asks before the whole-archive repair, which reads and writes everything", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    captured.run.mockResolvedValue({ status: "running", runId: "run-9" });
    render(<MetaAdminOverviewPage />);

    await user.click(screen.getByRole("button", { name: "Re-promote everything" }));
    expect(captured.run).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Run the repair" }));
    expect(captured.run).toHaveBeenCalledWith({ trigger: "runRepromote" });
  });

  it("holds both archive buttons while either pass is running", () => {
    captured.archiveRuns = [{ id: "run-1", kind: "meta.repromote", status: "running" }];
    render(<MetaAdminOverviewPage />);

    // Both passes walk the same rows, and the tier scan would read a live tier
    // the repair is halfway through rewriting.
    expect(screen.getByRole("button", { name: "Reapply tier rules" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-promote everything" })).toBeDisabled();
  });
});
