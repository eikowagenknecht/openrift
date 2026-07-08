import { describe, expect, it, vi } from "vitest";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias
import { AppError } from "../errors.js";
import {
  assertCandidatePrintingsInScope,
  assertProvidersInScope,
  assertSomeProviderInScope,
  reviewableProviderScope,
} from "./card-review-scope.js";

function mockProviderSettings(reviewable: string[]) {
  return {
    helperReviewableProviders: vi.fn().mockResolvedValue(new Set(reviewable)),
  } as any;
}

describe("reviewableProviderScope", () => {
  it("returns null (unscoped) for full admins without querying providers", async () => {
    const repo = mockProviderSettings(["gallery"]);
    const scope = await reviewableProviderScope({ isAdmin: true, sections: [] }, repo);
    expect(scope).toBeNull();
    expect(repo.helperReviewableProviders).not.toHaveBeenCalled();
  });

  it("returns the helper-reviewable set for grant holders", async () => {
    const repo = mockProviderSettings(["gallery"]);
    const scope = await reviewableProviderScope(
      { isAdmin: false, sections: ["card-review"] },
      repo,
    );
    expect(scope).toEqual(new Set(["gallery"]));
  });

  it("fails closed when access is missing", async () => {
    const scope = await reviewableProviderScope(null, mockProviderSettings([]));
    expect(scope).toEqual(new Set());
  });
});

describe("assertProvidersInScope", () => {
  it("passes everything when scope is null", () => {
    expect(() => assertProvidersInScope(["anything"], null)).not.toThrow();
  });

  it("passes providers inside the scope", () => {
    expect(() => assertProvidersInScope(["gallery"], new Set(["gallery"]))).not.toThrow();
  });

  it("throws 403 for a provider outside the scope", () => {
    expect(() => assertProvidersInScope(["gallery", "ocr"], new Set(["gallery"]))).toThrow(
      AppError,
    );
    try {
      assertProvidersInScope(["ocr"], new Set(["gallery"]));
      expect.unreachable("Should have thrown");
    } catch (error: any) {
      expect(error.status).toBe(403);
    }
  });
});

describe("assertSomeProviderInScope", () => {
  it("passes when scope is null", () => {
    expect(() => assertSomeProviderInScope([], null)).not.toThrow();
  });

  it("passes when at least one provider is in scope", () => {
    expect(() => assertSomeProviderInScope(["ocr", "gallery"], new Set(["gallery"]))).not.toThrow();
  });

  it("throws 403 when no provider is in scope, including the empty list", () => {
    expect(() => assertSomeProviderInScope(["ocr"], new Set(["gallery"]))).toThrow(AppError);
    expect(() => assertSomeProviderInScope([], new Set(["gallery"]))).toThrow(AppError);
  });
});

describe("assertCandidatePrintingsInScope", () => {
  function mockCandidateCards(rows: { id: string; provider: string }[]) {
    return {
      providersForCandidatePrintings: vi.fn().mockResolvedValue(rows),
    } as any;
  }

  it("skips the lookup entirely when scope is null", async () => {
    const repo = mockCandidateCards([]);
    await assertCandidatePrintingsInScope(repo, ["cp-1"], null);
    expect(repo.providersForCandidatePrintings).not.toHaveBeenCalled();
  });

  it("passes when all candidate printings belong to allowed providers", async () => {
    const repo = mockCandidateCards([{ id: "cp-1", provider: "gallery" }]);
    await expect(
      assertCandidatePrintingsInScope(repo, ["cp-1"], new Set(["gallery"])),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when any candidate printing belongs to a disallowed provider", async () => {
    const repo = mockCandidateCards([
      { id: "cp-1", provider: "gallery" },
      { id: "cp-2", provider: "ocr" },
    ]);
    await expect(
      assertCandidatePrintingsInScope(repo, ["cp-1", "cp-2"], new Set(["gallery"])),
    ).rejects.toThrow(AppError);
  });

  it("lets unknown ids fall through (handler's own 404 applies)", async () => {
    const repo = mockCandidateCards([]);
    await expect(
      assertCandidatePrintingsInScope(repo, ["missing"], new Set(["gallery"])),
    ).resolves.toBeUndefined();
  });
});
