import { siReddit, siX, siYoutube } from "simple-icons";
import { describe, expect, it } from "vitest";

import { sourceBrand } from "./source-brand";

describe("sourceBrand", () => {
  it("resolves a plain host", () => {
    expect(sourceBrand("https://youtube.com/watch?v=abc")).toBe(siYoutube);
  });

  it("resolves any subdomain of a known host", () => {
    expect(sourceBrand("https://www.youtube.com/watch?v=abc")).toBe(siYoutube);
    expect(sourceBrand("https://m.youtube.com/watch?v=abc")).toBe(siYoutube);
    expect(sourceBrand("https://old.reddit.com/r/Riftbound/comments/1")).toBe(siReddit);
  });

  it("resolves a platform's own shortener", () => {
    expect(sourceBrand("https://youtu.be/abc?t=252")).toBe(siYoutube);
  });

  it("maps both Twitter hosts to the X mark", () => {
    expect(sourceBrand("https://x.com/riotgames/status/1")).toBe(siX);
    expect(sourceBrand("https://twitter.com/riotgames/status/1")).toBe(siX);
  });

  it("ignores host casing", () => {
    expect(sourceBrand("https://WWW.YouTube.COM/watch?v=abc")).toBe(siYoutube);
  });

  it("does not match a host that merely ends with a brand's name", () => {
    expect(sourceBrand("https://notyoutube.com/watch?v=abc")).toBeUndefined();
    expect(sourceBrand("https://myyoutube.com/watch?v=abc")).toBeUndefined();
  });

  it("returns undefined for an unknown host", () => {
    expect(sourceBrand("https://example.test/some/page")).toBeUndefined();
  });

  it("returns undefined for a citation with no link", () => {
    expect(sourceBrand(null)).toBeUndefined();
    expect(sourceBrand(undefined)).toBeUndefined();
    expect(sourceBrand("")).toBeUndefined();
  });

  it("returns undefined rather than throwing on an unparseable value", () => {
    expect(sourceBrand("not a url")).toBeUndefined();
    expect(sourceBrand("youtube.com/watch?v=abc")).toBeUndefined();
  });
});
