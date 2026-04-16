import type { CopyResponse } from "@openrift/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copiesQueryOptions, fetchCopies } from "./copies-query";

function makeCopy(id: string): CopyResponse {
  return {
    id,
    printingId: `print-${id}`,
    collectionId: "col-1",
  };
}

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("copiesQueryOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a single page when the server returns no nextCursor", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({
        items: [makeCopy("a"), makeCopy("b")],
        nextCursor: null,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchCopies();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/copies");
    expect(response.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(response.nextCursor).toBeNull();
  });

  it("follows nextCursor across pages and concatenates items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({ items: [makeCopy("a"), makeCopy("b")], nextCursor: "cur-1" }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ items: [makeCopy("c")], nextCursor: "cur-2" }))
      .mockResolvedValueOnce(mockJsonResponse({ items: [makeCopy("d")], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchCopies();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/copies");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/copies?cursor=cur-1");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/v1/copies?cursor=cur-2");
    expect(response.items.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(response.nextCursor).toBeNull();
  });

  it("targets the per-collection endpoint when a collectionId is supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ items: [makeCopy("a")], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCopies("col/with spaces");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/collections/col%2Fwith%20spaces/copies");
  });

  it("throws when the server responds with a non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockJsonResponse(undefined, false, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopies()).rejects.toThrow("Copies fetch failed: 401");
  });

  it("uses distinct query keys for the global and per-collection variants", () => {
    const globalKey = copiesQueryOptions().queryKey;
    const scopedKey = copiesQueryOptions("col-1").queryKey;
    expect(globalKey).not.toEqual(scopedKey);
  });
});
