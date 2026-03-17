import { describe, expect, it } from "vitest";

import { sanitizeRedirect } from "./utils";

describe("sanitizeRedirect", () => {
  it("returns undefined for undefined input", () => {
    expect(sanitizeRedirect()).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(sanitizeRedirect("")).toBeUndefined();
  });

  it("returns a valid relative path", () => {
    expect(sanitizeRedirect("/foo")).toBe("/foo");
  });

  it("returns root path", () => {
    expect(sanitizeRedirect("/")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeRedirect("//evil.com")).toBeUndefined();
  });

  it("rejects absolute URLs", () => {
    expect(sanitizeRedirect("http://evil.com")).toBeUndefined();
  });
});
