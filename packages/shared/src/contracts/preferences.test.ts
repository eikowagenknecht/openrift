import { describe, expect, it } from "vitest";

import {
  COMPLETION_SCOPE_ARRAY_KEYS,
  COMPLETION_SCOPE_SCALAR_KEYS,
} from "../types/api/preferences.js";
import { completionScopePreferenceSchema } from "./preferences.js";

/**
 * The two tuples are what clients walk to fold a whole scope (into query
 * params, into an "is anything set?" test). A field the schema has but neither
 * tuple lists is invisible to all of them, so these assert the cover is exact
 * and that each key landed in the tuple matching its shape.
 */
describe("completion scope key tuples", () => {
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
