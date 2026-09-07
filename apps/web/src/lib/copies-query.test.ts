import type { CopyResponse } from "@openrift/shared/types/api/collection";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubCopy } from "@/test/factories";

import { copiesQueryOptions, fetchCopies } from "./copies-query";

function makeCopy(id: string): CopyResponse {
  return stubCopy({ id, printingId: `print-${id}`, collectionId: "col-1" });
}

// The oRPC OpenAPI client may call fetch with a Request object or a (url, init) pair.
function fetchedUrl(call: unknown[]): string {
  const first = call[0];
  return first instanceof Request ? first.url : String(first);
}

describe("copiesQueryOptions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a single page when the server returns no nextCursor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [makeCopy("a"), makeCopy("b")], nextCursor: null }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchCopies();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedUrl(fetchMock.mock.calls[0]!)).toContain("/api/v1/copies");
    expect(response.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(response.nextCursor).toBeNull();
  });

  it("follows nextCursor across pages and concatenates items", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { items: [makeCopy("a"), makeCopy("b")], nextCursor: "cur-1" },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [makeCopy("c")], nextCursor: "cur-2" }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [makeCopy("d")], nextCursor: null }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchCopies();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchedUrl(fetchMock.mock.calls[1]!)).toContain("cursor=cur-1");
    expect(fetchedUrl(fetchMock.mock.calls[2]!)).toContain("cursor=cur-2");
    expect(response.items.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(response.nextCursor).toBeNull();
  });

  it("targets the per-collection endpoint when a collectionId is supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ items: [makeCopy("a")], nextCursor: null }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    // oRPC percent-encodes path params, so the slash/space survive as %2F/%20.
    await fetchCopies("col/with spaces");

    expect(fetchedUrl(fetchMock.mock.calls[0]!)).toContain(
      "/api/v1/collections/col%2Fwith%20spaces/copies",
    );
  });

  it("throws when the server responds with a non-ok status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCopies()).rejects.toThrow();
  });

  it("uses distinct query keys for the global and per-collection variants", () => {
    const globalKey = copiesQueryOptions("user-1").queryKey;
    const scopedKey = copiesQueryOptions("user-1", "col-1").queryKey;
    expect(globalKey).not.toEqual(scopedKey);
  });

  it("isolates query keys across users", () => {
    const aliceKey = copiesQueryOptions("alice").queryKey;
    const bobKey = copiesQueryOptions("bob").queryKey;
    expect(aliceKey).not.toEqual(bobKey);
  });
});
