import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the decode canvas recorded, so the grey flatten can be asserted on. */
interface DecodeRecorder {
  canvases: number;
  fills: { style: string; width: number; height: number }[];
  drawn: number;
}

let recorder: DecodeRecorder;
let closed: number;

/**
 * Stand in for `document.createElement("canvas")`: jsdom has no 2D backend, so
 * a real canvas would answer `getContext` with null.
 */
function fakeCanvas(): HTMLCanvasElement {
  recorder.canvases++;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect(_x: number, _y: number, width: number, height: number) {
        recorder.fills.push({ style: this.fillStyle as string, width, height });
      },
      drawImage: () => {
        recorder.drawn++;
      },
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    }),
  };
  return canvas as unknown as HTMLCanvasElement;
}

function respondWith(response: { status: number; ok?: boolean }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        status: response.status,
        ok: response.ok ?? response.status < 400,
        blob: () => Promise.resolve(new Blob()),
      }),
    ),
  );
}

describe("fetchReference", () => {
  beforeEach(() => {
    // The canvas is cached in a module-level slot, so each test needs a fresh
    // copy of the module.
    vi.resetModules();
    recorder = { canvases: 0, fills: [], drawn: 0 };
    closed = 0;
    vi.spyOn(document, "createElement").mockImplementation(() => fakeCanvas());
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() =>
        Promise.resolve({
          width: 400,
          height: 560,
          close: () => {
            closed++;
          },
        }),
      ),
    );
    respondWith({ status: 200 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("flattens the render onto mid grey before reading it back", async () => {
    const { fetchReference } = await import("./scan-reference-image");

    const image = await fetchReference("card-key");

    expect(recorder.fills).toEqual([{ style: "rgb(128, 128, 128)", width: 400, height: 560 }]);
    expect(recorder.drawn).toBe(1);
    expect(image).toEqual({ data: expect.any(Uint8ClampedArray), width: 400, height: 560 });
    expect(closed).toBe(1);
  });

  it("reuses one canvas across fetches", async () => {
    const { fetchReference } = await import("./scan-reference-image");

    await fetchReference("first");
    await fetchReference("second");

    expect(recorder.canvases).toBe(1);
  });

  it("treats a 404 as a render that does not exist", async () => {
    const { fetchReference } = await import("./scan-reference-image");
    respondWith({ status: 404 });

    await expect(fetchReference("missing")).resolves.toBeNull();
  });

  it("throws on a transient failure so the session retries it", async () => {
    const { fetchReference } = await import("./scan-reference-image");
    respondWith({ status: 503 });

    await expect(fetchReference("flaky")).rejects.toThrow("status 503");
  });

  it("treats an undecodable asset as missing", async () => {
    const { fetchReference } = await import("./scan-reference-image");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.reject(new Error("bad image"))),
    );

    await expect(fetchReference("corrupt")).resolves.toBeNull();
  });
});
