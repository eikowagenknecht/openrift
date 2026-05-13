import { describe, expect, it } from "vitest";

import { hostSlugFromUrl } from "./host-slug.js";

describe("hostSlugFromUrl", () => {
  it("strips subdomains and TLD from common image hosts", () => {
    expect(hostSlugFromUrl("https://i.imgur.com/foo.png")).toBe("imgur");
    expect(hostSlugFromUrl("https://images.tcgplayer.com/x.jpg")).toBe("tcgplayer");
    expect(hostSlugFromUrl("https://www.reddit.com/r/x.png")).toBe("reddit");
    expect(hostSlugFromUrl("https://foo.bar.example.com/x")).toBe("example");
  });

  it("handles bare two-label hostnames", () => {
    expect(hostSlugFromUrl("https://imgur.com/foo.png")).toBe("imgur");
  });

  it("handles single-label hostnames", () => {
    expect(hostSlugFromUrl("http://localhost:3000/x")).toBe("localhost");
  });

  it("returns null for invalid URLs", () => {
    expect(hostSlugFromUrl("not a url")).toBeNull();
    expect(hostSlugFromUrl("")).toBeNull();
  });
});
