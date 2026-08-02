import { ERROR_CODES } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import {
  assertDeleted,
  assertFound,
  assertSlugAvailable,
  assertUpdated,
  assertValidReorder,
} from "./assertions.js";

// ---------------------------------------------------------------------------
// assertFound
// ---------------------------------------------------------------------------

describe("assertFound", () => {
  it("does nothing when the value is defined", () => {
    expect(() => assertFound({ id: "1" }, "Not found")).not.toThrow();
  });

  it("does nothing for falsy-but-defined values like 0 and empty string", () => {
    expect(() => assertFound(0, "Not found")).not.toThrow();
    expect(() => assertFound("", "Not found")).not.toThrow();
    expect(() => assertFound(false, "Not found")).not.toThrow();
  });

  it("throws a 404 AppError when the value is null", () => {
    expect(() => assertFound(null, "Card not found")).toThrow(AppError);
    try {
      assertFound(null, "Card not found");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
      expect((error as AppError).message).toBe("Card not found");
    }
  });

  it("throws a 404 AppError when the value is undefined", () => {
    expect(() => assertFound(undefined, "Printing not found")).toThrow(AppError);
  });

  it("narrows the type after the call", () => {
    const value: string | null = "hello";
    assertFound(value, "Not found");
    // TypeScript should narrow value to string here
    expect(value.toUpperCase()).toBe("HELLO");
  });
});

// ---------------------------------------------------------------------------
// assertUpdated
// ---------------------------------------------------------------------------

describe("assertUpdated", () => {
  it("does nothing when rows were updated", () => {
    expect(() => assertUpdated({ numUpdatedRows: 1n }, "Not found")).not.toThrow();
  });

  it("throws a 404 when numUpdatedRows is 0n", () => {
    expect(() => assertUpdated({ numUpdatedRows: 0n }, "Card not found")).toThrow(AppError);
    try {
      assertUpdated({ numUpdatedRows: 0n }, "Card not found");
    } catch (error) {
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
    }
  });

  it("throws a 404 when result is null", () => {
    expect(() => assertUpdated(null, "Not found")).toThrow(AppError);
  });

  it("throws a 404 when result is undefined", () => {
    expect(() => assertUpdated(undefined, "Not found")).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// assertSlugAvailable
// ---------------------------------------------------------------------------

describe("assertSlugAvailable", () => {
  it("does nothing when no existing row was found (null / undefined)", () => {
    expect(() => assertSlugAvailable(null, "foil", "Finish")).not.toThrow();
    expect(() => assertSlugAvailable(undefined, "foil", "Finish")).not.toThrow();
  });

  it("throws a 409 CONFLICT with the entity name and identifier when a row exists", () => {
    expect(() => assertSlugAvailable({ slug: "foil" }, "foil", "Finish")).toThrow(AppError);
    try {
      assertSlugAvailable({ slug: "foil" }, "foil", "Finish");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(409);
      expect((error as AppError).code).toBe(ERROR_CODES.CONFLICT);
      expect((error as AppError).message).toBe(`Finish "foil" already exists`);
    }
  });

  it("uses the supplied entity name and identifier verbatim (e.g. language codes)", () => {
    try {
      assertSlugAvailable({ code: "en" }, "en", "Language");
    } catch (error) {
      expect((error as AppError).message).toBe(`Language "en" already exists`);
    }
  });
});

// ---------------------------------------------------------------------------
// assertValidReorder
// ---------------------------------------------------------------------------

describe("assertValidReorder", () => {
  const rows = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
  const options = {
    keyOf: (row: { slug: string }) => row.slug,
    keyNoun: "slugs",
    unknownLabel: "rarity slugs",
  };

  it("does nothing when the keys are a complete, unique, known permutation", () => {
    expect(() => assertValidReorder(["c", "a", "b"], rows, options)).not.toThrow();
  });

  it("throws a 400 naming the keyNoun on duplicate keys", () => {
    try {
      assertValidReorder(["a", "a", "b"], rows, options);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).code).toBe(ERROR_CODES.BAD_REQUEST);
      expect((error as AppError).message).toBe("Duplicate slugs in reorder list.");
    }
  });

  it("throws a 400 with both counts on a length mismatch", () => {
    try {
      assertValidReorder(["a", "b"], rows, options);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).message).toBe("Expected 3 slugs, got 2.");
    }
  });

  it("throws a 400 naming the unknownLabel and the offending keys", () => {
    try {
      assertValidReorder(["a", "b", "z"], rows, options);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).status).toBe(400);
      expect((error as AppError).message).toBe("Unknown rarity slugs: z");
    }
  });

  it("checks duplicates before length (duplicate of correct length still fails as duplicate)", () => {
    try {
      assertValidReorder(["a", "a", "b"], rows, options);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).message).toBe("Duplicate slugs in reorder list.");
    }
  });

  it("supports id-keyed taxonomies via keyOf", () => {
    const idRows = [{ id: "x" }, { id: "y" }];
    expect(() =>
      assertValidReorder(["y", "x"], idRows, {
        keyOf: (row) => row.id,
        keyNoun: "ids",
        unknownLabel: "marker ids",
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertDeleted
// ---------------------------------------------------------------------------

describe("assertDeleted", () => {
  it("does nothing when rows were deleted", () => {
    expect(() => assertDeleted({ numDeletedRows: 1n }, "Not found")).not.toThrow();
  });

  it("throws a 404 when numDeletedRows is 0n", () => {
    expect(() => assertDeleted({ numDeletedRows: 0n }, "Flag not found")).toThrow(AppError);
    try {
      assertDeleted({ numDeletedRows: 0n }, "Flag not found");
    } catch (error) {
      expect((error as AppError).status).toBe(404);
      expect((error as AppError).code).toBe(ERROR_CODES.NOT_FOUND);
    }
  });

  it("throws a 404 when result is null", () => {
    expect(() => assertDeleted(null, "Not found")).toThrow(AppError);
  });

  it("throws a 404 when result is undefined", () => {
    expect(() => assertDeleted(undefined, "Not found")).toThrow(AppError);
  });
});
