import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithProgress } from "./fetch-progress";

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithProgress", () => {
  it("concatenates the streamed chunks in order", async () => {
    stubFetch(
      new Response(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), {
        headers: { "content-length": "3" },
      }),
    );

    const buffer = await fetchWithProgress("/model.bin");

    expect([...new Uint8Array(buffer)]).toEqual([1, 2, 3]);
  });

  it("reports the running byte count against the content-length", async () => {
    stubFetch(
      new Response(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), {
        headers: { "content-length": "3" },
      }),
    );
    const onProgress = vi.fn();

    await fetchWithProgress("/model.bin", onProgress);

    expect(onProgress.mock.calls).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it("reports a total of 0 for a compressed response", async () => {
    stubFetch(
      new Response(streamOf([new Uint8Array([1, 2, 3])]), {
        headers: { "content-length": "3", "content-encoding": "gzip" },
      }),
    );
    const onProgress = vi.fn();

    await fetchWithProgress("/model.bin", onProgress);

    expect(onProgress).toHaveBeenCalledWith(3, 0);
  });

  it("reports a total of 0 when the server sends no content-length", async () => {
    stubFetch(new Response(streamOf([new Uint8Array([1, 2, 3])])));
    const onProgress = vi.fn();

    await fetchWithProgress("/model.bin", onProgress);

    expect(onProgress).toHaveBeenCalledWith(3, 0);
  });

  it("streams without a progress callback", async () => {
    stubFetch(new Response(streamOf([new Uint8Array([7])])));

    const buffer = await fetchWithProgress("/model.bin");

    expect([...new Uint8Array(buffer)]).toEqual([7]);
  });

  it("returns an empty buffer for an empty stream", async () => {
    stubFetch(new Response(streamOf([])));
    const onProgress = vi.fn();

    const buffer = await fetchWithProgress("/model.bin", onProgress);

    expect(buffer.byteLength).toBe(0);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("falls back to arrayBuffer() when the response exposes no body", async () => {
    const bodyless = {
      ok: true,
      body: null,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([9, 9]).buffer),
    } as unknown as Response;
    stubFetch(bodyless);

    const buffer = await fetchWithProgress("/model.bin");

    expect([...new Uint8Array(buffer)]).toEqual([9, 9]);
  });

  it("throws with the url and status when the response is not ok", async () => {
    stubFetch(new Response("nope", { status: 404 }));

    await expect(fetchWithProgress("/model.bin")).rejects.toThrow(
      "/model.bin failed with status 404",
    );
  });

  it("throws the caller's hint instead of the generic message", async () => {
    stubFetch(new Response("nope", { status: 404 }));

    await expect(fetchWithProgress("/model.bin", undefined, "Model not installed")).rejects.toThrow(
      "Model not installed",
    );
  });
});
