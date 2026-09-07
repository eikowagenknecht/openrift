import type {
  PlayloltcgCatalogListResponse,
  PlayloltcgCatalogRow,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayloltcgCatalogParams } from "@/features/admin/hooks/use-admin-playloltcg-catalog";

const captured = vi.hoisted(() => ({
  params: null as unknown,
  response: null as unknown,
  accept: vi.fn(),
  dismiss: vi.fn(),
  undismiss: vi.fn(),
  fetchEvent: vi.fn(() => Promise.resolve({ status: "running", runId: "run-1" })),
  acceptSubscriptions: 0,
}));

// The route's search params. Interactions go out through `navigate` and only
// reach the page when they come back around through here.
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

vi.mock("@/features/admin/hooks/use-admin-playloltcg-catalog", () => ({
  PLAYLOLTCG_CATALOG_PAGE_SIZE: 50,
  useAdminPlayloltcgCatalog: (params: PlayloltcgCatalogParams) => {
    captured.params = params;
    return { data: captured.response };
  },
  useAcceptPlayloltcgEvent: () => {
    captured.acceptSubscriptions += 1;
    return { mutate: captured.accept, isPending: false };
  },
  useDismissPlayloltcgEvent: () => ({
    mutate: captured.dismiss,
    mutateAsync: captured.dismiss,
    isPending: false,
  }),
  useUndismissPlayloltcgEvent: () => ({ mutate: captured.undismiss, isPending: false }),
  useFetchPlayloltcgEvent: () => ({ mutateAsync: captured.fetchEvent, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PlayloltcgCatalogPage } from "./playloltcg-catalog-page";

function makeRow(overrides: Partial<PlayloltcgCatalogRow> = {}): PlayloltcgCatalogRow {
  return {
    activityShopId: 4021,
    name: "Summoner Skirmish 2026",
    shopName: "Piltover Games",
    city: "Zaun",
    status: 5,
    battleMode: "1v1",
    playerCount: 32,
    startAt: "2026-08-15",
    triage: "new",
    metaEventId: null,
    metaEventSlug: null,
    fetchedAt: null,
    missingSince: null,
    nextCheckAt: null,
    stagedPlayerCount: 0,
    stagedLegendCount: 0,
    stagedDeckCount: 0,
    sourceUrl: "https://example.test/activity/4021",
    ...overrides,
  };
}

function setResponse(
  rows: PlayloltcgCatalogRow[],
  overrides: Partial<PlayloltcgCatalogListResponse> = {},
) {
  captured.response = {
    rows,
    total: rows.length,
    page: 1,
    limit: 50,
    counts: { new: 7, accepted: 2, dismissed: 1 },
    ...overrides,
  } satisfies PlayloltcgCatalogListResponse;
}

function rowActions(name: string) {
  return within(screen.getByRole("row", { name: new RegExp(name, "u") }));
}

describe("PlayloltcgCatalogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.params = null;
    captured.acceptSubscriptions = 0;
    searchStore.seed({});
    setResponse([makeRow()]);
  });

  it("asks for the untriaged rows first, since that is the queue being worked", () => {
    render(<PlayloltcgCatalogPage />);
    expect(captured.params).toMatchObject({ page: 1, triage: "new" });
  });

  it("shows what the source published about an event, chips included", () => {
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("Summoner Skirmish 2026")).toBeInTheDocument();
    expect(screen.getByText("Piltover Games, Zaun")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("prints the event's day rather than the source's raw value", () => {
    setResponse([makeRow({ startAt: "2026-08-15" })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("2026-08-15")).toBeInTheDocument();
  });

  it("leaves a dash where the source gave no date", () => {
    setResponse([makeRow({ startAt: null })]);
    render(<PlayloltcgCatalogPage />);
    expect(rowActions("Summoner Skirmish").getByText("—")).toBeInTheDocument();
  });

  it("says nothing about the status when the source reports one it does not know", () => {
    setResponse([makeRow({ status: 9 })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.queryByText("Finished")).not.toBeInTheDocument();
  });

  it("names a battle mode that is not the ordinary duel", () => {
    setResponse([makeRow({ battleMode: "2v2" })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("2v2")).toBeInTheDocument();
  });

  it("links the event name out to the source's own page", () => {
    render(<PlayloltcgCatalogPage />);
    const link = screen.getByRole("link", { name: "Summoner Skirmish 2026" });
    expect(link).toHaveAttribute("href", "https://example.test/activity/4021");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("accepts the row whose button was pressed", async () => {
    const user = userEvent.setup();
    setResponse([makeRow(), makeRow({ activityShopId: 5510, name: "Noxus Open" })]);
    render(<PlayloltcgCatalogPage />);

    await user.click(rowActions("Noxus Open").getByRole("button", { name: "Accept" }));

    expect(captured.accept).toHaveBeenCalledWith({ activityShopId: 5510 });
  });

  it("asks before dismissing, and dismisses only once confirmed", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Dismiss/u }));
    expect(captured.dismiss).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(captured.dismiss).toHaveBeenCalledWith({ activityShopId: 4021 });
  });

  it("subscribes to the mutations once for the page, not once per row", () => {
    setResponse([
      makeRow({ activityShopId: 1 }),
      makeRow({ activityShopId: 2 }),
      makeRow({ activityShopId: 3 }),
      makeRow({ activityShopId: 4 }),
    ]);
    const many = render(<PlayloltcgCatalogPage />);
    const withFourRows = captured.acceptSubscriptions;
    many.unmount();

    captured.acceptSubscriptions = 0;
    setResponse([makeRow({ activityShopId: 1 })]);
    render(<PlayloltcgCatalogPage />);

    expect(withFourRows).toBe(captured.acceptSubscriptions);
  });

  it("offers nothing to accept on a row that has already been taken", () => {
    setResponse([makeRow({ triage: "accepted" })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept/u })).not.toBeInTheDocument();
  });

  it("offers an undismiss on a dismissed row, and nothing to accept", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ triage: "dismissed" })]);
    render(<PlayloltcgCatalogPage />);

    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Undismiss/u }));

    expect(captured.undismiss).toHaveBeenCalledWith({ activityShopId: 4021 });
  });

  it("fetches an accepted event's results on demand and reports what came back", async () => {
    const user = userEvent.setup();
    setResponse([makeRow({ triage: "accepted", metaEventId: "event-1" })]);
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByRole("button", { name: /Fetch now/u }));

    expect(captured.fetchEvent).toHaveBeenCalledWith({ activityShopId: 4021 });
  });

  it("opens on the triage bucket the URL named", () => {
    searchStore.seed({ triage: "accepted" });
    render(<PlayloltcgCatalogPage />);
    expect(captured.params).toMatchObject({ triage: "accepted" });
  });

  it("leaves the default triage bucket out of the URL, and spells out any other", async () => {
    const user = userEvent.setup();
    searchStore.seed({ triage: "accepted" });
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByLabelText("Triage state"));
    await user.click(await screen.findByRole("option", { name: /^New/u }));

    expect(searchStore.get().triage).toBeUndefined();
    expect(captured.params).toMatchObject({ triage: "new" });
  });

  it("asks for every bucket when the reader picks any state", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByLabelText("Triage state"));
    await user.click(await screen.findByRole("option", { name: "Any state" }));

    expect(searchStore.get()).toMatchObject({ triage: "any" });
    expect(captured.params).toMatchObject({ triage: undefined });
  });

  it("counts the buckets on the filter, so the queue's size is visible before picking", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByLabelText("Triage state"));

    expect(await screen.findByRole("option", { name: "New (7)" })).toBeInTheDocument();
  });

  it("drops a search into the URL rather than keeping it to itself", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.type(screen.getByPlaceholderText("Search event or shop"), "noxus");

    await vi.waitFor(() => {
      expect(searchStore.get().q).toBe("noxus");
    });
    expect(captured.params).toMatchObject({ search: "noxus" });
  });

  it("pages on the server, and asks for the page that was clicked", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<PlayloltcgCatalogPage />);

    expect(screen.getByText("120 matching events.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(searchStore.get().page).toBe(2);
    expect(captured.params).toMatchObject({ page: 2 });
  });

  it("goes back to the first page whenever a filter reframes the result set", async () => {
    const user = userEvent.setup();
    setResponse([makeRow()], { total: 120 });
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(captured.params).toMatchObject({ page: 2 });

    await user.click(screen.getByLabelText("Triage state"));
    await user.click(await screen.findByRole("option", { name: /^Accepted/u }));

    expect(searchStore.get().page).toBeUndefined();
    expect(captured.params).toMatchObject({ page: 1, triage: "accepted" });
  });

  it("filters on the source's own lifecycle step, not on a status we invented", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByLabelText("Event status"));
    await user.click(await screen.findByRole("option", { name: "Reg open" }));

    expect(searchStore.get().plStatus).toBe(1);
    expect(captured.params).toMatchObject({ status: 1 });
  });

  it("drops the status filter again when any state is picked", async () => {
    const user = userEvent.setup();
    searchStore.seed({ plStatus: 5 });
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByLabelText("Event status"));
    await user.click(await screen.findByRole("option", { name: "Any status" }));

    expect(searchStore.get().plStatus).toBeUndefined();
    expect(captured.params).toMatchObject({ status: undefined });
  });

  it("carries the day range and the player floor into the query", () => {
    searchStore.seed({ dateFrom: "2026-08-01", dateTo: "2026-08-31", minPlayers: 16 });
    render(<PlayloltcgCatalogPage />);
    expect(captured.params).toMatchObject({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      minPlayers: 16,
    });
  });

  it("keeps an off toggle out of the URL rather than writing it false", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);

    await user.click(screen.getByRole("switch", { name: "Awaiting results" }));
    expect(searchStore.get().awaitingResults).toBe(true);

    await user.click(screen.getByRole("switch", { name: "Awaiting results" }));
    expect(searchStore.get().awaitingResults).toBeUndefined();
  });

  it("orders newest first until a header says otherwise", async () => {
    const user = userEvent.setup();
    render(<PlayloltcgCatalogPage />);
    expect(captured.params).toMatchObject({ sort: "startAt", direction: "desc" });

    await user.click(screen.getByRole("button", { name: /Players/u }));

    expect(searchStore.get()).toMatchObject({ eventSort: "playerCount", eventDir: "desc" });
    expect(captured.params).toMatchObject({ sort: "playerCount", direction: "desc" });
  });

  it("says an accepted event is still missing its standings", () => {
    setResponse([makeRow({ triage: "accepted", metaEventId: "event-1" })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("Standings pending")).toBeInTheDocument();
  });

  it("flags a row the crawl stopped returning", () => {
    setResponse([makeRow({ missingSince: "2026-08-20T00:00:00.000Z" })]);
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
  });

  it("says the catalogue is loading before the first page lands", () => {
    captured.response = undefined;
    render(<PlayloltcgCatalogPage />);
    expect(screen.getByText("Loading the catalogue…")).toBeInTheDocument();
  });
});
