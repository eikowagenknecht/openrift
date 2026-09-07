import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

const state: { outcome: "load" | "error" | "never" } = { outcome: "load" };
const sources: string[] = [];

class FakeImage {
  private readonly listeners = new Map<string, Listener>();
  private source = "";

  addEventListener(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    sources.push(value);
    if (state.outcome === "never") {
      return;
    }
    globalThis.setTimeout(() => this.listeners.get(state.outcome)?.(), 0);
  }
}

const drawImage = vi.fn();
let context: object | null;

async function loadModule() {
  vi.resetModules();
  return await import("./pdf-logo");
}

beforeEach(() => {
  state.outcome = "load";
  sources.length = 0;
  drawImage.mockClear();
  context = { drawImage };
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,LOGO");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadLogoDataUrl", () => {
  it("rasters the logo SVG into a PNG data URL", async () => {
    const { loadLogoDataUrl } = await loadModule();

    await expect(loadLogoDataUrl()).resolves.toBe("data:image/png;base64,LOGO");
    expect(sources).toEqual(["/logo-color.svg"]);
  });

  it("draws the mark at 512 square", async () => {
    const { loadLogoDataUrl } = await loadModule();

    await loadLogoDataUrl();

    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 512, 512);
  });

  it("serves later calls from the cached raster without reloading the image", async () => {
    const { loadLogoDataUrl } = await loadModule();

    const first = await loadLogoDataUrl();
    const second = await loadLogoDataUrl();

    expect(second).toBe(first);
    expect(sources).toEqual(["/logo-color.svg"]);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("rejects when the image fails to load", async () => {
    state.outcome = "error";
    const { loadLogoDataUrl } = await loadModule();

    await expect(loadLogoDataUrl()).rejects.toThrow("Logo failed to load");
  });

  it("rejects once the load exceeds the timeout", async () => {
    state.outcome = "never";
    const { loadLogoDataUrl } = await loadModule();
    vi.useFakeTimers();

    const rejects = expect(loadLogoDataUrl()).rejects.toThrow("Logo load timed out");
    await vi.advanceTimersByTimeAsync(3000);

    await rejects;
  });

  it("does not time out a load that arrives in time", async () => {
    const { loadLogoDataUrl } = await loadModule();
    vi.useFakeTimers();

    const pending = loadLogoDataUrl();
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;
    await vi.advanceTimersByTimeAsync(5000);

    expect(result).toBe("data:image/png;base64,LOGO");
  });

  it("rejects when the canvas has no 2d context", async () => {
    context = null;
    const { loadLogoDataUrl } = await loadModule();

    await expect(loadLogoDataUrl()).rejects.toThrow("Failed to get canvas 2d context");
  });

  it("retries the load after a failure", async () => {
    state.outcome = "error";
    const { loadLogoDataUrl } = await loadModule();

    await expect(loadLogoDataUrl()).rejects.toThrow("Logo failed to load");
    state.outcome = "load";

    await expect(loadLogoDataUrl()).resolves.toBe("data:image/png;base64,LOGO");
  });
});
