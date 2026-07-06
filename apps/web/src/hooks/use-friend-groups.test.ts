import type { QueryClient } from "@tanstack/react-query";
import type { ParsedLocation } from "@tanstack/react-router";
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

import { ensureFriendGroupDetailCanonical } from "./use-friend-groups";

function fakeQueryClient(canonicalSlug: string): QueryClient {
  return {
    ensureQueryData: vi.fn(() => Promise.resolve({ group: { slug: canonicalSlug } })),
  } as unknown as QueryClient;
}

const location = { href: "/groups/old-slug/trades?filter=open" } as ParsedLocation;

describe("ensureFriendGroupDetailCanonical", () => {
  it("returns the detail when the requested slug is canonical", async () => {
    const detail = await ensureFriendGroupDetailCanonical({
      queryClient: fakeQueryClient("old-slug"),
      userId: "user-1",
      slug: "old-slug",
      location,
    });
    expect(detail.group.slug).toBe("old-slug");
  });

  it("redirects to the canonical slug, preserving sub-path and search", async () => {
    let thrown: unknown;
    try {
      await ensureFriendGroupDetailCanonical({
        queryClient: fakeQueryClient("new-slug"),
        userId: "user-1",
        slug: "old-slug",
        location,
      });
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    const redirectError = thrown as { options: { href?: string; replace?: boolean } };
    expect(redirectError.options.href).toBe("/groups/new-slug/trades?filter=open");
    expect(redirectError.options.replace).toBe(true);
  });
});
