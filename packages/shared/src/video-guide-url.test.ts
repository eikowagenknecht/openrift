import { describe, expect, it } from "vitest";

import { isVideoGuideUrl } from "./video-guide-url.js";

describe("isVideoGuideUrl", () => {
  it("accepts https YouTube links", () => {
    expect(isVideoGuideUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isVideoGuideUrl("https://youtu.be/abc123")).toBe(true);
    expect(isVideoGuideUrl("https://m.youtube.com/watch?v=abc123")).toBe(true);
    expect(isVideoGuideUrl("https://youtube.com/watch?v=abc123")).toBe(true);
  });

  it("rejects other hosts", () => {
    expect(isVideoGuideUrl("https://example.com/watch?v=abc123")).toBe(false);
    expect(isVideoGuideUrl("https://youtube.com.evil.example/watch")).toBe(false);
    expect(isVideoGuideUrl("https://vimeo.com/12345")).toBe(false);
  });

  it("rejects non-https and malformed input", () => {
    expect(isVideoGuideUrl("http://www.youtube.com/watch?v=abc123")).toBe(false);
    // oxlint-disable-next-line no-script-url -- asserting the validator rejects script URLs
    expect(isVideoGuideUrl("javascript:alert(1)")).toBe(false);
    expect(isVideoGuideUrl("not a url")).toBe(false);
    expect(isVideoGuideUrl("")).toBe(false);
  });
});
