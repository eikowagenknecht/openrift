import { describe, expect, it } from "vitest";

import { resolveFallbackArt } from "./printing-presenters.js";

describe("resolveFallbackArt", () => {
  it("omits both fields for the auto default", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "auto", fallbackImageId: null })).toEqual({});
  });

  it("emits the mode alone when the substitute is suppressed", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "none", fallbackImageId: null })).toEqual({
      fallbackArtMode: "none",
    });
  });

  it("emits mode and image id together for a pin", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "pinned", fallbackImageId: "img-1" })).toEqual({
      fallbackArtMode: "pinned",
      fallbackImageId: "img-1",
    });
  });

  it("degrades a pin with no servable image to auto", () => {
    // The pinned file has no rehosted copy, so there is no id to send. Emitting
    // `pinned` without one would break the wire invariant the client relies on,
    // and emitting `none` would blank a printing whose art we do have.
    expect(resolveFallbackArt({ fallbackArtMode: "pinned", fallbackImageId: null })).toEqual({});
  });

  it("treats an unknown mode as auto", () => {
    expect(resolveFallbackArt({ fallbackArtMode: "future-mode", fallbackImageId: null })).toEqual(
      {},
    );
  });
});
