import { afterEach, describe, expect, it, vi } from "vitest";

import { flattenTrackInfo, formatTrackValue, readCameraInfo } from "./camera-info";

/**
 * A fake video track. jsdom has no media stream implementation, and the point
 * of the reader is tolerating browsers that omit parts of the API, so each test
 * builds exactly the surface it wants to exercise.
 *
 * @returns The fake track, typed as the real one for the reader's benefit.
 */
function fakeTrack(track: Partial<MediaStreamTrack>): MediaStreamTrack {
  return { label: "", ...track } as MediaStreamTrack;
}

/**
 * A fake stream carrying the given video tracks.
 *
 * @returns The fake stream, typed as the real one.
 */
function fakeStream(tracks: MediaStreamTrack[]): MediaStream {
  return { getVideoTracks: () => tracks } as unknown as MediaStream;
}

/**
 * Install a fake `navigator.mediaDevices.enumerateDevices`.
 *
 * @returns Nothing.
 */
function stubEnumerateDevices(result: Promise<MediaDeviceInfo[]>): void {
  vi.stubGlobal("navigator", {
    mediaDevices: { enumerateDevices: () => result },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatTrackValue", () => {
  it("renders a numeric range with its step", () => {
    expect(formatTrackValue({ min: 1, max: 8, step: 0.1 })).toBe("1 to 8 (step 0.1)");
  });

  it("renders a range with no step", () => {
    expect(formatTrackValue({ min: 0, max: 1 })).toBe("0 to 1");
  });

  it("renders a half-open range without inventing a bound", () => {
    expect(formatTrackValue({ max: 4 })).toBe("? to 4");
  });

  it("joins an enumerated mode list", () => {
    expect(formatTrackValue(["none", "manual", "continuous"])).toBe("none, manual, continuous");
  });

  it("marks an empty list rather than rendering nothing", () => {
    expect(formatTrackValue([])).toBe("(none)");
  });

  it("renders scalars as text", () => {
    expect(formatTrackValue(1920)).toBe("1920");
    expect(formatTrackValue("environment")).toBe("environment");
    expect(formatTrackValue(false)).toBe("false");
    expect(formatTrackValue(null)).toBe("null");
  });

  it("falls back to JSON for an object that is not a range", () => {
    expect(formatTrackValue({ pan: true })).toBe('{"pan":true}');
  });
});

describe("flattenTrackInfo", () => {
  it("sorts entries by key", () => {
    expect(flattenTrackInfo({ width: 1920, height: 1080, aspectRatio: 1.77 })).toEqual([
      ["aspectRatio", "1.77"],
      ["height", "1080"],
      ["width", "1920"],
    ]);
  });

  it("drops undefined values but keeps false and null", () => {
    expect(flattenTrackInfo({ torch: false, zoom: undefined, deviceId: null })).toEqual([
      ["deviceId", "null"],
      ["torch", "false"],
    ]);
  });

  it("returns nothing for an undefined info object", () => {
    expect(flattenTrackInfo(undefined)).toEqual([]);
  });

  it("returns nothing for an empty info object", () => {
    expect(flattenTrackInfo({})).toEqual([]);
  });
});

describe("readCameraInfo", () => {
  it("reports the track label, settings, capabilities and devices", async () => {
    stubEnumerateDevices(
      Promise.resolve([
        { deviceId: "front-1", kind: "videoinput", label: "Front Camera" },
        { deviceId: "back-1", kind: "videoinput", label: "Back Ultra Wide Camera" },
        { deviceId: "mic-1", kind: "audioinput", label: "Microphone" },
      ] as MediaDeviceInfo[]),
    );
    const track = fakeTrack({
      label: "Back Ultra Wide Camera",
      getSettings: () => ({ width: 1920, height: 1080 }) as MediaTrackSettings,
      getCapabilities: () =>
        ({ zoom: { min: 1, max: 8, step: 0.1 } }) as unknown as MediaTrackCapabilities,
    });

    const info = await readCameraInfo(fakeStream([track]));

    expect(info?.label).toBe("Back Ultra Wide Camera");
    expect(info?.settings).toEqual([
      ["height", "1080"],
      ["width", "1920"],
    ]);
    expect(info?.capabilities).toEqual([["zoom", "1 to 8 (step 0.1)"]]);
    expect(info?.capabilitiesSupported).toBe(true);
    // Audio inputs are dropped; both cameras are kept, because deciding which
    // label means "back facing" is the thing being measured.
    expect(info?.devices).toEqual([
      { deviceId: "front-1", label: "Front Camera" },
      { deviceId: "back-1", label: "Back Ultra Wide Camera" },
    ]);
  });

  it("returns null when the stream has no video track", async () => {
    stubEnumerateDevices(Promise.resolve([]));
    expect(await readCameraInfo(fakeStream([]))).toBeNull();
  });

  it("reports capabilities as unsupported when the browser omits getCapabilities", async () => {
    stubEnumerateDevices(Promise.resolve([]));
    const track = fakeTrack({
      label: "camera2 0, facing back",
      getSettings: () => ({ width: 1280 }) as MediaTrackSettings,
    });

    const info = await readCameraInfo(fakeStream([track]));

    expect(info?.capabilitiesSupported).toBe(false);
    expect(info?.capabilities).toEqual([]);
    expect(info?.settings).toEqual([["width", "1280"]]);
  });

  it("survives a getCapabilities that throws", async () => {
    stubEnumerateDevices(Promise.resolve([]));
    const track = fakeTrack({
      getSettings: () => ({ width: 640 }) as MediaTrackSettings,
      getCapabilities: () => {
        throw new Error("not implemented");
      },
    });

    const info = await readCameraInfo(fakeStream([track]));

    // The call exists, so the browser claims support; it just produced nothing.
    expect(info?.capabilitiesSupported).toBe(true);
    expect(info?.capabilities).toEqual([]);
    expect(info?.settings).toEqual([["width", "640"]]);
  });

  it("survives a getSettings that throws", async () => {
    stubEnumerateDevices(Promise.resolve([]));
    const track = fakeTrack({
      getSettings: () => {
        throw new Error("nope");
      },
    });

    const info = await readCameraInfo(fakeStream([track]));

    expect(info?.settings).toEqual([]);
  });

  it("survives a rejected enumerateDevices", async () => {
    stubEnumerateDevices(Promise.reject(new Error("blocked")));
    const track = fakeTrack({
      label: "Back Camera",
      getSettings: () => ({ width: 1280 }) as MediaTrackSettings,
    });

    const info = await readCameraInfo(fakeStream([track]));

    expect(info?.devices).toEqual([]);
    expect(info?.label).toBe("Back Camera");
  });

  it("reports a missing label as null rather than an empty string", async () => {
    stubEnumerateDevices(Promise.resolve([]));
    const track = fakeTrack({ label: "", getSettings: () => ({}) as MediaTrackSettings });

    const info = await readCameraInfo(fakeStream([track]));

    expect(info?.label).toBeNull();
  });
});
