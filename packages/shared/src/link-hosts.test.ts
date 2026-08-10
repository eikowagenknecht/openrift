import { describe, expect, it } from "vitest";

import { isAllowedLinkUrl, linkHostLabel, resolveLinkHost } from "./link-hosts.js";

describe("resolveLinkHost", () => {
  it("resolves the allowlisted hosts", () => {
    expect(resolveLinkHost("https://www.youtube.com/watch?v=abc123")).toEqual({
      label: "YouTube",
      kind: "video",
    });
    expect(resolveLinkHost("https://youtu.be/abc123")?.kind).toBe("video");
    expect(resolveLinkHost("https://riftmana.com/deck/1")?.label).toBe("RiftMana");
    expect(resolveLinkHost("https://topdeck.gg/event/1")?.label).toBe("TopDeck.gg");
    expect(resolveLinkHost("https://metafy.gg/@coach")?.label).toBe("Metafy");
    expect(resolveLinkHost("https://discord.gg/abc")?.label).toBe("Discord");
    expect(resolveLinkHost("https://x.com/someone/status/1")?.label).toBe("X");
  });

  it("treats a www. prefix as the same site", () => {
    expect(resolveLinkHost("https://www.riftmana.com/deck/1")?.label).toBe("RiftMana");
  });

  it("matches hosts case-insensitively", () => {
    expect(resolveLinkHost("https://YouTu.be/abc123")?.label).toBe("YouTube");
  });

  it("rejects hosts outside the allowlist", () => {
    expect(resolveLinkHost("https://example.com/deck")).toBeNull();
    expect(resolveLinkHost("https://vimeo.com/12345")).toBeNull();
  });

  it("rejects lookalike hosts that merely start with an allowlisted one", () => {
    expect(resolveLinkHost("https://youtube.com.evil.test/watch")).toBeNull();
    expect(resolveLinkHost("https://www.youtube.com.evil.test/watch")).toBeNull();
    expect(resolveLinkHost("https://notyoutube.com/watch")).toBeNull();
  });

  it("rejects anything that isn't a well-formed https URL", () => {
    expect(resolveLinkHost("http://www.youtube.com/watch?v=abc123")).toBeNull();
    // oxlint-disable-next-line no-script-url -- the point of the case is that this scheme is rejected
    expect(resolveLinkHost("javascript:alert(1)")).toBeNull();
    expect(resolveLinkHost("not a url")).toBeNull();
    expect(resolveLinkHost("")).toBeNull();
  });
});

describe("isAllowedLinkUrl", () => {
  it("mirrors resolveLinkHost as a boolean", () => {
    expect(isAllowedLinkUrl("https://youtu.be/abc123")).toBe(true);
    expect(isAllowedLinkUrl("https://example.com")).toBe(false);
  });
});

describe("linkHostLabel", () => {
  it("names the site for a titleless link", () => {
    expect(linkHostLabel("https://piltoverarchive.com/card/1")).toBe("Piltover Archive");
  });

  it("returns null for a host we don't allow", () => {
    expect(linkHostLabel("https://example.com")).toBeNull();
  });
});
