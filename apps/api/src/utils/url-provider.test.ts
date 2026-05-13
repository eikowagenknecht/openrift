import { describe, expect, it } from "vitest";

import { urlToProvider } from "./url-provider.js";

describe("urlToProvider", () => {
  it("strips subdomains and TLD from common image hosts", () => {
    expect(urlToProvider("https://i.imgur.com/foo.png")).toBe("imgur");
    expect(urlToProvider("https://images.tcgplayer.com/x.jpg")).toBe("tcgplayer");
    expect(urlToProvider("https://www.reddit.com/r/x.png")).toBe("reddit");
    expect(urlToProvider("https://foo.bar.example.com/x")).toBe("example");
  });

  it("handles bare two-label hostnames", () => {
    expect(urlToProvider("https://imgur.com/foo.png")).toBe("imgur");
  });

  it("handles single-label hostnames", () => {
    expect(urlToProvider("http://localhost:3000/x")).toBe("localhost");
  });

  it("falls back to 'manual' for invalid URLs", () => {
    expect(urlToProvider("not a url")).toBe("manual");
    expect(urlToProvider("")).toBe("manual");
  });
});
