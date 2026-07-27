import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { gravatarUrlFromHash, useGravatarHash } from "./gravatar";

describe("gravatarUrlFromHash", () => {
  it("builds a URL with the default size and error fallback", () => {
    expect(gravatarUrlFromHash("abc123")).toBe("https://gravatar.com/avatar/abc123?s=80&d=404");
  });

  it("accepts a custom size", () => {
    expect(gravatarUrlFromHash("abc123", 200)).toBe(
      "https://gravatar.com/avatar/abc123?s=200&d=404",
    );
  });

  it("builds a URL for an empty hash", () => {
    expect(gravatarUrlFromHash("")).toBe("https://gravatar.com/avatar/?s=80&d=404");
  });
});

describe("useGravatarHash", () => {
  it("resolves to the sha256 hex digest of the trimmed, lowercased email", async () => {
    const { result } = renderHook(() => useGravatarHash("  Test@Example.com  "));

    expect(result.current).toBeUndefined();

    await waitFor(() => {
      expect(result.current).toBe(
        "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
      );
    });
  });

  it("returns undefined when email is undefined", () => {
    const { result } = renderHook(() => useGravatarHash(undefined));

    expect(result.current).toBeUndefined();
  });

  it("recomputes the hash when the email changes", async () => {
    const { result, rerender } = renderHook(({ email }) => useGravatarHash(email), {
      initialProps: { email: "a@example.com" },
    });

    await waitFor(() => expect(result.current).toBeDefined());
    const first = result.current;

    rerender({ email: "b@example.com" });

    await waitFor(() => expect(result.current).not.toBe(first));
  });

  it("does not update state after unmount", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
    const { unmount } = renderHook(() => useGravatarHash("a@example.com"));

    unmount();
    // oxlint-disable-next-line promise/avoid-new -- wrapping the setTimeout callback API to await a delay
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(errors).toHaveLength(0);
    spy.mockRestore();
  });
});
