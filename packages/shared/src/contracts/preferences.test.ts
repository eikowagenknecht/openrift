import { describe, expect, it } from "vitest";

import {
  COMPLETION_SCOPE_ARRAY_KEYS,
  COMPLETION_SCOPE_SCALAR_KEYS,
} from "../types/api/preferences.js";
import { completionScopePreferenceSchema } from "./preferences.js";

describe("completion scope key tuples cover every schema field exactly once", () => {
  const schemaKeys = Object.keys(completionScopePreferenceSchema.shape);
  const listedKeys: readonly string[] = [
    ...COMPLETION_SCOPE_ARRAY_KEYS,
    ...COMPLETION_SCOPE_SCALAR_KEYS,
  ];
  const acceptsArray = (key: string) =>
    completionScopePreferenceSchema.safeParse({ [key]: ["a"] }).success;

  it("covers exactly the schema's fields", () => {
    expect(listedKeys.toSorted()).toEqual(schemaKeys.toSorted());
  });

  it("lists every key once, in exactly one tuple", () => {
    expect(new Set(listedKeys).size).toBe(listedKeys.length);
  });

  it("puts every field that takes an array in the array tuple", () => {
    expect(schemaKeys.filter((key) => acceptsArray(key)).toSorted()).toEqual(
      [...COMPLETION_SCOPE_ARRAY_KEYS].toSorted(),
    );
  });

  it("puts no array-valued field in the scalar tuple", () => {
    expect(COMPLETION_SCOPE_SCALAR_KEYS.filter((key) => acceptsArray(key))).toEqual([]);
  });

  it("accepts a scope that sets every array axis at once", () => {
    const scope = Object.fromEntries(COMPLETION_SCOPE_ARRAY_KEYS.map((key) => [key, ["a"]]));
    expect(completionScopePreferenceSchema.safeParse(scope).success).toBe(true);
  });
});
