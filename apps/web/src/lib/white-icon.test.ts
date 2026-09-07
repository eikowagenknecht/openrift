import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

interface ImageState {
  outcome: "load" | "error";
  naturalWidth: number;
  naturalHeight: number;
}

const state: ImageState = { outcome: "load", naturalWidth: 32, naturalHeight: 16 };
const constructed: string[] = [];

class FakeImage {
  naturalWidth = state.naturalWidth;
  naturalHeight = state.naturalHeight;
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
    constructed.push(value);
    globalThis.setTimeout(() => this.listeners.get(state.outcome)?.(), 0);
  }
}

const drawImage = vi.fn();
const fillRect = vi.fn();
let context: object | null;
let dataUrl: () => string;

async function loadModule() {
  vi.resetModules();
  return await import("./white-icon");
}

beforeEach(() => {
  state.outcome = "load";
  state.naturalWidth = 32;
  state.naturalHeight = 16;
  constructed.length = 0;
  drawImage.mockClear();
  fillRect.mockClear();
  context = { drawImage, fillRect, globalCompositeOperation: "", fillStyle: "" };
  dataUrl = () => "data:image/png;base64,TINTED";
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => dataUrl());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prewarmTintedIcons", () => {
  it("caches a tinted data URL per source and color", async () => {
    const { getCachedTintedIcon, prewarmTintedIcons, TINT_BLACK, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([
      { src: "/icons/might.svg", color: TINT_WHITE },
      { src: "/icons/might.svg", color: TINT_BLACK },
    ]);

    expect(getCachedTintedIcon("/icons/might.svg", TINT_WHITE)).toBe(
      "data:image/png;base64,TINTED",
    );
    expect(getCachedTintedIcon("/icons/might.svg", TINT_BLACK)).toBe(
      "data:image/png;base64,TINTED",
    );
    expect(constructed).toEqual(["/icons/might.svg", "/icons/might.svg"]);
  });

  it("paints the source-in fill over the drawn icon at its natural size", async () => {
    const { prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]);

    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 32, 16);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 32, 16);
    expect(context).toMatchObject({ globalCompositeOperation: "source-in", fillStyle: TINT_WHITE });
  });

  it("falls back to a 64px square for an image with no intrinsic size", async () => {
    state.naturalWidth = 0;
    state.naturalHeight = 0;
    const { prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]);

    expect(fillRect).toHaveBeenCalledWith(0, 0, 64, 64);
  });

  it("loads each source once when the same icon is prewarmed twice", async () => {
    const { prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([
      { src: "/icons/might.svg", color: TINT_WHITE },
      { src: "/icons/might.svg", color: TINT_WHITE },
    ]);
    await prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]);

    expect(constructed).toEqual(["/icons/might.svg"]);
  });

  it("caches nothing when the image fails to load", async () => {
    state.outcome = "error";
    const { getCachedTintedIcon, prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]);

    expect(getCachedTintedIcon("/icons/might.svg", TINT_WHITE)).toBeUndefined();
  });

  it("caches nothing when the canvas has no 2d context", async () => {
    context = null;
    const { getCachedTintedIcon, prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]);

    expect(getCachedTintedIcon("/icons/might.svg", TINT_WHITE)).toBeUndefined();
  });

  it("caches nothing when the canvas is tainted", async () => {
    dataUrl = () => {
      throw new Error("SecurityError");
    };
    const { getCachedTintedIcon, prewarmTintedIcons, TINT_WHITE } = await loadModule();

    await expect(
      prewarmTintedIcons([{ src: "/icons/might.svg", color: TINT_WHITE }]),
    ).resolves.toBeUndefined();
    expect(getCachedTintedIcon("/icons/might.svg", TINT_WHITE)).toBeUndefined();
  });

  it("resolves without loading anything for an empty icon list", async () => {
    const { prewarmTintedIcons } = await loadModule();

    await prewarmTintedIcons([]);

    expect(constructed).toEqual([]);
  });
});

describe("getCachedTintedIcon", () => {
  it("returns undefined before the icon is prewarmed", async () => {
    const { getCachedTintedIcon, TINT_WHITE } = await loadModule();

    expect(getCachedTintedIcon("/icons/might.svg", TINT_WHITE)).toBeUndefined();
  });
});
