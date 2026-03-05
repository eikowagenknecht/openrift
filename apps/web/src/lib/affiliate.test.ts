import { describe, expect, it } from "vitest";

import { affiliateUrl } from "./affiliate";

describe("affiliateUrl", () => {
  it("wraps a URL with the affiliate base and encodes it", () => {
    const url = "https://www.tcgplayer.com/product/12345";
    const result = affiliateUrl(url);
    expect(result).toBe(`https://partner.tcgplayer.com/openrift?u=${encodeURIComponent(url)}`);
  });

  it("encodes special characters in the URL", () => {
    const url = "https://example.com/search?q=fire&page=1";
    const result = affiliateUrl(url);
    expect(result).toContain("u=https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dfire%26page%3D1");
  });
});
