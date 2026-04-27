import { describe, expect, it } from "vitest";

import { MAX_DISPLAY_NAME_LENGTH, sanitizeDisplayName, validateDisplayName } from "./display-name";

describe("validateDisplayName", () => {
  it("accepts a simple ASCII name", () => {
    expect(validateDisplayName("Alice")).toEqual({ ok: true, value: "Alice" });
  });

  it("accepts hyphens, underscores, periods, digits, and spaces", () => {
    expect(validateDisplayName("Mary-Jane O.Connor_42")).toEqual({
      ok: true,
      value: "Mary-Jane O.Connor_42",
    });
  });

  it("accepts non-ASCII letters (umlauts, CJK, accents)", () => {
    expect(validateDisplayName("Müller")).toEqual({ ok: true, value: "Müller" });
    expect(validateDisplayName("田中太郎")).toEqual({ ok: true, value: "田中太郎" });
    expect(validateDisplayName("José")).toEqual({ ok: true, value: "José" });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateDisplayName("  Alice  ")).toEqual({ ok: true, value: "Alice" });
  });

  it("accepts a name at the maximum length", () => {
    const name = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("rejects an empty string", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, reason: "Name is required." });
  });

  it("rejects a whitespace-only string", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: false, reason: "Name is required." });
  });

  it("rejects a non-string", () => {
    expect(validateDisplayName(undefined)).toEqual({ ok: false, reason: "Name is required." });
    expect(validateDisplayName(null)).toEqual({ ok: false, reason: "Name is required." });
    expect(validateDisplayName(42)).toEqual({ ok: false, reason: "Name is required." });
  });

  it("rejects names longer than the maximum", () => {
    const name = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    const result = validateDisplayName(name);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("50");
    }
  });

  it("rejects HTML metacharacters", () => {
    expect(validateDisplayName("<script>")).toMatchObject({ ok: false });
    expect(validateDisplayName("Alice & Bob")).toMatchObject({ ok: false });
    expect(validateDisplayName('Alice"Bob')).toMatchObject({ ok: false });
  });

  it("rejects emoji", () => {
    expect(validateDisplayName("Alice 👋")).toMatchObject({ ok: false });
  });

  it("rejects control characters", () => {
    expect(validateDisplayName(`Alice${String.fromCodePoint(0)}Bob`)).toMatchObject({ ok: false });
    expect(validateDisplayName("Alice\nBob")).toMatchObject({ ok: false });
    expect(validateDisplayName("Alice\tBob")).toMatchObject({ ok: false });
  });

  it("rejects punctuation that isn't explicitly allowed", () => {
    expect(validateDisplayName("Alice!")).toMatchObject({ ok: false });
    expect(validateDisplayName("Alice@host")).toMatchObject({ ok: false });
    expect(validateDisplayName("Alice/Bob")).toMatchObject({ ok: false });
  });
});

describe("sanitizeDisplayName", () => {
  it("returns a clean ASCII name unchanged", () => {
    expect(sanitizeDisplayName("Alice", "fallback")).toBe("Alice");
  });

  it("preserves Unicode letters", () => {
    expect(sanitizeDisplayName("Müller", "fallback")).toBe("Müller");
    expect(sanitizeDisplayName("田中太郎", "fallback")).toBe("田中太郎");
  });

  it("strips emoji and other disallowed characters", () => {
    expect(sanitizeDisplayName("Alice 👋", "fallback")).toBe("Alice");
    expect(sanitizeDisplayName("<script>Alice</script>", "fallback")).toBe("scriptAlicescript");
    expect(sanitizeDisplayName("Mary & Jane", "fallback")).toBe("Mary Jane");
  });

  it("collapses repeated whitespace introduced by stripping", () => {
    expect(sanitizeDisplayName("Alice    Bob", "fallback")).toBe("Alice Bob");
    expect(sanitizeDisplayName("Mary 👋 👋 Jane", "fallback")).toBe("Mary Jane");
  });

  it("truncates to the maximum length", () => {
    const long = "a".repeat(100);
    expect(sanitizeDisplayName(long, "fallback")).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it("falls back when sanitization produces an empty string", () => {
    expect(sanitizeDisplayName("👋👋👋", "alice")).toBe("alice");
    expect(sanitizeDisplayName("", "alice")).toBe("alice");
    expect(sanitizeDisplayName("   ", "alice")).toBe("alice");
  });

  it("also sanitizes the fallback (so a bad fallback doesn't bypass the rules)", () => {
    expect(sanitizeDisplayName("", "alice@example.com")).toBe("aliceexample.com");
    expect(sanitizeDisplayName("", "a".repeat(100))).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it("falls back to 'User' when both input and fallback are unusable", () => {
    expect(sanitizeDisplayName("👋", "@@@")).toBe("User");
    expect(sanitizeDisplayName("", "")).toBe("User");
  });

  it("treats non-string input as empty and uses the fallback", () => {
    expect(sanitizeDisplayName(undefined, "alice")).toBe("alice");
    expect(sanitizeDisplayName(null, "alice")).toBe("alice");
    expect(sanitizeDisplayName(42, "alice")).toBe("alice");
  });
});
