import type { CollectionListResponse } from "@openrift/shared/types/api/collection";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (args: { context: { cookie: string } }) => unknown) => () =>
        fn({ context: { cookie: "session=1" } }),
      middleware: () => chain,
      validator: () => chain,
    };
    return chain;
  },
}));

vi.mock("@/lib/server-fns/middleware", () => ({ withCookies: {} }));

const list = vi.fn();

vi.mock("@/lib/server-fns/orpc-client", () => ({ apiOrpcClient: () => ({ list }) }));

const { collectionsKeys } = await import("./collections-query-keys");
const { collectionsQueryOptions } = await import("./collections-query");

const USER_ID = "00000000-0000-0000-0000-000000000001";

function response(items: CollectionListResponse["items"]): CollectionListResponse {
  return { items } as CollectionListResponse;
}

describe("collectionsQueryOptions", () => {
  it("keys the query by the signed-in user", () => {
    expect(collectionsQueryOptions(USER_ID).queryKey).toEqual(collectionsKeys.all(USER_ID));
  });

  it("gives two users separate cache entries", () => {
    const other = "00000000-0000-0000-0000-000000000002";
    expect(collectionsQueryOptions(USER_ID).queryKey).not.toEqual(
      collectionsQueryOptions(other).queryKey,
    );
  });

  it("hands subscribers the items rather than the envelope", () => {
    const items = [{ id: "collection-1" }] as CollectionListResponse["items"];
    expect(collectionsQueryOptions(USER_ID).select?.(response(items))).toBe(items);
  });

  it("selects an empty list without failing", () => {
    expect(collectionsQueryOptions(USER_ID).select?.(response([]))).toEqual([]);
  });

  it("holds the answer fresh for five minutes so a navigation refetches once", () => {
    expect(collectionsQueryOptions(USER_ID).staleTime).toBe(5 * 60 * 1000);
  });

  it("asks the API for the caller's collections", async () => {
    const items = [{ id: "collection-1" }] as CollectionListResponse["items"];
    list.mockResolvedValueOnce(response(items));
    const options = collectionsQueryOptions(USER_ID);
    await expect(
      options.queryFn?.({} as Parameters<NonNullable<typeof options.queryFn>>[0]),
    ).resolves.toEqual(response(items));
    expect(list).toHaveBeenCalledOnce();
  });
});
