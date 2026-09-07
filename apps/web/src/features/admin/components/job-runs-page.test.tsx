import type { JobRunsListResponse } from "@openrift/shared/contracts/admin/job-runs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as UseJobRuns from "@/features/admin/hooks/use-job-runs";
import type { JobRunsQueryParams } from "@/features/admin/hooks/use-job-runs";

const captured = vi.hoisted(() => ({
  params: null as unknown,
  response: null as unknown,
}));

/**
 * The route's search params, which the page reads its whole filter set from.
 * Interactions go out through `navigate` and loop back through here.
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
    createLink: (component: unknown) => component,
  };
});

vi.mock("@/features/admin/components/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/features/admin/hooks/use-job-runs", async () => {
  const actual = await vi.importActual<typeof UseJobRuns>("@/features/admin/hooks/use-job-runs");
  return {
    ...actual,
    useAdminJobRuns: (params: JobRunsQueryParams) => {
      captured.params = params;
      return { data: captured.response, refetch: vi.fn(), isFetching: false, dataUpdatedAt: 0 };
    },
  };
});

vi.mock("@/hooks/use-rehost", () => ({
  useCancelRegenerateImages: () => ({ mutate: vi.fn(), isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { JobRunsPage } from "./job-runs-page";

const KINDS = [
  "images.regenerate",
  "meta.uvsgames_recheck",
  "meta.uvsgames_sync",
  "tcgplayer.refresh",
];

function response(overrides: Partial<JobRunsListResponse> = {}): JobRunsListResponse {
  return {
    runs: [
      {
        id: "019d4999-4219-72f6-b7bb-64004e1b1bff",
        kind: "meta.uvsgames_recheck",
        trigger: "cron",
        status: "succeeded",
        startedAt: "2026-09-03T09:39:00.000Z",
        finishedAt: "2026-09-03T10:01:00.000Z",
        durationMs: 1_309_000,
        errorMessage: null,
        result: { requests: 155, fetched: 18, players: 702 },
        noop: false,
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    kinds: KINDS,
    ...overrides,
  };
}

describe("JobRunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchStore.seed({});
    captured.response = response();
  });

  it("reads a run's counters off the row, without opening it", () => {
    render(<JobRunsPage />);

    expect(screen.getByText("155 requests · 18 fetched · 702 players")).toBeInTheDocument();
  });

  it("puts a failed run's message where the counters would be", () => {
    captured.response = response({
      runs: [
        {
          ...response().runs[0]!,
          status: "failed",
          errorMessage: "server restarted during run",
          result: {},
        },
      ],
    });
    render(<JobRunsPage />);

    expect(screen.getByText("server restarted during run")).toBeInTheDocument();
  });

  it("offers a whole namespace as one filter, and asks the API for the family", async () => {
    const user = userEvent.setup();
    render(<JobRunsPage />);

    await user.click(screen.getByRole("combobox", { name: "Job kind" }));
    await user.click(await screen.findByRole("option", { name: "meta.*" }));

    expect(searchStore.get()).toEqual({ runKind: undefined, runPrefix: "meta.", page: undefined });
    expect(captured.params).toMatchObject({ kindPrefix: "meta.", kind: undefined });
  });

  it("names no family for a namespace with one job in it", async () => {
    const user = userEvent.setup();
    render(<JobRunsPage />);

    await user.click(screen.getByRole("combobox", { name: "Job kind" }));

    expect(screen.queryByRole("option", { name: "tcgplayer.*" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "tcgplayer.refresh" })).toBeInTheDocument();
  });

  it("keeps a finer family than the kinds spell, so a link into it survives", () => {
    searchStore.seed({ runPrefix: "meta.uvsgames_" });
    render(<JobRunsPage />);

    expect(screen.getByRole("combobox", { name: "Job kind" })).toHaveTextContent("meta.uvsgames_*");
    expect(captured.params).toMatchObject({ kindPrefix: "meta.uvsgames_" });
  });

  it("drops the family when a single kind is picked", async () => {
    const user = userEvent.setup();
    searchStore.seed({ runPrefix: "meta." });
    render(<JobRunsPage />);

    await user.click(screen.getByRole("combobox", { name: "Job kind" }));
    await user.click(await screen.findByRole("option", { name: "meta.uvsgames_sync" }));

    expect(searchStore.get()).toMatchObject({
      runKind: "meta.uvsgames_sync",
      runPrefix: undefined,
    });
  });

  it("goes back to the first page whenever a filter reframes the list", async () => {
    const user = userEvent.setup();
    searchStore.seed({ page: 4 });
    render(<JobRunsPage />);

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "failed" }));

    expect(searchStore.get()).toMatchObject({ runStatus: "failed", page: undefined });
  });
});
