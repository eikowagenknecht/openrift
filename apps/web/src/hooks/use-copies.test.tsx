import {
  createCollection,
  createTransaction,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import type { Transaction } from "@tanstack/react-db";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { CopiesWriteCollection, CopyShapeRow } from "@/lib/copies-collection";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: () => async () => null,
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

// Controllable batcher: tests collect added items and flush on demand instead
// of waiting out the 300ms window.
const batcherState: { items: unknown[]; flush: (items: unknown[]) => void } = {
  items: [],
  flush: () => {},
};
vi.mock("@tanstack/react-pacer", () => ({
  useBatcher: (handler: (items: unknown[]) => void) => {
    batcherState.flush = handler;
    return {
      addItem: (item: unknown) => {
        batcherState.items.push(item);
      },
    };
  },
}));

// Fake offline executor: createOfflineTransaction mirrors the package's
// plain-Transaction fallback (a real TanStack DB transaction whose mutationFn
// is the named mutation function), which is exactly the surface the hooks
// rely on — mutate returns a transaction that accepts further mutate calls,
// commit runs the mutation function once with all collected mutations and
// rolls back on failure.
interface FakeExecutor {
  createOfflineTransaction: (options: { mutationFnName: string; autoCommit?: boolean }) => {
    mutate: (callback: () => void) => Transaction<CopyShapeRow>;
    commit: () => Promise<unknown>;
  };
  isOnline: () => boolean;
}

function createFakeExecutor(
  mutationFn: Mock<(params: { transaction: Transaction<CopyShapeRow> }) => Promise<void>>,
  online = true,
): FakeExecutor {
  return {
    isOnline: () => online,
    createOfflineTransaction: ({ mutationFnName }) => {
      let inner: Transaction<CopyShapeRow> | null = null;
      return {
        mutate: (callback: () => void) => {
          inner ??= createTransaction<CopyShapeRow>({
            autoCommit: false,
            metadata: { mutationFnName },
            mutationFn: async ({ transaction }) => {
              await mutationFn({ transaction });
            },
          });
          inner.mutate(callback);
          return inner;
        },
        commit: () => {
          if (!inner) {
            throw new Error("No mutations to commit");
          }
          return inner.commit();
        },
      };
    },
  };
}

// The mutation hooks read the writer and the view collection from this
// module; tests swap in fakes per-case.
const collectionMocks: {
  view: unknown;
  writer: unknown;
} = {
  view: null,
  writer: null,
};
vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => collectionMocks.view,
  useCopiesWriter: () => collectionMocks.writer,
}));

const { useAddCopies, useBatchedAddCopies, useDisposeCopies, useMoveCopies, useUpdateCopies } =
  await import("./use-copies");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function createRealWriteCollection(): CopiesWriteCollection {
  // A real TanStack DB collection so optimistic apply / rollback run for
  // real; localOnly stands in for the Electric collection.
  return createCollection(
    localOnlyCollectionOptions<CopyShapeRow>({
      id: `test-copies-write-${crypto.randomUUID()}`,
      getKey: (row) => row.id,
    }),
  ) as unknown as CopiesWriteCollection;
}

type FakeMutationFn = Mock<(params: { transaction: Transaction<CopyShapeRow> }) => Promise<void>>;

function makeWriter(options?: { online?: boolean; mutationFn?: FakeMutationFn }) {
  const mutationFn: FakeMutationFn = options?.mutationFn ?? vi.fn(async () => undefined);
  const collection = createRealWriteCollection();
  const executor = createFakeExecutor(mutationFn, options?.online ?? true);
  return { collection, executor, mutationFn };
}

beforeEach(() => {
  collectionMocks.view = null;
  collectionMocks.writer = null;
  batcherState.items = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Regression: useAddCopies (and friends) are wired into useQuickAddActions,
// which renders on the public /cards page. The hooks must tolerate a null
// session / null writer at mount; the mutation body itself guards.
describe("copies mutation hooks tolerate an unauthenticated session at mount", () => {
  it.each([
    ["useAddCopies", useAddCopies],
    ["useMoveCopies", useMoveCopies],
    ["useDisposeCopies", useDisposeCopies],
    ["useBatchedAddCopies", useBatchedAddCopies],
  ])("%s does not throw when no session is cached", (_name, hook) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => hook(), { wrapper: wrap(client) })).not.toThrow();
  });

  it("useUpdateCopies does not throw when no session is cached", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(() => renderHook(() => useUpdateCopies(), { wrapper: wrap(client) })).not.toThrow();
  });
});

describe("useAddCopies", () => {
  it("inserts rows with client-generated uuidv7 ids, commits one offline tx, and resolves with the ids", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    const added = await result.current.mutateAsync({
      copies: [{ printingId: "pr-1", collectionId: "col-1" }],
    });

    expect(added).toHaveLength(1);
    expect(added[0].id).toMatch(UUID_PATTERN);
    expect(added[0]).toMatchObject({ printingId: "pr-1", collectionId: "col-1" });
    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => mutation.modified)).toEqual([
      {
        id: added[0].id,
        printing_id: "pr-1",
        collection_id: "col-1",
        condition: null,
        grader: null,
        grade: null,
        notes_public: null,
        notes_private: null,
        is_altered: false,
        links: [],
      },
    ]);
  });

  it("carries per-copy metadata into the optimistic row (ADR-038 import path)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({
      copies: [{ printingId: "pr-1", collectionId: "col-1", condition: "near-mint" }],
    });

    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations[0].modified).toMatchObject({
      printing_id: "pr-1",
      condition: "near-mint",
      grader: null,
    });
  });

  it("keeps a caller-supplied id instead of generating one", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    const added = await result.current.mutateAsync({
      copies: [{ printingId: "pr-1", collectionId: "col-1", id: "given-id" }],
    });

    expect(added[0].id).toBe("given-id");
  });

  it("resolves as queued while offline — the outbox owns the write", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // mutationFn never resolves: nothing would dispatch while offline.
    const never = Promise.withResolvers<void>().promise;
    const pendingForever: FakeMutationFn = vi.fn(() => never);
    const writer = makeWriter({ online: false, mutationFn: pendingForever });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    const added = await result.current.mutateAsync({
      copies: [{ printingId: "pr-1", collectionId: "col-1" }],
    });

    expect(added).toHaveLength(1);
    // The optimistic row is applied even though the server never confirmed.
    expect(writer.collection.toArray.map((row) => row.id)).toContain(added[0].id);
  });

  it("rejects (and rolls back) when the mutation function fails permanently", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failing: FakeMutationFn = vi.fn(async () => {
      throw new Error("Forbidden");
    });
    const writer = makeWriter({ mutationFn: failing });
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });
    await expect(
      result.current.mutateAsync({ copies: [{ printingId: "pr-1", collectionId: "col-1" }] }),
    ).rejects.toThrow("Forbidden");
    expect(writer.collection.toArray).toHaveLength(0);
  });

  it("rejects when no writer exists (signed out)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAddCopies(), { wrapper: wrap(client) });

    await expect(
      result.current.mutateAsync({ copies: [{ printingId: "pr-1", collectionId: "col-1" }] }),
    ).rejects.toThrow("Cannot add copies while signed out");
  });
});

describe("useMoveCopies", () => {
  it("moves the targeted copies to the new collection inside one offline tx", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;
    // localOnly collections apply writes locally without a server handler,
    // so plain inserts seed the pre-move state.
    writer.collection.insert([
      { id: "a", collection_id: "old", printing_id: "pr-1" },
      { id: "b", collection_id: "old", printing_id: "pr-2" },
    ]);

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["a", "b"], toCollectionId: "col-new" });

    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(
      tx.mutations.map((mutation) => (mutation.modified as CopyShapeRow).collection_id),
    ).toEqual(["col-new", "col-new"]);
  });

  it("no-ops on an empty id list", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useMoveCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: [], toCollectionId: "col-new" });

    expect(writer.mutationFn).not.toHaveBeenCalled();
  });
});

describe("useDisposeCopies", () => {
  it("deletes the given ids inside one offline tx", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;
    writer.collection.insert([
      { id: "x", collection_id: "col-1", printing_id: "pr-1" },
      { id: "y", collection_id: "col-1", printing_id: "pr-2" },
    ]);

    const { result } = renderHook(() => useDisposeCopies(), { wrapper: wrap(client) });
    await result.current.mutateAsync({ copyIds: ["x", "y"] });

    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => String(mutation.key)).toSorted()).toEqual(["x", "y"]);
  });
});

describe("useBatchedAddCopies", () => {
  it("applies the optimistic row at click time, before the batch flushes", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBatchedAddCopies(), { wrapper: wrap(client) });
    const { id } = result.current.add("pr-1", "col-1");

    expect(writer.collection.toArray.map((row) => row.id)).toContain(id);
  });

  it("commits one transaction with every clicked row and resolves each add", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const writer = makeWriter();
    collectionMocks.writer = writer;

    const { result } = renderHook(() => useBatchedAddCopies(), { wrapper: wrap(client) });
    const first = result.current.add("pr-1", "col-1");
    const second = result.current.add("pr-2", "col-1");

    batcherState.flush(batcherState.items.splice(0));

    const [firstResult, secondResult] = await Promise.all([first.result, second.result]);
    expect(firstResult).toEqual({ id: first.id, printingId: "pr-1", collectionId: "col-1" });
    expect(secondResult).toEqual({ id: second.id, printingId: "pr-2", collectionId: "col-1" });

    expect(writer.mutationFn).toHaveBeenCalledTimes(1);
    const tx = writer.mutationFn.mock.calls[0][0].transaction;
    expect(tx.mutations.map((mutation) => String(mutation.key)).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    );
  });

  it("rolls back the optimistic rows and rejects every add when the batch fails permanently", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const failing: FakeMutationFn = vi.fn(async () => {
      throw new Error("server says no");
    });
    const writer = makeWriter({ mutationFn: failing });
    collectionMocks.writer = writer;

    const onBatchError = vi.fn();
    const { result } = renderHook(() => useBatchedAddCopies({ onBatchError }), {
      wrapper: wrap(client),
    });
    const { id, result: addResult } = result.current.add("pr-1", "col-1");
    expect(writer.collection.toArray.map((row) => row.id)).toContain(id);

    batcherState.flush(batcherState.items.splice(0));

    await expect(addResult).rejects.toThrow("server says no");
    await waitFor(() => {
      expect(writer.collection.toArray.map((row) => row.id)).not.toContain(id);
    });
    expect(onBatchError).toHaveBeenCalledTimes(1);
  });

  it("rejects adds that landed without a writer (signed out)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useBatchedAddCopies(), { wrapper: wrap(client) });

    const { result: addResult } = result.current.add("pr-1", "col-1");
    batcherState.flush(batcherState.items.splice(0));

    await expect(addResult).rejects.toThrow("Cannot add copies while signed out");
  });
});
