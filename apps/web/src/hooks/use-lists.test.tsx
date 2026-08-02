import type { ListBulkAddResponse, ListDetailResponse, ListResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "@/lib/query-client";
import { PERSISTENT_ERROR_TOAST } from "@/lib/toast";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string }; data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ context: { cookie: "" }, data: args?.data }),
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "test-user-id",
  useUserId: () => "test-user-id",
  // Read by the shared mutation error reporter on a 401; none of these tests
  // fail with one, but the module-level import has to resolve.
  sessionQueryOptions: () => ({ queryKey: ["session"] }),
}));

const {
  useBulkAddListEntries,
  useCreateList,
  useDeleteList,
  useRemoveListEntry,
  useReorderLists,
  useUpdateList,
  useUpdateListEntry,
} = await import("./use-lists");

// The hooks call the API via the oRPC contract client, which hits global fetch.
function stubFetchJson(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubFetchNoContent() {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubFetchFailure() {
  const fetchMock = vi.fn().mockRejectedValue(new Error("Service unavailable"));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  return { client, invalidateSpy };
}

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const LIST: ListResponse = {
  id: "lst-1",
  name: "Wants",
  intent: "wish",
  kind: "card",
  entryCount: 0,
  isPublic: false,
  shareToken: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
  tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
  currency: null,
  hasRule: false,
};

const SECOND_LIST: ListResponse = { ...LIST, id: "lst-2", name: "Haves", intent: "trade" };

const DETAIL: ListDetailResponse = {
  list: { ...LIST, rules: [], ruleCombine: null },
  entries: [
    {
      kind: "card",
      id: "le-1",
      listId: "lst-1",
      cardId: "card-1",
      cardName: "Yasuo",
      quantity: 1,
      ruleQuantity: 0,
      source: "manual",
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCreateList", () => {
  it("invalidates both the un-filtered and intent-filtered list keys", async () => {
    stubFetchJson(LIST);
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useCreateList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ name: "Wants", intent: "wish", kind: "card" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "intent", "wish"],
    });
  });
});

describe("useUpdateList", () => {
  it("invalidates both list and detail keys", async () => {
    stubFetchJson({ ...LIST, name: "Renamed" });
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useUpdateList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ listId: "lst-1", name: "Renamed" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "lst-1"],
    });
  });
});

describe("useDeleteList", () => {
  it("invalidates the list key on success", async () => {
    stubFetchNoContent();
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useDeleteList(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync("lst-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
  });
});

describe("useBulkAddListEntries", () => {
  it("forwards entries to the bulk endpoint and reports added/updated/skipped", async () => {
    const response: ListBulkAddResponse = { added: 2, updated: 1, skipped: 1 };
    stubFetchJson(response);
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });

    await act(async () => {
      const data = await result.current.mutateAsync({
        listId: "lst-1",
        entries: [{ copyId: "c1" }, { copyId: "c2" }, { copyId: "c3" }, { copyId: "c4" }],
      });
      expect(data).toEqual(response);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "lst-1"],
    });
  });
});

describe("useUpdateListEntry", () => {
  it("PATCHes the entry with the new quantity and invalidates both keys", async () => {
    const fetchMock = stubFetchJson({
      id: "le-1",
      listId: "lst-1",
      kind: "card",
      cardId: "card-1",
      quantity: 3,
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
    });
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useUpdateListEntry(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ listId: "lst-1", entryId: "le-1", quantity: 3 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // oRPC sends a body-bearing PATCH as a Request object (path params land in
    // the URL, the rest in the JSON body).
    const [first] = fetchMock.mock.calls[0] as [
      Request | string,
      { method: string; body: string }?,
    ];
    const request = first instanceof Request ? first : null;
    expect(request).not.toBeNull();
    expect(request!.url).toBe("http://localhost:3000/api/v1/lists/lst-1/entries/le-1");
    expect(request!.method).toBe("PATCH");
    expect(await request!.json()).toEqual({ quantity: 3 });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "lst-1"],
    });
  });
});

// A hook that declares its own onError to roll an optimistic update back
// REPLACES the QueryClient's default mutation onError (react-query merges
// mutation options shallowly), so each of these rollbacks has to report the
// failure itself. Without that, the change silently reverts and the user is
// left thinking the click did nothing.
describe("optimistic rollbacks still report the failure", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // The app's real client, so the test proves the toast survives the default
  // handler being replaced rather than testing a bare QueryClient.
  function makeAppClient() {
    return createQueryClient();
  }

  it("useReorderLists restores the previous order and toasts", async () => {
    stubFetchFailure();
    const client = makeAppClient();
    const listsKey = ["lists", "test-user-id"];
    client.setQueryData(listsKey, { items: [LIST, SECOND_LIST] });
    const { result } = renderHook(() => useReorderLists(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current
        .mutateAsync({ intent: "wish", orderedIds: ["lst-2", "lst-1"] })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(listsKey)).toEqual({ items: [LIST, SECOND_LIST] });
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), PERSISTENT_ERROR_TOAST);
  });

  it("useBulkAddListEntries restores the previous quantities and toasts", async () => {
    stubFetchFailure();
    const client = makeAppClient();
    const detailKey = ["lists", "test-user-id", "lst-1"];
    client.setQueryData(detailKey, DETAIL);
    const { result } = renderHook(() => useBulkAddListEntries(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current
        .mutateAsync({ listId: "lst-1", entries: [{ cardId: "card-1", quantity: 2 }] })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<ListDetailResponse>(detailKey)?.entries[0].quantity).toBe(1);
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), PERSISTENT_ERROR_TOAST);
  });

  it("useUpdateListEntry restores the previous entry and toasts", async () => {
    stubFetchFailure();
    const client = makeAppClient();
    const detailKey = ["lists", "test-user-id", "lst-1"];
    client.setQueryData(detailKey, DETAIL);
    const { result } = renderHook(() => useUpdateListEntry(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current
        .mutateAsync({ listId: "lst-1", entryId: "le-1", quantity: 7 })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<ListDetailResponse>(detailKey)?.entries[0].quantity).toBe(1);
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), PERSISTENT_ERROR_TOAST);
  });
});

describe("useRemoveListEntry", () => {
  it("invalidates list and detail on success", async () => {
    stubFetchNoContent();
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useRemoveListEntry(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ listId: "lst-1", entryId: "le-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "lst-1"],
    });
  });
});
