import type { ListBulkAddResponse, ListResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler:
        (fn: (args: { context: { cookie: string }; data: unknown }) => unknown) =>
        (args?: { data?: unknown }) =>
          fn({ context: { cookie: "" }, data: args?.data }),
      middleware: () => chain,
      inputValidator: () => chain,
    };
    return chain;
  },
  createMiddleware: () => {
    const chain = { server: () => chain };
    return chain;
  },
}));

const fetchApiJsonMock = vi.fn();
const fetchApiMock = vi.fn();

vi.mock("@/lib/server-fns/fetch-api", () => ({
  fetchApi: fetchApiMock,
  fetchApiJson: fetchApiJsonMock,
}));

vi.mock("@/lib/server-fns/middleware", () => ({
  withCookies: () => {},
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "test-user-id",
  useUserId: () => "test-user-id",
}));

const {
  useBulkAddListEntries,
  useCreateList,
  useDeleteList,
  useRemoveListEntry,
  useUpdateList,
  useUpdateListEntry,
} = await import("./use-lists");

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
};

describe("useCreateList", () => {
  it("invalidates both the un-filtered and intent-filtered list keys", async () => {
    fetchApiJsonMock.mockResolvedValueOnce(LIST);
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
    fetchApiJsonMock.mockResolvedValueOnce({ ...LIST, name: "Renamed" });
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
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
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
    fetchApiJsonMock.mockResolvedValueOnce(response);
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
    fetchApiJsonMock.mockResolvedValueOnce({
      id: "le-1",
      listId: "lst-1",
      kind: "card",
      cardId: "card-1",
      quantity: 3,
    });
    const { client, invalidateSpy } = makeClient();
    const { result } = renderHook(() => useUpdateListEntry(), { wrapper: wrap(client) });

    await act(async () => {
      await result.current.mutateAsync({ listId: "lst-1", entryId: "le-1", quantity: 3 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchApiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/api/v1/lists/lst-1/entries/le-1",
        body: { quantity: 3 },
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["lists", "test-user-id", "lst-1"],
    });
  });
});

describe("useRemoveListEntry", () => {
  it("invalidates list and detail on success", async () => {
    fetchApiMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
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
