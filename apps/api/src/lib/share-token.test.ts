import { describe, expect, it, vi } from "vitest";

import { generateShareToken, withUniqueShareToken } from "./share-token.js";

function uniqueViolation(constraintName?: string): Error {
  const error = new Error("duplicate key value violates unique constraint");
  Object.assign(error, { code: "23505", constraint_name: constraintName });
  return error;
}

describe("generateShareToken", () => {
  it("produces 12-char base62 tokens", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateShareToken()).toMatch(/^[A-Za-z0-9]{12}$/u);
    }
  });

  it("produces distinct tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateShareToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("withUniqueShareToken", () => {
  it("returns the callback result on first success", async () => {
    const attempt = vi.fn(async (token: string) => `stored:${token}`);
    const result = await withUniqueShareToken(attempt);
    expect(result).toMatch(/^stored:[A-Za-z0-9]{12}$/u);
    expect(attempt).toHaveBeenCalledOnce();
  });

  it("retries with a fresh token on a unique violation", async () => {
    const seen: string[] = [];
    const attempt = vi.fn(async (token: string) => {
      seen.push(token);
      if (seen.length === 1) {
        throw uniqueViolation();
      }
      return token;
    });
    const result = await withUniqueShareToken(attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(result).toBe(seen[1]);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("gives up after three unique violations", async () => {
    const attempt = vi.fn(async () => {
      throw uniqueViolation();
    });
    await expect(withUniqueShareToken(attempt)).rejects.toThrow("duplicate key");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("propagates non-unique-violation errors immediately", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("Not found");
    });
    await expect(withUniqueShareToken(attempt)).rejects.toThrow("Not found");
    expect(attempt).toHaveBeenCalledOnce();
  });

  describe("with a named constraint", () => {
    const options = { constraint: "decks_share_token_key" };

    it("retries a violation on that constraint", async () => {
      const seen: string[] = [];
      const attempt = vi.fn(async (token: string) => {
        seen.push(token);
        if (seen.length === 1) {
          throw uniqueViolation("decks_share_token_key");
        }
        return token;
      });
      const result = await withUniqueShareToken(attempt, options);
      expect(attempt).toHaveBeenCalledTimes(2);
      expect(result).toBe(seen[1]);
    });

    it("propagates a violation from another constraint immediately", async () => {
      const attempt = vi.fn(async () => {
        throw uniqueViolation("uq_meta_decks_source");
      });
      await expect(withUniqueShareToken(attempt, options)).rejects.toThrow("duplicate key");
      expect(attempt).toHaveBeenCalledOnce();
    });

    it("propagates a violation that names no constraint immediately", async () => {
      const attempt = vi.fn(async () => {
        throw uniqueViolation();
      });
      await expect(withUniqueShareToken(attempt, options)).rejects.toThrow("duplicate key");
      expect(attempt).toHaveBeenCalledOnce();
    });
  });
});
