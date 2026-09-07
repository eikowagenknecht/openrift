import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockFetch, mockIo, resetImageMocks } from "../../../../test/image-mocks.js";
import { downloadImage, isPrivateIp } from "./download.js";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetImageMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("downloadImage", () => {
  it("returns buffer and extension from content-type", async () => {
    const cases = [
      { contentType: "image/png", expected: ".png" },
      { contentType: "image/jpeg", expected: ".jpg" },
      { contentType: "image/jpg", expected: ".jpg" },
      { contentType: "image/webp", expected: ".webp" },
      { contentType: "image/avif", expected: ".avif" },
    ];
    for (const { contentType, expected } of cases) {
      mockFetch.mockResolvedValueOnce(
        new Response(Buffer.from("d"), { headers: { "content-type": contentType } }),
      );
      const result = await downloadImage(mockIo, "https://example.com/img");
      expect(result.ext).toBe(expected);
      expect(result.buffer).toBeInstanceOf(Buffer);
    }
  });

  it("falls back to URL extension", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage(mockIo, "https://example.com/img.gif");
    expect(ext).toBe(".gif");
  });

  it("defaults to .png when no extension info", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage(mockIo, "https://example.com/image");
    expect(ext).toBe(".png");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(downloadImage(mockIo, "https://example.com/x")).rejects.toThrow(
      "Download failed (404)",
    );
  });

  it("handles content-type with extra params (charset)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(Buffer.from("d"), { headers: { "content-type": "image/png; charset=utf-8" } }),
    );
    const { ext } = await downloadImage(mockIo, "https://example.com/img");
    expect(ext).toBe(".png");
  });

  it("throws on 500 server error", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(downloadImage(mockIo, "https://example.com/x")).rejects.toThrow(
      "Download failed (500)",
    );
  });

  it("blocks hosts that resolve to a private address", async () => {
    const io = { ...mockIo, dnsLookupAll: async () => [{ address: "10.0.0.5" }] };
    await expect(downloadImage(io, "https://internal.example/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks hosts where any resolved address is private", async () => {
    const io = {
      ...mockIo,
      dnsLookupAll: async () => [{ address: "203.0.113.10" }, { address: "127.0.0.1" }],
    };
    await expect(downloadImage(io, "https://mixed.example/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
  });

  it("blocks private IP literals without a DNS lookup", async () => {
    const lookupSpy = vi.fn();
    const io = { ...mockIo, dnsLookupAll: lookupSpy };
    await expect(downloadImage(io, "https://169.254.169.254/meta")).rejects.toThrow(
      "Blocked download (private address)",
    );
    await expect(downloadImage(io, "https://[::1]/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(downloadImage(mockIo, "file:///etc/passwd")).rejects.toThrow(
      "Blocked download (unsupported protocol",
    );
  });

  it("re-checks every redirect hop and blocks redirects to private addresses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://127.0.0.1/steal" } }),
    );
    await expect(downloadImage(mockIo, "https://public.example/img")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("follows public redirects and returns the target's body", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://cdn.example/real.png" } }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("img"), { headers: { "content-type": "image/png" } }),
      );
    const { ext } = await downloadImage(mockIo, "https://public.example/img");
    expect(ext).toBe(".png");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after too many redirects", async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://public.example/loop" } }),
    );
    await expect(downloadImage(mockIo, "https://public.example/img")).rejects.toThrow(
      "too many redirects",
    );
  });
});

describe("isPrivateIp", () => {
  it("flags loopback, private, link-local, CGNAT, and multicast ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "fe80::1%eth0",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("passes public addresses", () => {
    for (const ip of ["203.0.113.10", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "1.1.1.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});
